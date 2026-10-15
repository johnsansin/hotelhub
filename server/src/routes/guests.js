import { Router } from 'express';
import { one, many, sql } from '../db/pool.js';
import { asyncHandler, notFound, parsePaging, listResponse } from '../utils/api.js';
import { crud } from '../db/crud.js';

const r = Router();

const base = await crud({
  table: 'guests',
  resource: 'Guest',
  search: ['first_name', 'last_name', 'email', 'phone', 'city', 'id_number'],
  defaultSort: 'created_at',
  sortable: ['created_at', 'first_name', 'total_stays', 'total_spent', 'vip_tier'],
  select: `guests.*,
    (SELECT count(*)::int FROM bookings b WHERE b.guest_id = guests.id) AS bookings_count,
    (SELECT max(check_in) FROM bookings b WHERE b.guest_id = guests.id) AS last_stay`,
  writable: ['first_name', 'last_name', 'email', 'phone', 'nationality', 'country', 'id_type', 'id_number',
    'address', 'city', 'dob', 'gender', 'vip_tier', 'notes', 'tags', 'is_blacklisted'],
});

r.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    const guest = await one(`SELECT * FROM guests WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!guest) throw notFound('Guest not found');
    const [bookings, payments, spend] = await Promise.all([
      many(
        `SELECT b.*, rt.name AS room_type_name FROM bookings b
           LEFT JOIN room_types rt ON rt.id=b.room_type_id
          WHERE b.guest_id=$1 ORDER BY b.check_in DESC LIMIT 50`,
        [guest.id]
      ),
      many(
        `SELECT p.* FROM payments p JOIN invoices i ON i.id = p.invoice_id
          WHERE i.booking_id IN (SELECT id FROM bookings WHERE guest_id=$1) ORDER BY p.paid_at DESC LIMIT 50`,
        [guest.id]
      ),
      one(
        `SELECT coalesce(sum(total_amount),0) AS total_booked,
                coalesce(sum(paid_amount),0) AS total_paid,
                count(*) FILTER (WHERE status='checked_out')::int AS stays
           FROM bookings WHERE guest_id=$1`,
        [guest.id]
      ),
    ]);
    res.json({ guest, bookings, payments, spend });
  })
);

r.use('/', base);

export default r;
