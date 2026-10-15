import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { one, many, sql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging } from '../utils/api.js';
import { crud } from '../db/crud.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|gif|svg|pdf|csv)$/.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only images, PDF and CSV files are allowed'), ok);
  },
});

const r = Router();

// ---------------- USERS (hotel staff accounts) ----------------
r.get(
  '/users',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT id, name, email, phone, role, designation, avatar_url, is_active, last_login_at, created_at
         FROM users WHERE hotel_id=$1 ORDER BY created_at DESC`,
      [req.hotelId]
    );
    res.json({ items: rows });
  })
);

r.post(
  '/users',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.email) throw badRequest('name and email are required');
    if (!b.password || b.password.length < 6) throw badRequest('Password must be at least 6 characters');
    const allowedRoles = ['admin', 'manager', 'receptionist', 'housekeeper', 'accountant', 'storekeeper', 'restaurant', 'staff'];
    if (b.role && !allowedRoles.includes(b.role)) throw badRequest('Invalid role');
    const dupe = await one(`SELECT id FROM users WHERE lower(email)=lower($1)`, [b.email]);
    if (dupe) throw badRequest('A user with this email already exists');
    const hash = await bcrypt.hash(b.password, 10);
    const row = await one(
      `INSERT INTO users (hotel_id, role, name, email, phone, password_hash, designation, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id, name, email, role, phone, designation, is_active`,
      [req.hotelId, b.role || 'staff', b.name, b.email.toLowerCase(), b.phone || null, hash, b.designation || null]
    );
    res.status(201).json(row);
  })
);

r.put(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const b = { ...req.body };
    delete b.id; delete b.hotel_id; delete b.email; delete b.password;
    const allowed = ['name', 'phone', 'role', 'designation', 'avatar_url', 'is_active'];
    const sets = [];
    const p = [req.params.id, req.hotelId];
    for (const k of allowed) {
      if (b[k] !== undefined) { p.push(b[k]); sets.push(`"${k}"=$${p.length}`); }
    }
    if (b.password) {
      if (b.password.length < 6) throw badRequest('Password must be at least 6 characters');
      p.push(await bcrypt.hash(b.password, 10));
      sets.push(`password_hash=$${p.length}`);
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(
      `UPDATE users SET ${sets.join(', ')} WHERE id=$1 AND hotel_id=$2
        RETURNING id, name, email, role, phone, designation, is_active, avatar_url`, p
    );
    if (!row) throw notFound('User not found');
    res.json(row);
  })
);

r.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw badRequest('You cannot delete your own account');
    const r2 = await sql(`DELETE FROM users WHERE id=$1 AND hotel_id=$2 AND role <> 'admin'`,
      [req.params.id, req.hotelId]);
    if (!r2.rowCount) throw notFound('User not found (admins must be deactivated instead)');
    res.json({ deleted: true });
  })
);

// ---------------- NOTIFICATIONS ----------------
r.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { limit } = parsePaging(req, { defaultLimit: 30 });
    const rows = await many(
      `SELECT * FROM notifications WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [req.hotelId, limit]
    );
    const unread = (await one(
      `SELECT count(*)::int AS c FROM notifications WHERE hotel_id=$1 AND NOT is_read`, [req.hotelId]
    )).c;
    res.json({ items: rows, unread });
  })
);

r.post(
  '/notifications/read',
  asyncHandler(async (req, res) => {
    if (req.body?.all) {
      await sql(`UPDATE notifications SET is_read=true WHERE hotel_id=$1`, [req.hotelId]);
    } else if (Array.isArray(req.body?.ids) && req.body.ids.length) {
      await sql(`UPDATE notifications SET is_read=true WHERE hotel_id=$1 AND id = ANY($2::uuid[])`,
        [req.hotelId, req.body.ids]);
    } else {
      await sql(`UPDATE notifications SET is_read=true WHERE hotel_id=$1 AND user_id=$2`,
        [req.hotelId, req.user.id]);
    }
    res.json({ ok: true });
  })
);

// ---------------- HOTEL SETTINGS ----------------
r.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const hotel = await one(
      `SELECT h.*, p.name AS plan_name, p.code AS plan_code, p.max_rooms, p.max_staff
         FROM hotels h LEFT JOIN plans p ON p.id=h.plan_id WHERE h.id=$1`, [req.hotelId]
    );
    const modules = await many(`SELECT * FROM hotel_modules WHERE hotel_id=$1 ORDER BY module`, [req.hotelId]);
    const sub = await one(
      `SELECT s.*, p.name AS plan_name FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id
        WHERE s.hotel_id=$1 ORDER BY s.created_at DESC LIMIT 1`, [req.hotelId]
    );
    res.json({ hotel, modules, subscription: sub });
  })
);

r.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'legal_name', 'tagline', 'description', 'about', 'email', 'phone', 'website',
      'address', 'city', 'state', 'country', 'zip', 'timezone', 'currency', 'currency_symbol', 'locale',
      'logo_url', 'cover_url', 'star_rating', 'check_in_time', 'check_out_time', 'tax_rate',
      'service_charge', 'amenities', 'gallery', 'policies', 'social', 'settings'];
    const b = { ...req.body };
    delete b.id; delete b.status; delete b.plan_id;
    const sets = [];
    const p = [req.hotelId];
    for (const k of allowed) {
      if (b[k] !== undefined) {
        p.push(typeof b[k] === 'object' ? JSON.stringify(b[k]) : b[k]);
        sets.push(`"${k}"=$${p.length}`);
      }
    }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(`UPDATE hotels SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, p);
    res.json(row);
  })
);

// modules toggle
r.put(
  '/settings/modules',
  asyncHandler(async (req, res) => {
    const modules = req.body?.modules;
    if (!Array.isArray(modules)) throw badRequest('modules array is required');
    for (const m of modules) {
      await sql(
        `INSERT INTO hotel_modules (hotel_id, module, is_enabled, config)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (hotel_id, module) DO UPDATE SET is_enabled=EXCLUDED.is_enabled, config=EXCLUDED.config`,
        [req.hotelId, m.module, m.is_enabled !== false, JSON.stringify(m.config || {})]
      );
    }
    res.json({ items: await many(`SELECT * FROM hotel_modules WHERE hotel_id=$1`, [req.hotelId]) });
  })
);

// ---------------- COUPONS ----------------
const coupons = await crud({
  table: 'coupons',
  resource: 'Coupon',
  search: ['code', 'description'],
  defaultSort: 'created_at',
  writable: ['code', 'description', 'type', 'value', 'min_stay', 'min_amount', 'max_uses',
    'valid_from', 'valid_to', 'is_active'],
});
r.use('/coupons', coupons);

// ---------------- REVIEWS ----------------
const reviews = await crud({
  table: 'reviews',
  resource: 'Review',
  search: ['guest_name', 'comment'],
  defaultSort: 'created_at',
  writable: ['guest_name', 'rating', 'category', 'comment', 'response', 'is_published', 'booking_id'],
});
r.use('/reviews', reviews);

// ---------------- EVENTS / BANQUETS ----------------
const events = await crud({
  table: 'event_bookings',
  resource: 'Event',
  search: ['title', 'venue', 'client_name', 'client_email', 'client_phone'],
  defaultSort: 'start_at',
  writable: ['title', 'venue', 'client_name', 'client_email', 'client_phone', 'start_at', 'end_at',
    'pax', 'event_type', 'status', 'rate', 'advance', 'notes', 'created_by'],
  beforeWrite(body, req, mode) {
    if (mode === 'create') body.created_by = req.user.id;
    return body;
  },
});
r.use('/events', events);

// ---------------- INVOICES ----------------
r.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req);
    const p = [req.hotelId];
    const where = ['i.hotel_id=$1'];
    if (req.query.status) { p.push(req.query.status); where.push(`i.status=$${p.length}`); }
    if (req.query.type) { p.push(req.query.type); where.push(`i.type=$${p.length}`); }
    if (req.query.q) { p.push(`%${req.query.q}%`); where.push(`(i.invoice_no ILIKE $${p.length} OR i.party_name ILIKE $${p.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM invoices i ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT i.*, b.code AS booking_code, b.guest_name AS booking_guest,
              (SELECT coalesce(sum(amount),0) FROM payments pi WHERE pi.invoice_id=i.id) AS paid_calc
         FROM invoices i LEFT JOIN bookings b ON b.id=i.booking_id
         ${whereSql} ORDER BY i.created_at DESC LIMIT $${p.length+1} OFFSET $${p.length+2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const invoice = await one(
      `SELECT i.*, b.code AS booking_code FROM invoices i LEFT JOIN bookings b ON b.id=i.booking_id
        WHERE i.id=$1 AND i.hotel_id=$2`, [req.params.id, req.hotelId]
    );
    if (!invoice) throw notFound('Invoice not found');
    const items = await many(`SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY created_at`, [invoice.id]);
    const payments = await many(`SELECT * FROM payments WHERE invoice_id=$1 ORDER BY paid_at`, [invoice.id]);
    res.json({ invoice, items, payments });
  })
);

// ---------------- SUPPORT TICKETS (hotel side) ----------------
r.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT t.*, u.name AS created_by_name,
              (SELECT count(*)::int FROM ticket_messages m WHERE m.ticket_id=t.id) AS messages
         FROM support_tickets t LEFT JOIN users u ON u.id=t.created_by
        WHERE t.hotel_id=$1 ORDER BY t.updated_at DESC`, [req.hotelId]
    );
    res.json({ items: rows });
  })
);

r.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const { subject, category, priority, message } = req.body || {};
    if (!subject) throw badRequest('subject is required');
    const ticket = await one(
      `INSERT INTO support_tickets (hotel_id, subject, category, priority, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.hotelId, subject, category || 'general', priority || 'medium', req.user.id]
    );
    if (message) {
      await sql(`INSERT INTO ticket_messages (ticket_id, author_id, author_role, message) VALUES ($1,$2,$3,$4)`,
        [ticket.id, req.user.id, req.user.role, message]);
    }
    res.status(201).json(ticket);
  })
);

r.get(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const ticket = await one(`SELECT * FROM support_tickets WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]);
    if (!ticket) throw notFound('Ticket not found');
    const messages = await many(
      `SELECT m.*, u.name AS author_name FROM ticket_messages m LEFT JOIN users u ON u.id=m.author_id
        WHERE m.ticket_id=$1 ORDER BY m.created_at`, [ticket.id]);
    res.json({ ticket, messages });
  })
);

r.post(
  '/tickets/:id/reply',
  asyncHandler(async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) throw badRequest('message is required');
    const ticket = await one(`SELECT * FROM support_tickets WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]);
    if (!ticket) throw notFound('Ticket not found');
    const msg = await one(
      `INSERT INTO ticket_messages (ticket_id, author_id, author_role, message)
       VALUES ($1,$2,$3,$4) RETURNING *`, [ticket.id, req.user.id, req.user.role, message]
    );
    await sql(`UPDATE support_tickets SET updated_at=now() WHERE id=$1`, [ticket.id]);
    res.status(201).json(msg);
  })
);

// ---------------- UPLOADS ----------------
r.post(
  '/uploads',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file received');
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url, name: req.file.originalname, size: req.file.size });
  })
);

r.post(
  '/uploads/multiple',
  upload.array('files', 12),
  asyncHandler(async (req, res) => {
    const files = (req.files || []).map((f) => ({ url: `/uploads/${f.filename}`, name: f.originalname, size: f.size }));
    if (!files.length) throw badRequest('No files received');
    res.status(201).json({ items: files });
  })
);

export { UPLOAD_DIR };
export default r;
