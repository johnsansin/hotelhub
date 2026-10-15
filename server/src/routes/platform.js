import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging, slugify, todayStr } from '../utils/api.js';
import { authenticate } from '../middleware/auth.js';
import { ensureHotelAccounts } from '../services/accounting.js';
import { ensureHotelModules } from '../services/modules.js';

const r = Router();

r.use(authenticate);
r.use((req, _res, next) => {
  if (req.user.role !== 'superadmin') {
    return next(Object.assign(new Error('Superadmin access only'), { status: 403, code: 'forbidden' }));
  }
  next();
});

// ---------------- PLATFORM STATS ----------------
r.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await one(
      `SELECT
        (SELECT count(*)::int FROM hotels) AS hotels,
        (SELECT count(*)::int FROM hotels WHERE status IN ('active','trial')) AS active_hotels,
        (SELECT count(*)::int FROM hotels WHERE status='suspended') AS suspended,
        (SELECT count(*)::int FROM hotels WHERE created_at >= CURRENT_DATE - interval '30 days') AS new_hotels,
        (SELECT coalesce(sum(CASE WHEN s.billing_cycle='yearly' THEN s.amount/12 ELSE s.amount END),0)
           FROM subscriptions s WHERE s.status IN ('active','trialing')) AS mrr,
        (SELECT count(*)::int FROM users WHERE role <> 'superadmin') AS hotel_users,
        (SELECT count(*)::int FROM bookings WHERE status<>'cancelled') AS bookings,
        (SELECT coalesce(sum(total_amount),0) FROM bookings WHERE status<>'cancelled') AS booking_value,
        (SELECT count(*)::int FROM rooms WHERE is_active) AS rooms,
        (SELECT round(avg(rating),2) FROM reviews) AS avg_rating`
    );
    const trend = await many(
      `SELECT to_char(date_trunc('month', created_at),'Mon YYYY') AS month, count(*)::int AS hotels
         FROM hotels WHERE created_at >= CURRENT_DATE - interval '12 months'
        GROUP BY 1, date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)`,
    );
    const top = await many(
      `SELECT h.name, h.slug, h.status, p.name AS plan,
              (SELECT count(*)::int FROM bookings b WHERE b.hotel_id=h.id AND b.status<>'cancelled') AS bookings,
              (SELECT coalesce(sum(total_amount),0) FROM bookings b WHERE b.hotel_id=h.id AND b.status<>'cancelled') AS revenue,
              (SELECT count(*)::int FROM rooms rm WHERE rm.hotel_id=h.id AND rm.is_active) AS rooms
         FROM hotels h LEFT JOIN plans p ON p.id=h.plan_id
        ORDER BY revenue DESC LIMIT 8`
    );
    res.json({ ...stats, trend, top });
  })
);

// ---------------- HOTELS ----------------
r.get(
  '/hotels',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 20 });
    const p = [];
    const where = ['true'];
    if (req.query.status) { p.push(req.query.status); where.push(`h.status = $${p.length}`); }
    if (req.query.q) { p.push(`%${req.query.q}%`); where.push(`(h.name ILIKE $${p.length} OR h.city ILIKE $${p.length} OR h.email ILIKE $${p.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM hotels h ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT h.*, p.name AS plan_name, p.code AS plan_code, u.name AS owner_name, u.email AS owner_email,
              (SELECT count(*)::int FROM users us WHERE us.hotel_id=h.id) AS users,
              (SELECT count(*)::int FROM rooms rm WHERE rm.hotel_id=h.id AND rm.is_active) AS rooms,
              (SELECT count(*)::int FROM bookings b WHERE b.hotel_id=h.id AND b.status<>'cancelled') AS bookings,
              (SELECT coalesce(sum(total_amount),0) FROM bookings b WHERE b.hotel_id=h.id AND b.status<>'cancelled') AS revenue,
              (SELECT round(avg(rating),1) FROM reviews rv WHERE rv.hotel_id=h.id) AS rating
         FROM hotels h
         LEFT JOIN plans p ON p.id=h.plan_id
         LEFT JOIN users u ON u.id=h.created_by
         ${whereSql} ORDER BY h.created_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.get(
  '/hotels/:id',
  asyncHandler(async (req, res) => {
    const hotel = await one(
      `SELECT h.*, p.name AS plan_name FROM hotels h LEFT JOIN plans p ON p.id=h.plan_id WHERE h.id=$1`,
      [req.params.id]
    );
    if (!hotel) throw notFound('Hotel not found');
    const [users, subs, stats, recent] = await Promise.all([
      many(`SELECT id, name, email, role, is_active, last_login_at FROM users WHERE hotel_id=$1 ORDER BY created_at`, [hotel.id]),
      many(`SELECT s.*, p.name AS plan_name FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id
             WHERE s.hotel_id=$1 ORDER BY s.created_at DESC`, [hotel.id]),
      one(
        `SELECT (SELECT count(*)::int FROM rooms WHERE hotel_id=$1) AS rooms,
                (SELECT count(*)::int FROM room_types WHERE hotel_id=$1) AS room_types,
                (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status<>'cancelled') AS bookings,
                (SELECT coalesce(sum(total_amount),0) FROM bookings WHERE hotel_id=$1 AND status<>'cancelled') AS revenue,
                (SELECT count(*)::int FROM staff_profiles WHERE hotel_id=$1) AS staff,
                (SELECT count(*)::int FROM invoices WHERE hotel_id=$1) AS invoices`,
        [hotel.id]
      ),
      many(`SELECT code, guest_name, check_in, check_out, status, total_amount
              FROM bookings WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT 8`, [hotel.id]),
    ]);
    res.json({ hotel, users, subscriptions: subs, stats, recent_bookings: recent });
  })
);

r.post(
  '/hotels',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.email) throw badRequest('name and email are required');
    const out = await tx(async (client) => {
      let slug = b.slug || slugify(b.name);
      const dupe = await tsql(client, 'SELECT 1 FROM hotels WHERE slug=$1', [slug]);
      if (dupe.rows.length) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
      const hotel = (await tsql(
        client,
        `INSERT INTO hotels (slug, name, email, phone, city, state, country, address, status, plan_id, star_rating, tagline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [slug, b.name, b.email, b.phone || null, b.city || null, b.state || null, b.country || 'India',
          b.address || null, b.status || 'active', b.plan_id || null, Number(b.star_rating || 3),
          b.tagline || null]
      )).rows[0];
      await ensureHotelAccounts(client, hotel.id);
      await ensureHotelModules(hotel.id, client);
      if (b.admin) {
        const hash = await bcrypt.hash(b.admin.password || 'admin123', 10);
        const u = (await tsql(
          client,
          `INSERT INTO users (hotel_id, role, name, email, password_hash, designation)
           VALUES ($1,'admin',$2,$3,$4,'Owner / Admin') RETURNING id`,
          [hotel.id, b.admin.name || `${b.name} Admin`, b.admin.email || b.email, hash]
        )).rows[0];
        await tsql(client, 'UPDATE hotels SET created_by=$2 WHERE id=$1', [hotel.id, u.id]);
      }
      return hotel;
    });
    res.status(201).json(out);
  })
);

r.put(
  '/hotels/:id',
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'email', 'phone', 'city', 'state', 'country', 'address', 'zip', 'status',
      'plan_id', 'star_rating', 'tagline', 'description', 'currency', 'currency_symbol', 'tax_rate',
      'service_charge', 'check_in_time', 'check_out_time', 'amenities', 'gallery', 'policies',
      'social', 'about', 'logo_url', 'cover_url', 'settings'];
    const b = { ...req.body };
    delete b.id; delete b.slug;
    const sets = [];
    const p = [req.params.id];
    for (const k of allowed) {
      if (b[k] !== undefined) {
        p.push(typeof b[k] === 'object' ? JSON.stringify(b[k]) : b[k]);
        sets.push(`"${k}"=$${p.length}`);
      }
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(`UPDATE hotels SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, p);
    if (!row) throw notFound('Hotel not found');
    if (b.plan_id) {
      const plan = await one('SELECT * FROM plans WHERE id=$1', [b.plan_id]);
      if (plan) {
        await sql(`INSERT INTO subscriptions (hotel_id, plan_id, billing_cycle, status, amount, ends_at, notes)
           VALUES ($1,$2,'monthly','active',$3, CURRENT_DATE + interval '1 month', 'Plan changed by superadmin')`,
          [row.id, plan.id, plan.price_monthly]).catch(() => null);
      }
    }
    res.json(row);
  })
);

r.delete(
  '/hotels/:id',
  asyncHandler(async (req, res) => {
    const r2 = await sql(`DELETE FROM hotels WHERE id=$1`, [req.params.id]);
    if (!r2.rowCount) throw notFound('Hotel not found');
    res.json({ deleted: true });
  })
);

// ---------------- PLANS ----------------
r.get('/plans', asyncHandler(async (_req, res) => {
  res.json({ items: await many(`SELECT * FROM plans ORDER BY sort_order, price_monthly`) });
}));

r.post('/plans', asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.code) throw badRequest('code and name are required');
  const row = await one(
    `INSERT INTO plans (code, name, tagline, price_monthly, price_yearly, max_rooms, max_staff,
        max_orders_month, features, highlights, is_popular, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [b.code, b.name, b.tagline || null, Number(b.price_monthly || 0), Number(b.price_yearly || 0),
      Number(b.max_rooms || 0), Number(b.max_staff || 0), Number(b.max_orders_month || 0),
      JSON.stringify(b.features || []), JSON.stringify(b.highlights || []),
      !!b.is_popular, Number(b.sort_order || 0), b.is_active !== false]
  );
  res.status(201).json(row);
}));

r.put('/plans/:id', asyncHandler(async (req, res) => {
  const b = { ...req.body }; delete b.id;
  const allowed = ['code', 'name', 'tagline', 'price_monthly', 'price_yearly', 'max_rooms', 'max_staff',
    'max_orders_month', 'features', 'highlights', 'is_popular', 'sort_order', 'is_active'];
  const sets = []; const p = [req.params.id];
  for (const k of allowed) {
    if (b[k] !== undefined) {
      p.push(typeof b[k] === 'object' ? JSON.stringify(b[k]) : b[k]);
      sets.push(`"${k}"=$${p.length}`);
    }
  }
  if (!sets.length) throw badRequest('Nothing to update');
  const row = await one(`UPDATE plans SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, p);
  if (!row) throw notFound('Plan not found');
  res.json(row);
}));

r.delete('/plans/:id', asyncHandler(async (req, res) => {
  const used = await one(`SELECT count(*)::int AS c FROM hotels WHERE plan_id=$1`, [req.params.id]);
  const r2 = await sql(`UPDATE plans SET is_active=false WHERE id=$1`, [req.params.id]);
  if (!r2.rowCount) throw notFound('Plan not found');
  res.json({ deactivated: true, in_use: used.c });
}));

// ---------------- SUBSCRIPTIONS ----------------
r.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT s.*, h.name AS hotel_name, h.slug AS hotel_slug, p.name AS plan_name, p.code AS plan_code
         FROM subscriptions s JOIN hotels h ON h.id=s.hotel_id LEFT JOIN plans p ON p.id=s.plan_id
        ORDER BY s.created_at DESC LIMIT 200`
    );
    res.json({ items: rows });
  })
);

r.post(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const { hotel_id, plan_id, billing_cycle = 'monthly' } = req.body || {};
    if (!hotel_id || !plan_id) throw badRequest('hotel_id and plan_id are required');
    const plan = await one('SELECT * FROM plans WHERE id=$1', [plan_id]);
    if (!plan) throw notFound('Plan not found');
    const amount = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const row = await one(
      `INSERT INTO subscriptions (hotel_id, plan_id, billing_cycle, status, amount, starts_at, ends_at, paid_via, reference)
       VALUES ($1,$2,$3,'active',$4, now(), now() + ($5 || ' month')::interval, $6, $7) RETURNING *`,
      [hotel_id, plan_id, billing_cycle, amount, billing_cycle === 'yearly' ? '12' : '1',
        req.body.paid_via || 'manual', req.body.reference || null]
    );
    await sql(`UPDATE hotels SET plan_id=$2, status=CASE WHEN status='suspended' THEN 'active' ELSE status END WHERE id=$1`,
      [hotel_id, plan_id]);
    res.status(201).json(row);
  })
);

// ---------------- SUPPORT TICKETS ----------------
r.get('/tickets', asyncHandler(async (req, res) => {
  const rows = await many(
    `SELECT t.*, h.name AS hotel_name, u.name AS created_by_name,
            (SELECT count(*)::int FROM ticket_messages m WHERE m.ticket_id=t.id) AS messages
       FROM support_tickets t LEFT JOIN hotels h ON h.id=t.hotel_id
       LEFT JOIN users u ON u.id=t.created_by ORDER BY t.updated_at DESC LIMIT 100`
  );
  res.json({ items: rows });
}));

r.get('/tickets/:id', asyncHandler(async (req, res) => {
  const ticket = await one(
    `SELECT t.*, h.name AS hotel_name FROM support_tickets t LEFT JOIN hotels h ON h.id=t.hotel_id WHERE t.id=$1`,
    [req.params.id]
  );
  if (!ticket) throw notFound('Ticket not found');
  const messages = await many(
    `SELECT m.*, u.name AS author_name FROM ticket_messages m LEFT JOIN users u ON u.id=m.author_id
      WHERE m.ticket_id=$1 ORDER BY m.created_at`, [ticket.id]);
  res.json({ ticket, messages });
}));

r.post('/tickets/:id/reply', asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) throw badRequest('message is required');
  const msg = await one(
    `INSERT INTO ticket_messages (ticket_id, author_id, author_role, message)
     VALUES ($1,$2,'superadmin',$3) RETURNING *`,
    [req.params.id, req.user.id, message]
  );
  await sql(`UPDATE support_tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,
             updated_at=now() WHERE id=$1`, [req.params.id]);
  res.status(201).json(msg);
}));

r.put('/tickets/:id', asyncHandler(async (req, res) => {
  const { status, priority } = req.body || {};
  const row = await one(
    `UPDATE support_tickets SET status=COALESCE($2,status), priority=COALESCE($3,priority), updated_at=now()
      WHERE id=$1 RETURNING *`, [req.params.id, status || null, priority || null]
  );
  if (!row) throw notFound('Ticket not found');
  res.json(row);
}));

// ---------------- AUDIT LOGS ----------------
r.get('/audit', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePaging(req);
  const p = [];
  const where = ['true'];
  if (req.query.hotel_id) { p.push(req.query.hotel_id); where.push(`a.hotel_id=$${p.length}`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = (await sql(`SELECT count(*)::int AS c FROM audit_logs a ${whereSql}`, p)).rows[0].c;
  const rows = await many(
    `SELECT a.*, u.name AS user_name, h.name AS hotel_name
       FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN hotels h ON h.id=a.hotel_id
       ${whereSql} ORDER BY a.created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,
    [...p, limit, offset]
  );
  res.json(listResponse(rows, total, { page, limit }));
}));

export default r;
