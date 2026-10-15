import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, parsePaging, listResponse } from '../utils/api.js';
import { nightlyAvailability, findFreeRooms, roomTypeAvailable } from '../services/availability.js';

const r = Router();

// ---------------- ROOM TYPES ----------------
r.get(
  '/types',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT rt.*,
              (SELECT count(*)::int FROM rooms rm WHERE rm.room_type_id=rt.id AND rm.is_active) AS actual_rooms,
              (SELECT count(*)::int FROM rooms rm WHERE rm.room_type_id=rt.id AND rm.status='occupied') AS occupied,
              (SELECT count(*)::int FROM bookings b WHERE b.room_type_id=rt.id
                  AND b.status IN ('confirmed','checked_in') AND b.check_in <= CURRENT_DATE AND b.check_out > CURRENT_DATE) AS staying
         FROM room_types rt
        WHERE rt.hotel_id = $1
        ORDER BY rt.sort_order, rt.base_price`,
      [req.hotelId]
    );
    res.json({ items: rows });
  })
);

r.post(
  '/types',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.code) throw badRequest('Name and code are required');
    const row = await one(
      `INSERT INTO room_types (hotel_id, name, code, slug, description, short_desc, base_price, weekend_price,
          peak_price, max_adults, max_children, extra_bed, bed_type, size_sqft, total_rooms, amenities, images,
          image, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [req.hotelId, b.name, b.code, b.slug || null, b.description || null, b.short_desc || null,
        Number(b.base_price || 0), Number(b.weekend_price || 0), Number(b.peak_price || 0),
        Number(b.max_adults || 2), Number(b.max_children || 1), Number(b.extra_bed || 0),
        b.bed_type || 'King', Number(b.size_sqft || 0), Number(b.total_rooms || 0),
        JSON.stringify(b.amenities || []), JSON.stringify(b.images || []), b.image || null,
        Number(b.sort_order || 0), b.is_active !== false]
    );
    res.status(201).json(row);
  })
);

r.put(
  '/types/:id',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const allowed = ['name', 'code', 'slug', 'description', 'short_desc', 'base_price', 'weekend_price',
      'peak_price', 'max_adults', 'max_children', 'extra_bed', 'bed_type', 'size_sqft', 'total_rooms',
      'amenities', 'images', 'image', 'sort_order', 'is_active'];
    const sets = [];
    const p = [req.params.id, req.hotelId];
    for (const k of allowed) {
      if (b[k] !== undefined) {
        p.push(typeof b[k] === 'object' ? JSON.stringify(b[k]) : b[k]);
        sets.push(`"${k}" = $${p.length}`);
      }
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(
      `UPDATE room_types SET ${sets.join(', ')} WHERE id=$1 AND hotel_id=$2 RETURNING *`, p
    );
    if (!row) throw notFound('Room type not found');
    res.json(row);
  })
);

r.delete(
  '/types/:id',
  asyncHandler(async (req, res) => {
    const active = await one(
      `SELECT count(*)::int AS c FROM bookings WHERE room_type_id=$1 AND status IN ('confirmed','checked_in')`,
      [req.params.id]
    );
    if (active.c > 0) throw badRequest('This room type has active bookings');
    const r2 = await sql(`DELETE FROM room_types WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!r2.rowCount) throw notFound('Room type not found');
    res.json({ deleted: true });
  })
);

// ---------------- ROOMS ----------------
r.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 100 });
    const p = [req.hotelId];
    const where = ['rm.hotel_id = $1'];
    if (req.query.status) { p.push(req.query.status); where.push(`rm.status = $${p.length}`); }
    if (req.query.housekeeping) { p.push(req.query.housekeeping); where.push(`rm.housekeeping = $${p.length}`); }
    if (req.query.room_type_id) { p.push(req.query.room_type_id); where.push(`rm.room_type_id = $${p.length}`); }
    const q = String(req.query.q || '').trim();
    if (q) { p.push(`%${q}%`); where.push(`(rm.number ILIKE $${p.length} OR rm.floor ILIKE $${p.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM rooms rm ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT rm.*, rt.name AS room_type_name, rt.base_price,
              (SELECT b.id FROM bookings b WHERE b.room_id=rm.id AND b.status='checked_in' LIMIT 1) AS active_booking_id,
              (SELECT b.code FROM bookings b WHERE b.room_id=rm.id AND b.status='checked_in' LIMIT 1) AS active_booking_code,
              (SELECT b.guest_name FROM bookings b WHERE b.room_id=rm.id AND b.status='checked_in' LIMIT 1) AS guest_name
         FROM rooms rm LEFT JOIN room_types rt ON rt.id = rm.room_type_id
         ${whereSql} ORDER BY rm.number LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.number) throw badRequest('Room number is required');
    const dupe = await one(`SELECT id FROM rooms WHERE hotel_id=$1 AND number=$2`, [req.hotelId, b.number]);
    if (dupe) throw badRequest(`Room ${b.number} already exists`);
    const row = await one(
      `INSERT INTO rooms (hotel_id, room_type_id, number, floor, view, status, housekeeping, features, is_active, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.hotelId, b.room_type_id || null, b.number, b.floor || null, b.view || 'City',
        b.status || 'available', b.housekeeping || 'clean', JSON.stringify(b.features || []),
        b.is_active !== false, b.note || null]
    );
    res.status(201).json(row);
  })
);

// bulk generate rooms: { room_type_id, prefix, from, to, floors }
r.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { room_type_id, prefix = '', from = 101, count = 10, floor } = req.body || {};
    if (!room_type_id) throw badRequest('room_type_id is required');
    const type = await one('SELECT * FROM room_types WHERE id=$1 AND hotel_id=$2', [room_type_id, req.hotelId]);
    if (!type) throw notFound('Room type not found');
    const start = Number(from);
    const n = Math.min(200, Math.max(1, Number(count || 10)));
    const created = [];
    for (let i = 0; i < n; i++) {
      const number = `${prefix}${start + i}`;
      const dupe = await one(`SELECT id FROM rooms WHERE hotel_id=$1 AND number=$2`, [req.hotelId, number]);
      if (dupe) continue;
      const row = await one(
        `INSERT INTO rooms (hotel_id, room_type_id, number, floor, view, status)
         VALUES ($1,$2,$3,$4,$5,'available') RETURNING *`,
        [req.hotelId, room_type_id, number, floor || String(Math.floor((start + i) / 100)), type.name]
      );
      created.push(row);
    }
    res.status(201).json({ created: created.length, items: created });
  })
);

r.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = { ...req.body };
    delete b.id; delete b.hotel_id;
    const allowed = ['room_type_id', 'number', 'floor', 'view', 'status', 'housekeeping', 'features', 'is_active', 'note'];
    const sets = [];
    const p = [req.params.id, req.hotelId];
    for (const k of allowed) {
      if (b[k] !== undefined) {
        p.push(typeof b[k] === 'object' ? JSON.stringify(b[k]) : b[k]);
        sets.push(`"${k}" = $${p.length}`);
      }
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(`UPDATE rooms SET ${sets.join(', ')} WHERE id=$1 AND hotel_id=$2 RETURNING *`, p);
    if (!row) throw notFound('Room not found');
    res.json(row);
  })
);

r.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const busy = await one(
      `SELECT count(*)::int AS c FROM bookings WHERE room_id=$1 AND status IN ('confirmed','checked_in')`,
      [req.params.id]
    );
    if (busy.c > 0) throw badRequest('Room has active bookings — mark it inactive instead');
    const r2 = await sql(`DELETE FROM rooms WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!r2.rowCount) throw notFound('Room not found');
    res.json({ deleted: true });
  })
);

// ---------------- RATE SEASONS ----------------
r.get(
  '/rates',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT rs.*, rt.name AS room_type_name FROM rate_seasons rs
         LEFT JOIN room_types rt ON rt.id = rs.room_type_id
        WHERE rs.hotel_id=$1 ORDER BY rs.start_date DESC`,
      [req.hotelId]
    );
    res.json({ items: rows });
  })
);

r.post(
  '/rates',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.room_type_id || !b.name || !b.start_date || !b.end_date || b.price === undefined) {
      throw badRequest('name, room type, dates and price are required');
    }
    const row = await one(
      `INSERT INTO rate_seasons (hotel_id, room_type_id, name, start_date, end_date, price, min_stay, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.hotelId, b.room_type_id, b.name, b.start_date, b.end_date, Number(b.price),
        Number(b.min_stay || 1), b.is_active !== false]
    );
    res.status(201).json(row);
  })
);

r.delete(
  '/rates/:id',
  asyncHandler(async (req, res) => {
    const r2 = await sql(`DELETE FROM rate_seasons WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!r2.rowCount) throw notFound('Rate plan not found');
    res.json({ deleted: true });
  })
);

// ---------------- BLOCKS ----------------
r.get(
  '/blocks',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT rb.*, rm.number AS room_number, rt.name AS room_type_name
         FROM room_blocks rb
         LEFT JOIN rooms rm ON rm.id = rb.room_id
         LEFT JOIN room_types rt ON rt.id = COALESCE(rb.room_type_id, rm.room_type_id)
        WHERE rb.hotel_id=$1 ORDER BY rb.start_date DESC`,
      [req.hotelId]
    );
    res.json({ items: rows });
  })
);

r.post(
  '/blocks',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.start_date || !b.end_date) throw badRequest('Dates are required');
    if (!b.room_id && !b.room_type_id) throw badRequest('Select a room or a room type');
    const row = await one(
      `INSERT INTO room_blocks (hotel_id, room_id, room_type_id, start_date, end_date, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.hotelId, b.room_id || null, b.room_type_id || null, b.start_date, b.end_date,
        b.reason || 'Maintenance', req.user.id]
    );
    res.status(201).json(row);
  })
);

r.delete(
  '/blocks/:id',
  asyncHandler(async (req, res) => {
    const r2 = await sql(`DELETE FROM room_blocks WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!r2.rowCount) throw notFound('Block not found');
    res.json({ deleted: true });
  })
);

// ---------------- AVAILABILITY ----------------
r.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) throw badRequest('from and to are required');
    const items = await nightlyAvailability(req.hotelId, from, to, req.query.room_type_id || null);
    const summary = await many(
      `SELECT status, count(*)::int AS c FROM rooms WHERE hotel_id=$1 AND is_active GROUP BY status`,
      [req.hotelId]
    );
    res.json({ items, room_status: Object.fromEntries(summary.map((s) => [s.status, s.c])) });
  })
);

r.get(
  '/free-rooms',
  asyncHandler(async (req, res) => {
    const { room_type_id, from, to, booking_id } = req.query;
    if (!from || !to) throw badRequest('from and to are required');
    const items = await findFreeRooms(req.hotelId, room_type_id || null, from, to, booking_id || null);
    res.json({ items });
  })
);

export default r;
