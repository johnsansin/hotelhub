import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging, addDays, daysBetween } from '../utils/api.js';
import { quoteStay, findFreeRooms, roomTypeAvailable, nightlyAvailability } from '../services/availability.js';
import { docNo } from '../services/numbering.js';
import { postJournal } from '../services/accounting.js';

const r = Router();

const LIST_SELECT = `
  b.*, rt.name AS room_type_name, rm.number AS room_no, g.email AS guest_email2, g.phone AS guest_phone2,
  (SELECT count(*)::int FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
     WHERE i.booking_id=b.id) AS charge_items`;

const LIST_JOINS = `
  LEFT JOIN room_types rt ON rt.id = b.room_type_id
  LEFT JOIN rooms rm ON rm.id = b.room_id
  LEFT JOIN guests g ON g.id = b.guest_id`;

// ---------------- LIST ----------------
r.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset, sort, dir } = parsePaging(req, { defaultLimit: 25 });
    const p = [req.hotelId];
    const where = ['b.hotel_id = $1'];

    if (req.query.status) {
      if (req.query.status === 'active') {
        where.push(`b.status IN ('confirmed','checked_in')`);
      } else {
        p.push(req.query.status);
        where.push(`b.status = $${p.length}`);
      }
    }
    if (req.query.source) { p.push(req.query.source); where.push(`b.source = $${p.length}`); }
    if (req.query.room_type_id) { p.push(req.query.room_type_id); where.push(`b.room_type_id = $${p.length}`); }
    if (req.query.room_id) { p.push(req.query.room_id); where.push(`b.room_id = $${p.length}`); }
    if (req.query.date) {
      p.push(req.query.date);
      where.push(`$${p.length}::date BETWEEN b.check_in AND b.check_out - 1`);
    }
    if (req.query.arrivals) {
      p.push(req.query.arrivals);
      where.push(`b.check_in = $${p.length}::date`);
    }
    if (req.query.departures) {
      p.push(req.query.departures);
      where.push(`b.check_out = $${p.length}::date`);
    }
    if (req.query.from) { p.push(req.query.from); where.push(`b.check_out > $${p.length}::date`); }
    if (req.query.to) { p.push(req.query.to); where.push(`b.check_in <= $${p.length}::date`); }
    const q = String(req.query.q || '').trim();
    if (q) {
      p.push(`%${q}%`);
      where.push(`(b.code ILIKE $${p.length} OR b.guest_name ILIKE $${p.length}
                   OR b.guest_phone ILIKE $${p.length} OR b.guest_email ILIKE $${p.length}
                   OR b.room_number ILIKE $${p.length})`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM bookings b ${whereSql}`, p)).rows[0].c;
    const allowed = ['created_at', 'check_in', 'check_out', 'total_amount', 'status', 'guest_name'];
    const sortCol = allowed.includes(req.query.sort) ? `b.${req.query.sort}` : 'b.created_at';
    const rows = await many(
      `SELECT ${LIST_SELECT} FROM bookings b ${LIST_JOINS} ${whereSql}
        ORDER BY ${sortCol} ${dir === 'ASC' ? 'ASC' : 'DESC'} NULLS LAST
        LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

// ---------------- STATS (chips on the bookings page) ----------------
r.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT status, count(*)::int AS c FROM bookings WHERE hotel_id=$1 GROUP BY status`,
      [req.hotelId]
    );
    const out = { pending: 0, confirmed: 0, checked_in: 0, checked_out: 0, cancelled: 0, no_show: 0, total: 0 };
    for (const row of rows) { out[row.status] = row.c; out.total += row.c; }
    res.json(out);
  })
);

// ---------------- DETAIL ----------------
r.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const booking = await one(
      `SELECT b.*, rt.name AS room_type_name, rt.amenities AS room_amenities, rm.number AS room_no, rm.floor AS room_floor,
              h.tax_rate, h.service_charge, h.check_in_time, h.check_out_time, h.name AS hotel_name
         FROM bookings b
         LEFT JOIN room_types rt ON rt.id = b.room_type_id
         LEFT JOIN rooms rm ON rm.id = b.room_id
         LEFT JOIN guests g ON g.id = b.guest_id
         LEFT JOIN hotels h ON h.id = b.hotel_id
        WHERE b.id = $1 AND b.hotel_id = $2`,
      [req.params.id, req.hotelId]
    );
    if (!booking) throw notFound('Booking not found');

    const guest = booking.guest_id
      ? await one(`SELECT * FROM guests WHERE id=$1`, [booking.guest_id])
      : null;
    const [invoices, payments, logs, occupants, charges] = await Promise.all([
      many(
        `SELECT i.*, (SELECT coalesce(json_agg(json_build_object(
             'id',ii.id,'description',ii.description,'category',ii.category,'qty',ii.qty,
             'rate',ii.rate,'amount',ii.amount)), '[]'::json)
             FROM invoice_items ii WHERE ii.invoice_id = i.id) AS items
           FROM invoices i WHERE i.booking_id=$1 ORDER BY i.created_at DESC`,
        [booking.id]
      ),
      many(`SELECT p.*, u.name AS received_by_name FROM payments p
             LEFT JOIN users u ON u.id=p.received_by WHERE p.booking_id=$1 ORDER BY p.paid_at DESC`,
        [booking.id]),
      many(`SELECT * FROM booking_logs WHERE booking_id=$1 ORDER BY created_at DESC`, [booking.id]),
      many(`SELECT * FROM booking_guests WHERE booking_id=$1`, [booking.id]),
      many(
        `SELECT ii.*, i.invoice_no FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
          WHERE i.booking_id=$1 AND ii.category <> 'room' ORDER BY ii.created_at DESC`,
        [booking.id]
      ),
    ]);

    res.json({ booking, guest, invoices, payments, logs, occupants, charges });
  })
);

async function resolveGuest(client, hotelId, data) {
  const g = data.guest || {};
  if (data.guest_id) {
    const row = await tsql(client, 'SELECT id FROM guests WHERE id=$1 AND hotel_id=$2', [data.guest_id, hotelId]);
    if (row.rows.length) return row.rows[0].id;
  }
  const email = g.email || data.guest_email || null;
  const phone = g.phone || data.guest_phone || null;
  if (email || phone) {
    const found = await tsql(
      client,
      `SELECT id FROM guests WHERE hotel_id=$1 AND (($2::text IS NOT NULL AND lower(email)=lower($2))
              OR ($3::text IS NOT NULL AND phone=$3)) LIMIT 1`,
      [hotelId, email, phone]
    );
    if (found.rows.length) {
      await tsql(client, `UPDATE guests SET total_stays=total_stays+1 WHERE id=$1`, [found.rows[0].id]);
      return found.rows[0].id;
    }
  }
  const name = String(g.name || data.guest_name || 'Guest').trim();
  const [first, ...rest] = name.split(' ');
  const ins = await tsql(
    client,
    `INSERT INTO guests (hotel_id, first_name, last_name, email, phone, nationality, country,
        id_type, id_number, address, city, gender, dob, notes, total_stays)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1) RETURNING id`,
    [hotelId, first, rest.join(' ') || null, email, phone, g.nationality || null, g.country || null,
      g.id_type || null, g.id_number || null, g.address || null, g.city || null, g.gender || null,
      g.dob || null, g.notes || null]
  );
  return ins.rows[0].id;
}

// ---------------- CREATE ----------------
r.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = req.body || {};
    const { roomTypeId, from, to } = d;
    if (!roomTypeId) throw badRequest('Room type is required');
    if (!from || !to) throw badRequest('Check-in and check-out dates are required');
    const nights = daysBetween(from, to);
    if (nights < 1) throw badRequest('Check-out must be after check-in');
    const guestName = String(d.guest_name || d.guest?.name || '').trim();
    if (!guestName) throw badRequest('Guest name is required');

    const hotel = await one('SELECT tax_rate, service_charge FROM hotels WHERE id=$1', [req.hotelId]);
    const quote = d.manualPricing
      ? {
          nights,
          rate: Number(d.rate || 0),
          subtotal: Number(d.rate || 0) * nights,
          discount: Number(d.discount || 0),
          tax: Number(d.tax || 0),
          service: 0,
          total: Number(d.rate || 0) * nights - Number(d.discount || 0) + Number(d.tax || 0),
          room_type: await one('SELECT * FROM room_types WHERE id=$1 AND hotel_id=$2', [roomTypeId, req.hotelId]),
        }
      : await quoteStay(req.hotelId, roomTypeId, from, to, d.adults, d.children, d.coupon_code);
    if (!quote) throw notFound('Room type not found');

    if (!d.skipAvailability) {
      const avail = await roomTypeAvailable(req.hotelId, roomTypeId, from, to);
      if (avail.minAvailable <= 0) throw badRequest('No rooms available for the selected dates');
    }

    const booking = await tx(async (client) => {
      const guestId = await resolveGuest(client, req.hotelId, d);
      const code = await docNo(client, req.hotelId, 'booking', 'BK', 5);
      const status = ['pending', 'confirmed', 'checked_in'].includes(d.status) ? d.status : 'confirmed';

      const bk = await tsql(
        client,
        `INSERT INTO bookings (hotel_id, code, guest_id, room_type_id, check_in, check_out, nights,
            adults, children, status, source, rate, subtotal, discount, tax, total_amount, advance,
            guest_name, guest_email, guest_phone, special_requests, internal_notes, coupon_code, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         RETURNING *`,
        [
          req.hotelId, code, guestId, roomTypeId, from, to, quote.nights,
          Number(d.adults || 1), Number(d.children || 0), status,
          d.source || 'reception', quote.rate || quote.subtotal / quote.nights,
          quote.subtotal, quote.discount, quote.tax, quote.total, Number(d.advance || 0),
          guestName, d.guest?.email || d.guest_email || null, d.guest?.phone || d.guest_phone || null,
          d.special_requests || null, d.internal_notes || null, quote.coupon || null, req.user.id,
        ]
      );
      const row = bk.rows[0];

      for (const occ of d.occupants || []) {
        if (!occ.name) continue;
        await tsql(
          client,
          `INSERT INTO booking_guests (booking_id, name, relation, id_type, id_number, phone, age)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [row.id, occ.name, occ.relation || 'Guest', occ.id_type || null, occ.id_number || null,
            occ.phone || null, occ.age || null]
        );
      }

      await tsql(
        client,
        `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
         VALUES ($1,$2,'created',$3,$4,$5)`,
        [row.id, req.hotelId, `Booking created via ${d.source || 'reception'} · ${quote.nights} night(s)`, req.user.id, req.user.name]
      );

      if (Number(d.advance) > 0) {
        const invNo = await docNo(client, req.hotelId, 'invoice', 'INV', 5);
        const inv = await tsql(
          client,
          `INSERT INTO invoices (hotel_id, booking_id, invoice_no, type, party_name, party_email, party_phone,
              sub_total, tax, total, paid, status)
           VALUES ($1,$2,$3,'stay',$4,$5,$6,$7,$8,$8,$8,'paid') RETURNING *`,
          [req.hotelId, row.id, invNo, guestName, row.guest_email, row.guest_phone, Number(d.advance), quote.tax]
        );
        await tsql(
          client,
          `INSERT INTO invoice_items (invoice_id, hotel_id, description, category, qty, rate, amount, tax)
           VALUES ($1,$2,$3,'room',$4,$5,$6,$7)`,
          [inv.rows[0].id, req.hotelId, `Advance for booking ${code}`, 1, Number(d.advance), Number(d.advance), quote.tax]
        );
        await tsql(
          client,
          `INSERT INTO payments (hotel_id, invoice_id, booking_id, amount, method, reference, notes, received_by)
           VALUES ($1,$2,$3,$4,$5,$6,'Advance payment',$7)`,
          [req.hotelId, inv.rows[0].id, row.id, Number(d.advance), d.payment_method || 'cash',
            d.payment_reference || null, req.user.id]
        );
        await postJournal(client, {
          hotelId: req.hotelId,
          date: from,
          refType: 'payment',
          refId: inv.rows[0].id,
          memo: `Advance ${code}`,
          createdBy: req.user.id,
          lines: [
            { code: '1000', debit: Number(d.advance), credit: 0 },
            { code: '2020', debit: 0, credit: Number(d.advance) },
          ],
        });
      }
      return row;
    });

    res.status(201).json(booking);
  })
);

// ---------------- UPDATE ----------------
r.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = { ...req.body };
    delete d.id; delete d.hotel_id; delete d.status;
    const allowed = ['check_in', 'check_out', 'nights', 'adults', 'children', 'rate', 'subtotal',
      'discount', 'tax', 'total_amount', 'guest_name', 'guest_email', 'guest_phone',
      'special_requests', 'internal_notes', 'room_type_id', 'source', 'room_number'];
    const sets = [];
    const p = [req.params.id, req.hotelId];
    for (const k of allowed) {
      if (d[k] !== undefined) { p.push(d[k]); sets.push(`${k} = $${p.length}`); }
    }
    if (d.check_in && d.check_out && daysBetween(d.check_in, d.check_out) < 1) {
      throw badRequest('Check-out must be after check-in');
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(
      `UPDATE bookings SET ${sets.join(', ')} WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      p
    );
    if (!row) throw notFound('Booking not found');
    await sql(
      `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
       VALUES ($1,$2,'updated','Booking details updated',$3,$4)`,
      [row.id, req.hotelId, req.user.id, req.user.name]
    );
    res.json(row);
  })
);

async function ensureFolio(client, hotelId, booking) {
  const existing = await tsql(
    client,
    `SELECT * FROM invoices WHERE booking_id=$1 AND type='stay' ORDER BY created_at LIMIT 1`,
    [booking.id]
  );
  if (existing.rows.length) return existing.rows[0];
  const invNo = await docNo(client, hotelId, 'invoice', 'INV', 5);
  const inv = await tsql(
    client,
    `INSERT INTO invoices (hotel_id, booking_id, invoice_no, type, party_name, party_email, party_phone,
        sub_total, tax, total, status)
     VALUES ($1,$2,$3,'stay',$4,$5,$6,0,0,0,'unpaid') RETURNING *`,
    [hotelId, booking.id, invNo, booking.guest_name, booking.guest_email, booking.guest_phone]
  );
  return inv.rows[0];
}

async function refreshFolioTotals(client, invoiceId) {
  const agg = await tsql(
    client,
    `SELECT coalesce(sum(amount),0) AS sub, coalesce(sum(tax),0) AS tax FROM invoice_items WHERE invoice_id=$1`,
    [invoiceId]
  );
  const sub = Number(agg.rows[0].sub);
  const tax = Number(agg.rows[0].tax);
  const paidRow = await tsql(client, `SELECT coalesce(sum(amount),0) AS p FROM payments WHERE invoice_id=$1`, [invoiceId]);
  const paid = Number(paidRow.rows[0].p);
  const total = sub + tax;
  const status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  const inv = await tsql(
    client,
    `UPDATE invoices SET sub_total=$2, tax=$3, total=$4, paid=$5, status=$6 WHERE id=$1 RETURNING *`,
    [invoiceId, sub, tax, total, paid, status]
  );
  return inv.rows[0];
}

// ---------------- CHECK-IN ----------------
r.post(
  '/:id/check-in',
  asyncHandler(async (req, res) => {
    const booking = await one(
      `SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]
    );
    if (!booking) throw notFound('Booking not found');
    if (!['confirmed', 'pending'].includes(booking.status)) {
      throw badRequest(`Cannot check in a booking with status "${booking.status}"`);
    }

    const out = await tx(async (client) => {
      let roomId = req.body?.room_id || booking.room_id;
      if (roomId) {
        const clash = await tsql(
          client,
          `SELECT 1 FROM bookings WHERE room_id=$1 AND id<>$2 AND status IN ('confirmed','checked_in')
             AND check_in < $4 AND check_out > $3`,
          [roomId, booking.id, booking.check_in, booking.check_out]
        );
        if (clash.rows.length) throw badRequest('That room is already reserved for these dates');
      } else {
        const free = await findFreeRooms(req.hotelId, booking.room_type_id, booking.check_in, booking.check_out, booking.id);
        const usable = free.filter((f) => f.status === 'available' || f.status === 'cleaning');
        if (!usable.length) throw badRequest('No free rooms of this type are available to assign');
        roomId = usable[0].id;
      }

      const room = await one('SELECT * FROM rooms WHERE id=$1 AND hotel_id=$2', [roomId, req.hotelId]);
      if (!room) throw badRequest('Invalid room');

      const folio = await ensureFolio(client, req.hotelId, booking);
      const taxRate = Number((await tsql(client, 'SELECT tax_rate FROM hotels WHERE id=$1', [req.hotelId])).rows[0].tax_rate);
      const amount = booking.nights * Number(booking.rate);
      const tax = Math.round((amount * taxRate + Number.EPSILON) * 100) / 100;
      await tsql(
        client,
        `INSERT INTO invoice_items (invoice_id, hotel_id, description, category, qty, rate, amount, tax)
         VALUES ($1,$2,$3,'room',$4,$5,$6,$7)`,
        [folio.id, req.hotelId, `Room charge · ${room.number} · ${booking.nights} night(s)`,
          booking.nights, booking.rate, amount, tax]
      );
      const inv = await refreshFolioTotals(client, folio.id);

      const updated = await tsql(
        client,
        `UPDATE bookings SET status='checked_in', room_id=$3, room_number=$4, checked_in_at=now(),
                total_amount=$5, paid_amount=$6
          WHERE id=$1 AND hotel_id=$2 RETURNING *`,
        [booking.id, req.hotelId, room.id, room.number, inv.total, inv.paid]
      );
      await tsql(client, `UPDATE rooms SET status='occupied', housekeeping='dirty' WHERE id=$1`, [room.id]);
      await tsql(
        client,
        `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
         VALUES ($1,$2,'checked_in',$3,$4,$5)`,
        [booking.id, req.hotelId, `Checked into room ${room.number}`, req.user.id, req.user.name]
      );
      await tsql(
        client,
        `INSERT INTO housekeeping_tasks (hotel_id, room_id, booking_id, type, priority, status, created_by, notes)
         VALUES ($1,$2,$3,'clean','high','pending',$4,'Turnover after check-in')`,
        [req.hotelId, room.id, booking.id, req.user.id]
      );
      return { booking: updated.rows[0], invoice: inv, room };
    });

    res.json(out);
  })
);

// ---------------- CHECK-OUT ----------------
r.post(
  '/:id/check-out',
  asyncHandler(async (req, res) => {
    const booking = await one(`SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!booking) throw notFound('Booking not found');
    if (booking.status !== 'checked_in') throw badRequest('Guest is not checked in');
    const settle = req.body?.settle !== false;

    const out = await tx(async (client) => {
      const invRows = await tsql(client, `SELECT * FROM invoices WHERE booking_id=$1 AND type='stay'`, [booking.id]);
      let inv = invRows.rows[0];
      if (!inv) inv = await ensureFolio(client, req.hotelId, booking);
      const finalInv = await refreshFolioTotals(client, inv.id);

      const updated = await tsql(
        client,
        `UPDATE bookings SET status='checked_out', checked_out_at=now(), paid_amount=$3, total_amount=$4
          WHERE id=$1 AND hotel_id=$2 RETURNING *`,
        [booking.id, req.hotelId, finalInv.paid, finalInv.total]
      );

      if (booking.room_id) {
        await tsql(client, `UPDATE rooms SET status='cleaning', housekeeping='dirty' WHERE id=$1`, [booking.room_id]);
        await tsql(
          client,
          `INSERT INTO housekeeping_tasks (hotel_id, room_id, type, priority, status, created_by, notes)
           VALUES ($1,$2,'clean','high','pending',$3,'Checkout turnover')`,
          [req.hotelId, booking.room_id, req.user.id]
        );
      }

      await tsql(
        client,
        `UPDATE guests SET total_stays = total_stays + 1,
                total_spent = total_spent + $3 WHERE id=$2 AND $1::uuid IS NOT NULL`,
        [booking.guest_id, booking.guest_id, finalInv.total]
      );

      // revenue journal
      const rev = Number(finalInv.sub_total || 0);
      const tax = Number(finalInv.tax || 0);
      const paidAmt = Number(finalInv.paid || 0);
      if (rev > 0 && settle) {
        const lines = [
          { code: '4000', debit: 0, credit: rev },
          { code: '2010', debit: 0, credit: tax },
        ];
        if (paidAmt > 0) lines.push({ code: '1000', debit: paidAmt, credit: 0 });
        const due = Number(finalInv.total) - paidAmt;
        if (due > 0) lines.push({ code: '1020', debit: due, credit: 0 });
        await postJournal(client, {
          hotelId: req.hotelId,
          date: new Date().toISOString().slice(0, 10),
          refType: 'invoice',
          refId: finalInv.id,
          memo: `Stay revenue · ${booking.code}`,
          createdBy: req.user.id,
          lines,
        });
        if (due > 0) {
          await tsql(client, `UPDATE invoices SET status='partial' WHERE id=$1`, [finalInv.id]);
        }
      }

      await tsql(
        client,
        `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
         VALUES ($1,$2,'checked_out',$3,$4,$5)`,
        [booking.id, req.hotelId,
          `Checked out · Folio ${finalInv.invoice_no} · Total ₹${finalInv.total} · Paid ₹${finalInv.paid}`,
          req.user.id, req.user.name]
      );
      return { booking: updated.rows[0], invoice: finalInv };
    });

    res.json(out);
  })
);

// ---------------- CANCEL / NO-SHOW ----------------
r.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const reason = req.body?.reason || 'Cancelled';
    const row = await one(
      `UPDATE bookings SET status='cancelled', cancelled_at=now(), cancel_reason=$3
        WHERE id=$1 AND hotel_id=$2 AND status IN ('pending','confirmed') RETURNING *`,
      [req.params.id, req.hotelId, reason]
    );
    if (!row) throw badRequest('This booking cannot be cancelled');
    await sql(
      `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
       VALUES ($1,$2,'cancelled',$3,$4,$5)`,
      [row.id, req.hotelId, reason, req.user.id, req.user.name]
    );
    res.json(row);
  })
);

r.post(
  '/:id/no-show',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE bookings SET status='no_show' WHERE id=$1 AND hotel_id=$2
        AND status IN ('pending','confirmed') RETURNING *`,
      [req.params.id, req.hotelId]
    );
    if (!row) throw badRequest('Booking cannot be marked as no-show');
    await sql(
      `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
       VALUES ($1,$2,'no_show','Marked as no-show',$3,$4)`,
      [row.id, req.hotelId, req.user.id, req.user.name]
    );
    res.json(row);
  })
);

// ---------------- CHANGE / ASSIGN ROOM ----------------
r.post(
  '/:id/assign-room',
  asyncHandler(async (req, res) => {
    const { room_id } = req.body || {};
    const booking = await one(`SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!booking) throw notFound('Booking not found');
    const room = await one('SELECT * FROM rooms WHERE id=$1 AND hotel_id=$2', [room_id, req.hotelId]);
    if (!room) throw badRequest('Room not found');
    if (booking.room_id && booking.status === 'checked_in') {
      await sql(`UPDATE rooms SET status='cleaning', housekeeping='dirty' WHERE id=$1`, [booking.room_id]);
    }
    const row = await one(
      `UPDATE bookings SET room_id=$3, room_number=$4 WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      [booking.id, req.hotelId, room.id, room.number]
    );
    if (booking.status === 'checked_in') {
      await sql(`UPDATE rooms SET status='occupied' WHERE id=$1`, [room.id]);
    }
    await sql(
      `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
       VALUES ($1,$2,'room_assigned',$3,$4,$5)`,
      [row.id, req.hotelId, `Room set to ${room.number}`, req.user.id, req.user.name]
    );
    res.json(row);
  })
);

// ---------------- PAYMENT ----------------
r.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const booking = await one(`SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!booking) throw notFound('Booking not found');
    const amount = Number(req.body?.amount || 0);
    if (amount <= 0) throw badRequest('Amount must be greater than 0');

    const out = await tx(async (client) => {
      const folio = await ensureFolio(client, req.hotelId, booking);
      const pay = await tsql(
        client,
        `INSERT INTO payments (hotel_id, invoice_id, booking_id, amount, method, reference, category, notes, received_by)
         VALUES ($1,$2,$3,$4,$5,$6,'guest',$7,$8) RETURNING *`,
        [req.hotelId, folio.id, booking.id, amount, req.body.method || 'cash',
          req.body.reference || null, req.body.notes || null, req.user.id]
      );
      const inv = await refreshFolioTotals(client, folio.id);
      await tsql(
        client,
        `UPDATE bookings SET paid_amount=$3 WHERE id=$1 AND hotel_id=$2`,
        [booking.id, req.hotelId, inv.paid]
      );
      await tsql(
        client,
        `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
         VALUES ($1,$2,'payment',$3,$4,$5)`,
        [booking.id, req.hotelId, `Payment ₹${amount} received (${req.body.method || 'cash'})`, req.user.id, req.user.name]
      );
      await postJournal(client, {
        hotelId: req.hotelId,
        date: new Date().toISOString().slice(0, 10),
        refType: 'payment',
        refId: pay.rows[0].id,
        memo: `Payment for ${booking.code}`,
        createdBy: req.user.id,
        lines: [
          { code: '1000', debit: amount, credit: 0 },
          { code: '1020', debit: 0, credit: amount },
        ],
      });
      return { payment: pay.rows[0], invoice: inv };
    });
    res.status(201).json(out);
  })
);

// ---------------- FOLIO CHARGE ----------------
r.post(
  '/:id/charges',
  asyncHandler(async (req, res) => {
    const booking = await one(`SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!booking) throw notFound('Booking not found');
    const { description, amount, category = 'other', qty = 1, rate } = req.body || {};
    if (!description || !amount) throw badRequest('Description and amount are required');

    const out = await tx(async (client) => {
      const folio = await ensureFolio(client, req.hotelId, booking);
      const taxRate = Number((await tsql(client, 'SELECT tax_rate FROM hotels WHERE id=$1', [req.hotelId])).rows[0].tax_rate);
      const lineAmount = Number(amount);
      const tax = Math.round((lineAmount * taxRate + Number.EPSILON) * 100) / 100;
      await tsql(
        client,
        `INSERT INTO invoice_items (invoice_id, hotel_id, description, category, qty, rate, amount, tax, ref_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [folio.id, req.hotelId, description, category, qty, rate ?? lineAmount / Number(qty || 1), lineAmount, tax, null]
      );
      const inv = await refreshFolioTotals(client, folio.id);
      await tsql(client, `UPDATE bookings SET total_amount=$3 WHERE id=$1 AND hotel_id=$2`,
        [booking.id, req.hotelId, inv.total]);
      await tsql(
        client,
        `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
         VALUES ($1,$2,'charge',$3,$4,$5)`,
        [booking.id, req.hotelId, `${category} charge ₹${lineAmount}: ${description}`, req.user.id, req.user.name]
      );
      return inv;
    });
    res.status(201).json(out);
  })
);

// ---------------- EXTEND STAY ----------------
r.post(
  '/:id/extend',
  asyncHandler(async (req, res) => {
    const extra = Number(req.body?.nights || 1);
    if (extra < 1) throw badRequest('Nights must be at least 1');
    const booking = await one(`SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!booking) throw notFound('Booking not found');
    if (booking.status !== 'checked_in') throw badRequest('Only in-house guests can be extended');

    const newOut = addDays(booking.check_out, extra);
    if (booking.room_id) {
      const clash = await sql(
        `SELECT 1 FROM bookings WHERE room_id=$1 AND id<>$2 AND status IN ('confirmed','checked_in')
           AND check_in < $4 AND check_out > $3`,
        [booking.room_id, booking.id, booking.check_out, newOut]
      );
      if (clash.rows.length) throw badRequest('Room is not available for the extended dates');
    } else {
      const free = await findFreeRooms(req.hotelId, booking.room_type_id, booking.check_out, newOut, booking.id);
      if (!free.length) throw badRequest('No rooms available for extension');
    }

    const row = await one(
      `UPDATE bookings SET check_out=$3, nights=$4, total_amount=total_amount + $5
        WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      [booking.id, req.hotelId, newOut, booking.nights + extra, Number(req.body?.amount || 0)]
    );
    await sql(
      `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_id, actor_name)
       VALUES ($1,$2,'extended',$3,$4,$5)`,
      [row.id, req.hotelId, `Stay extended by ${extra} night(s) → ${newOut}`, req.user.id, req.user.name]
    );
    res.json(row);
  })
);

export default r;
