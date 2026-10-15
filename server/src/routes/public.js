import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, daysBetween, addDays } from '../utils/api.js';
import { nightlyAvailability, roomTypeAvailable, quoteStay } from '../services/availability.js';
import { bookingCode } from '../services/numbering.js';

const r = Router();

async function hotelBySlug(slug) {
  const h = await one(`SELECT * FROM hotels WHERE slug = $1`, [slug]);
  if (!h || !['active', 'trial'].includes(h.status)) throw notFound('Property not found');
  return h;
}

function publicHotel(h) {
  if (!h) return null;
  const {
    settings, created_by, created_at, onboard_step, ...rest
  } = h;
  return rest;
}

// ---------- platform landing data ----------
r.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const rows = await many(`SELECT * FROM plans WHERE is_active ORDER BY sort_order, price_monthly`);
    res.json({ items: rows });
  })
);

r.get(
  '/hotels',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();
    const params = [];
    let where = `status IN ('active','trial')`;
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (name ILIKE $1 OR city ILIKE $1 OR description ILIKE $1)`;
    }
    if (city) {
      params.push(`%${city}%`);
      where += ` AND city ILIKE $${params.length}`;
    }
    const rows = await many(
      `SELECT id, slug, name, tagline, city, state, country, star_rating, cover_url, logo_url,
              currency_symbol, amenities, status,
              (SELECT count(*)::int FROM room_types rt WHERE rt.hotel_id = hotels.id AND rt.is_active) AS room_types,
              (SELECT coalesce(min(base_price),0) FROM room_types rt WHERE rt.hotel_id = hotels.id AND rt.is_active) AS from_price,
              (SELECT round(avg(rating),1) FROM reviews rv WHERE rv.hotel_id = hotels.id AND rv.is_published) AS rating
         FROM hotels
        WHERE ${where}
        ORDER BY name LIMIT 60`,
      params
    );
    res.json({ items: rows });
  })
);

// ---------- plans / pricing page ----------
r.get(
  '/hotels/:slug',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const [roomTypes, reviews, gallery, upcoming] = await Promise.all([
      many(
        `SELECT * FROM room_types WHERE hotel_id=$1 AND is_active ORDER BY sort_order, base_price`,
        [h.id]
      ),
      many(
        `SELECT id, guest_name, rating, category, comment, response, created_at
           FROM reviews WHERE hotel_id=$1 AND is_published ORDER BY created_at DESC LIMIT 12`,
        [h.id]
      ),
      many(`SELECT * FROM hotel_modules WHERE hotel_id=$1 AND module='gallery'`, [h.id]).catch(() => []),
      many(
        `SELECT count(*)::int AS c FROM event_bookings WHERE hotel_id=$1 AND status='confirmed'
           AND start_at > now()`,
        [h.id]
      ),
    ]);

    const counts = await one(
      `SELECT (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND is_active) AS rooms,
              (SELECT count(*)::int FROM room_types WHERE hotel_id=$1 AND is_active) AS room_types,
              (SELECT coalesce(round(avg(rating),1),0) FROM reviews WHERE hotel_id=$1 AND is_published) AS rating,
              (SELECT count(*)::int FROM reviews WHERE hotel_id=$1 AND is_published) AS review_count`,
      [h.id]
    );

    res.json({
      hotel: publicHotel(h),
      room_types: roomTypes,
      reviews,
      gallery: Array.isArray(h.gallery) ? h.gallery : [],
      stats: counts,
      upcoming_events: upcoming[0]?.c || 0,
    });
  })
);

// ---------- room types / rooms ----------
r.get(
  '/hotels/:slug/rooms',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const from = req.query.from || null;
    const to = req.query.to || null;
    const rows = await many(
      `SELECT * FROM room_types WHERE hotel_id=$1 AND is_active ORDER BY sort_order, base_price`,
      [h.id]
    );
    let availability = {};
    if (from && to && daysBetween(from, to) > 0) {
      const nightly = await nightlyAvailability(h.id, from, to);
      for (const n of nightly) {
        for (const [tid, v] of Object.entries(n.byType || {})) {
          availability[tid] = Math.min(availability[tid] ?? 999, v.available);
        }
      }
    }
    res.json({
      items: rows.map((x) => ({ ...x, available: availability[x.id] ?? null })),
      hotel: publicHotel(h),
    });
  })
);

// ---------- availability search ----------
r.get(
  '/hotels/:slug/availability',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) throw badRequest('from and to dates are required');
    if (daysBetween(from, to) < 1) throw badRequest('Check-out must be after check-in');
    const adults = Number(req.query.adults || 2);
    const children = Number(req.query.children || 0);

    const types = await many(
      `SELECT * FROM room_types WHERE hotel_id=$1 AND is_active ORDER BY sort_order, base_price`,
      [h.id]
    );
    const items = [];
    for (const t of types) {
      if (adults > t.max_adults + t.max_children) continue;
      const avail = await roomTypeAvailable(h.id, t.id, from, to);
      if (avail.minAvailable <= 0) continue;
      const quote = await quoteStay(h.id, t.id, from, to, adults, children, req.query.coupon);
      items.push({ ...t, available: avail.minAvailable, quote });
    }
    res.json({
      items,
      from,
      to,
      nights: daysBetween(from, to),
      hotel: publicHotel(h),
    });
  })
);

// ---------- availability calendar ----------
r.get(
  '/hotels/:slug/calendar',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) throw badRequest('from and to dates are required');
    const data = await nightlyAvailability(h.id, from, to, req.query.roomTypeId || null);
    res.json({ items: data, from, to });
  })
);

// ---------- quote ----------
r.post(
  '/hotels/:slug/quote',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const { roomTypeId, from, to, coupon } = req.body || {};
    if (!roomTypeId || !from || !to) throw badRequest('roomTypeId, from and to are required');
    const quote = await quoteStay(h.id, roomTypeId, from, to, req.body.adults, req.body.children, coupon);
    if (!quote) throw notFound('Room type not found');
    const avail = await roomTypeAvailable(h.id, roomTypeId, from, to);
    res.json({ quote, available: avail.minAvailable, canBook: avail.minAvailable > 0 });
  })
);

// ---------- create booking from the website ----------
r.post(
  '/hotels/:slug/bookings',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const b = req.body || {};
    const { roomTypeId, from, to } = b;
    if (!roomTypeId || !from || !to) throw badRequest('roomTypeId, from and to are required');
    const nights = daysBetween(from, to);
    if (nights < 1) throw badRequest('Check-out must be after check-in');
    if (!b.guest?.name && !b.guestName) throw badRequest('Guest name is required');
    const email = String(b.guest?.email || b.email || '').trim();
    const phone = String(b.guest?.phone || b.phone || '').trim();
    if (!phone && !email) throw badRequest('We need a phone or email to confirm your booking');

    const quote = await quoteStay(h.id, roomTypeId, from, to, b.adults, b.children, b.coupon);
    if (!quote) throw notFound('Room type not found');
    const avail = await roomTypeAvailable(h.id, roomTypeId, from, to);
    if (avail.minAvailable <= 0) {
      const alt = await nightlyAvailability(h.id, from, to, roomTypeId);
      throw badRequest(
        `Sorry, no rooms are available for those dates. Next available night: ${
          (alt.find((n) => (n.byType[roomTypeId]?.available ?? 0) > 0) || {}).date || 'please try different dates'
        }`
      );
    }

    const guestName = String(b.guest?.name || b.guestName || '').trim();
    const [first, ...rest] = guestName.split(' ');

    const result = await tx(async (client) => {
      let guestId = null;
      if (email || phone) {
        const g = await tsql(
          client,
          `SELECT id FROM guests WHERE hotel_id=$1 AND (lower(email)=lower($2) OR phone=$3) LIMIT 1`,
          [h.id, email || null, phone || null]
        );
        if (g.rows.length) {
          guestId = g.rows[0].id;
          await tsql(
            client,
            `UPDATE guests SET first_name=COALESCE($2, first_name), last_name=COALESCE($3, last_name),
                    total_stays = total_stays + 1,
                    total_spent = total_spent + $4 WHERE id=$1`,
            [guestId, first || null, rest.join(' ') || null, quote.total]
          );
        }
      }
      if (!guestId) {
        const g = await tsql(
          client,
          `INSERT INTO guests (hotel_id, first_name, last_name, email, phone, country, address, city, total_stays, total_spent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9) RETURNING id`,
          [h.id, first || guestName, rest.join(' ') || null, email || null, phone || null,
            b.guest?.country || null, b.guest?.address || null, b.guest?.city || null, quote.total]
        );
        guestId = g.rows[0].id;
      }

      const code = await bookingCode(h.id);
      const status = b.instantConfirm === false ? 'pending' : 'confirmed';
      const bk = await tsql(
        client,
        `INSERT INTO bookings (hotel_id, code, guest_id, room_type_id, check_in, check_out, nights,
            adults, children, status, source, rate, subtotal, discount, tax, total_amount,
            guest_name, guest_email, guest_phone, special_requests, notes, coupon_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'website',$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [
          h.id, code, guestId, roomTypeId, from, to, quote.nights,
          Number(b.adults || 1), Number(b.children || 0), status,
          quote.rate, quote.subtotal, quote.discount, quote.tax, quote.total,
          guestName, email || null, phone || null,
          b.specialRequests || null, b.notes || null, quote.coupon || null,
        ]
      );
      const booking = bk.rows[0];

      await tsql(
        client,
        `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_name)
         VALUES ($1,$2,'created','Booking created via website','Website guest')`,
        [booking.id, h.id]
      );
      if (quote.coupon) {
        await tsql(client, 'UPDATE coupons SET used_count = used_count + 1 WHERE hotel_id=$1 AND code=$2', [
          h.id, quote.coupon,
        ]);
      }

      // notify hotel admins
      const admins = await tsql(
        client,
        `SELECT id FROM users WHERE hotel_id=$1 AND role IN ('admin','manager','receptionist') AND is_active`,
        [h.id]
      );
      for (const a of admins.rows) {
        await tsql(
          client,
          `INSERT INTO notifications (hotel_id, user_id, title, message, type, link)
           VALUES ($1,$2,'New website booking',$3,'booking','/dashboard/bookings')`,
          [h.id, a.id, `${guestName} booked ${quote.room_type.name} for ${from} → ${to}`]
        );
      }

      const invNo = 'HOLD-' + code;
      return { booking, invoiceNo: invNo };
    });

    res.status(201).json({
      booking: result.booking,
      message: 'Booking confirmed! A confirmation has been recorded.',
    });
  })
);

// ---------- public menu (restaurant) ----------
r.get(
  '/hotels/:slug/menu',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const [cats, items] = await Promise.all([
      many(`SELECT * FROM menu_categories WHERE hotel_id=$1 AND is_active ORDER BY sort_order, name`, [h.id]),
      many(`SELECT * FROM menu_items WHERE hotel_id=$1 AND is_available ORDER BY name`, [h.id]),
    ]);
    res.json({ categories: cats, items, hotel: publicHotel(h) });
  })
);

// ---------- submit review ----------
r.post(
  '/hotels/:slug/reviews',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const { guestName, rating, comment, category, bookingCode: code } = req.body || {};
    if (!guestName || !rating) throw badRequest('Name and rating are required');
    let bookingId = null;
    if (code) {
      const b = await one(`SELECT id FROM bookings WHERE hotel_id=$1 AND code=$2 AND status='checked_out'`, [h.id, code]);
      if (b) bookingId = b.id;
    }
    const row = await one(
      `INSERT INTO reviews (hotel_id, booking_id, guest_name, rating, comment, category)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [h.id, bookingId, guestName, Math.min(5, Math.max(1, Number(rating))), comment || null, category || 'overall']
    );
    res.status(201).json(row);
  })
);

// ---------- coupon validation ----------
r.get(
  '/hotels/:slug/coupons/:code',
  asyncHandler(async (req, res) => {
    const h = await hotelBySlug(req.params.slug);
    const c = await one(
      `SELECT * FROM coupons WHERE hotel_id=$1 AND upper(code)=upper($2) AND is_active
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
      [h.id, req.params.code]
    );
    if (!c || Number(c.used_count) >= Number(c.max_uses)) throw notFound('This coupon is not valid');
    res.json(c);
  })
);

// ---------- check booking status ----------
r.get(
  '/bookings/:code',
  asyncHandler(async (req, res) => {
    // Legacy sequential codes are not safe bearer credentials.
    if (!/^BK[0-9A-F]{32}$/i.test(req.params.code)) throw notFound('Booking not found; contact the hotel for legacy reservations');
    const b = await one(
      `SELECT b.*, h.name AS hotel_name, h.slug AS hotel_slug, rt.name AS room_type_name, r.number AS room_number
         FROM bookings b
         JOIN hotels h ON h.id = b.hotel_id
         LEFT JOIN room_types rt ON rt.id = b.room_type_id
         LEFT JOIN rooms r ON r.id = b.room_id
        WHERE upper(b.code) = upper($1)`,
      [req.params.code]
    );
    if (!b) throw notFound('Booking not found');
    const inv = await many(
      `SELECT i.*, (SELECT coalesce(json_agg(json_build_object('description',ii.description,'category',ii.category,'amount',ii.amount,'qty',ii.qty)), '[]'::json)
           FROM invoice_items ii WHERE ii.invoice_id = i.id) AS items
         FROM invoices i WHERE i.booking_id=$1`,
      [b.id]
    );
    const pays = await many(`SELECT amount, method, paid_at FROM payments WHERE booking_id=$1 ORDER BY paid_at`, [b.id]);
    res.json({ booking: b, invoices: inv, payments: pays });
  })
);

export default r;
