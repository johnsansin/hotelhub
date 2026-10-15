import { Router } from 'express';
import { one, many, sql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging, todayStr } from '../utils/api.js';
import { crud } from '../db/crud.js';

const r = Router();

// ---------------- TODAY / ARRIVALS / DEPARTURES ----------------
r.get(
  '/today',
  asyncHandler(async (req, res) => {
    const date = req.query.date || todayStr();
    const [arrivals, departures, inHouse, summary, tasks] = await Promise.all([
      many(
        `SELECT b.id, b.code, b.guest_name, b.guest_phone, b.check_in, b.check_out, b.adults, b.children,
                b.status, b.total_amount, b.paid_amount, b.source, b.special_requests, rt.name AS room_type_name,
                b.room_number, b.room_id
           FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
          WHERE b.hotel_id=$1 AND b.check_in=$2::date AND b.status IN ('pending','confirmed')
          ORDER BY b.created_at`,
        [req.hotelId, date]
      ),
      many(
        `SELECT b.id, b.code, b.guest_name, b.guest_phone, b.check_in, b.check_out, b.status,
                b.total_amount, b.paid_amount, b.room_number, b.room_id, rt.name AS room_type_name,
                (SELECT coalesce(sum(total - paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due
           FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
          WHERE b.hotel_id=$1 AND b.check_out=$2::date AND b.status IN ('checked_in','confirmed')
          ORDER BY b.checked_out_at NULLS LAST`,
        [req.hotelId, date]
      ),
      many(
        `SELECT b.*, rt.name AS room_type_name,
                (SELECT coalesce(sum(total - paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due
           FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
          WHERE b.hotel_id=$1 AND b.status='checked_in' ORDER BY b.room_number`,
        [req.hotelId]
      ),
      one(
        `SELECT
           (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND is_active) AS total_rooms,
           (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='occupied') AS occupied,
           (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='cleaning') AS cleaning,
           (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status IN ('maintenance','out_of_order','blocked')) AS ooo,
           (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND check_in=$2::date AND status IN ('pending','confirmed')) AS arrivals,
           (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND check_out=$2::date AND status='checked_in') AS departures,
           (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status='checked_in') AS in_house`,
        [req.hotelId, date]
      ),
      many(
        `SELECT hk.*, rm.number AS room_number FROM housekeeping_tasks hk
           LEFT JOIN rooms rm ON rm.id=hk.room_id
          WHERE hk.hotel_id=$1 AND hk.status IN ('pending','in_progress')
          ORDER BY hk.priority DESC, hk.created_at LIMIT 20`,
        [req.hotelId]
      ),
    ]);
    res.json({ date, arrivals, departures, in_house: inHouse, summary, tasks });
  })
);

// ---------------- ROOM BOARD ----------------
r.get(
  '/room-board',
  asyncHandler(async (req, res) => {
    const date = req.query.date || todayStr();
    const rows = await many(
      `SELECT rm.id, rm.number, rm.floor, rm.status, rm.housekeeping, rm.view, rm.note,
              rt.name AS room_type_name, rt.id AS room_type_id, rt.base_price,
              b.id AS booking_id, b.code, b.guest_name, b.check_in, b.check_out, b.status AS booking_status,
              b.paid_amount, b.total_amount,
              hk.status AS hk_status, hk.type AS hk_task
         FROM rooms rm
         LEFT JOIN room_types rt ON rt.id = rm.room_type_id
         LEFT JOIN LATERAL (
            SELECT * FROM bookings b2 WHERE b2.room_id = rm.id AND b2.status='checked_in' LIMIT 1
         ) b ON true
         LEFT JOIN LATERAL (
            SELECT * FROM housekeeping_tasks h2 WHERE h2.room_id = rm.id
              AND h2.status IN ('pending','in_progress') ORDER BY h2.created_at DESC LIMIT 1
         ) hk ON true
        WHERE rm.hotel_id = $1
        ORDER BY rm.floor NULLS FIRST, rm.number`,
      [req.hotelId]
    );
    const upcoming = await many(
      `SELECT id, code, guest_name, check_in, check_out, room_number, room_id, room_type_id, status, special_requests
         FROM bookings WHERE hotel_id=$1 AND check_in >= $2 AND status IN ('pending','confirmed')
        ORDER BY check_in LIMIT 30`,
      [req.hotelId, date]
    );
    res.json({ items: rows, upcoming });
  })
);

// ---------------- QUICK ACTIONS ----------------
r.post(
  '/mark-clean',
  asyncHandler(async (req, res) => {
    const { room_id, status = 'clean' } = req.body || {};
    if (!room_id) throw badRequest('room_id is required');
    await sql(`UPDATE rooms SET housekeeping=$3, status = CASE WHEN status='cleaning' THEN 'available' ELSE status END
                WHERE id=$1 AND hotel_id=$2`, [room_id, req.hotelId, status]);
    await sql(
      `UPDATE housekeeping_tasks SET status='done', completed_at=now()
        WHERE room_id=$1 AND hotel_id=$2 AND status IN ('pending','in_progress')`,
      [room_id, req.hotelId]
    );
    res.json({ ok: true });
  })
);

r.post(
  '/room-status',
  asyncHandler(async (req, res) => {
    const { room_id, status } = req.body || {};
    const allowed = ['available', 'occupied', 'cleaning', 'maintenance', 'blocked', 'out_of_order'];
    if (!room_id || !allowed.includes(status)) throw badRequest('room_id and valid status are required');
    const row = await one(
      `UPDATE rooms SET status=$3 WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      [room_id, req.hotelId, status]
    );
    if (!row) throw notFound('Room not found');
    res.json(row);
  })
);

// ---------------- HOUSEKEEPING TASKS ----------------
const housekeeping = await crud({
  table: 'housekeeping_tasks',
  resource: 'Housekeeping task',
  search: ['type', 'notes', 'status'],
  defaultSort: 'created_at',
  select: `housekeeping_tasks.*, rooms.number AS room_number, users.name AS assigned_name`,
  joins: 'LEFT JOIN rooms ON rooms.id = housekeeping_tasks.room_id LEFT JOIN users ON users.id = housekeeping_tasks.assigned_to',
  writable: ['room_id', 'booking_id', 'type', 'priority', 'status', 'assigned_to', 'notes', 'due_at'],
  async custom(router) {
    router.post('/:id/start', asyncHandler(async (req, res) => {
      const row = await one(
        `UPDATE housekeeping_tasks SET status='in_progress', started_at=coalesce(started_at, now())
          WHERE id=$1 AND hotel_id=$2 RETURNING *`, [req.params.id, req.hotelId]);
      if (!row) throw notFound('Task not found');
      res.json(row);
    }));
    router.post('/:id/complete', asyncHandler(async (req, res) => {
      const row = await one(
        `UPDATE housekeeping_tasks SET status='done', completed_at=now()
          WHERE id=$1 AND hotel_id=$2 RETURNING *`, [req.params.id, req.hotelId]);
      if (!row) throw notFound('Task not found');
      if (row.room_id) {
        await sql(`UPDATE rooms SET housekeeping='clean', status=CASE WHEN status='cleaning' THEN 'available' ELSE status END WHERE id=$1`, [row.room_id]);
      }
      res.json(row);
    }));
  },
});
r.use('/housekeeping', housekeeping);

// ---------------- MAINTENANCE ----------------
const maintenance = await crud({
  table: 'maintenance_tasks',
  resource: 'Maintenance task',
  search: ['title', 'description', 'category', 'status'],
  defaultSort: 'created_at',
  select: `maintenance_tasks.*, rooms.number AS room_number, users.name AS assigned_name`,
  joins: 'LEFT JOIN rooms ON rooms.id = maintenance_tasks.room_id LEFT JOIN users ON users.id = maintenance_tasks.assigned_to',
  writable: ['room_id', 'title', 'description', 'category', 'priority', 'status', 'cost', 'vendor',
    'assigned_to', 'due_date', 'reported_by'],
  beforeWrite(body, req, mode) {
    if (mode === 'create') {
      body.reported_by = req.user.id;
      if (body.status === 'resolved') body.resolved_at = new Date();
    }
    if (body.status === 'resolved') body.resolved_at = new Date();
    return body;
  },
  async custom(router) {
    router.post('/:id/status', asyncHandler(async (req, res) => {
      const { status } = req.body || {};
      const allowed = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];
      if (!allowed.includes(status)) throw badRequest('Invalid status');
      const row = await one(
        `UPDATE maintenance_tasks SET status=$3, resolved_at = CASE WHEN $3='resolved' THEN now() ELSE resolved_at END
          WHERE id=$1 AND hotel_id=$2 RETURNING *`, [req.params.id, req.hotelId, status]);
      if (!row) throw notFound('Task not found');
      if (status === 'resolved' && row.room_id) {
        await sql(`UPDATE rooms SET status='available' WHERE id=$1 AND status IN ('maintenance','out_of_order')`, [row.room_id]);
      }
      res.json(row);
    }));
  },
});
r.use('/maintenance', maintenance);

// ---------------- FOUND & LOST ----------------
const foundLost = await crud({
  table: 'found_lost_items',
  resource: 'Item',
  search: ['item_name', 'description', 'location', 'guest_name', 'category'],
  defaultSort: 'found_date',
  sortable: ['found_date', 'created_at', 'status', 'item_name', 'value'],
  writable: ['item_name', 'description', 'category', 'location', 'found_date', 'found_by', 'value',
    'status', 'guest_name', 'booking_id', 'claimant', 'claim_date', 'image', 'notes', 'created_by'],
  beforeWrite(body, req, mode) {
    if (mode === 'create') {
      body.created_by = req.user.id;
      if (!body.found_date) body.found_date = todayStr();
    }
    if (body.status === 'returned' || body.status === 'claimed') {
      if (!body.claim_date) body.claim_date = todayStr();
    }
    return body;
  },
});
r.use('/found-lost', foundLost);

export default r;
