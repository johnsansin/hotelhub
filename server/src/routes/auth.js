import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, unauthorized, slugify, notFound } from '../utils/api.js';
import { signToken, setAuthCookie, clearAuthCookie, authenticate, COOKIE_NAME } from '../middleware/auth.js';
import { ensureHotelAccounts } from '../services/accounting.js';
import { ensureHotelModules, enabledModules } from '../services/modules.js';

const r = Router();

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

async function loadContext(userId) {
  return one(
    `SELECT u.*, h.name AS hotel_name, h.slug AS hotel_slug, h.status AS hotel_status,
            h.logo_url AS hotel_logo, h.currency_symbol, h.city AS hotel_city
       FROM users u LEFT JOIN hotels h ON h.id = u.hotel_id
      WHERE u.id = $1`,
    [userId]
  );
}

// ---------- login ----------
r.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) throw badRequest('Email and password are required');

    const user = await one(`SELECT * FROM users WHERE lower(email) = $1`, [email]);
    if (!user) throw unauthorized('Invalid email or password');
    const okPass = await bcrypt.compare(password, user.password_hash);
    if (!okPass) throw unauthorized('Invalid email or password');
    if (!user.is_active) throw unauthorized('This account has been deactivated');

    if (user.hotel_id) {
      const hotel = await one('SELECT status FROM hotels WHERE id=$1', [user.hotel_id]);
      if (hotel && hotel.status === 'suspended') {
        throw unauthorized('This hotel account is suspended. Please contact support.');
      }
    }

    await sql('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]).catch(() => null);
    const ctx = await loadContext(user.id);
    const token = signToken({ sub: user.id, role: user.role, hotel: user.hotel_id });
    setAuthCookie(res, token);
    res.json({ token, user: publicUser(ctx) });
  })
);

// ---------- register new hotel (tenant signup) ----------
r.post(
  '/register',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const h = b.hotel || b;
    const u = b.user || {};
    const hotelName = String(h.name || '').trim();
    const email = String(u.email || h.email || '').trim().toLowerCase();
    const password = String(u.password || '');
    if (!hotelName) throw badRequest('Hotel name is required');
    if (!email) throw badRequest('Email is required');
    if (password.length < 6) throw badRequest('Password must be at least 6 characters');

    const exists = await one('SELECT id FROM users WHERE lower(email)=$1', [email]);
    if (exists) throw badRequest('An account with this email already exists');

    const plan = await one(`SELECT * FROM plans WHERE code=$1`, [b.planCode || 'growth']);

    const userId = await tx(async (client) => {
      let slug = slugify(hotelName) || 'hotel';
      const dupe = await tsql(client, 'SELECT 1 FROM hotels WHERE slug=$1', [slug]);
      if (dupe.rows.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

      const hotel = await tsql(
        client,
        `INSERT INTO hotels (slug, name, legal_name, email, phone, city, state, country, address,
                             tagline, status, plan_id, trial_ends_at, star_rating, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'trial',$11, now() + interval '14 days', $12, NULL)
         RETURNING *`,
        [
          slug, hotelName, h.legal_name || hotelName, email, h.phone || null, h.city || null,
          h.state || null, h.country || 'India', h.address || null,
          h.tagline || 'Experience hospitality, reimagined.', plan?.id || null,
          Number(h.star_rating || 3),
        ]
      );
      const hotelRow = hotel.rows[0];

      const hash = await bcrypt.hash(password, 10);
      const admin = await tsql(
        client,
        `INSERT INTO users (hotel_id, role, name, email, phone, password_hash, designation)
         VALUES ($1,'admin',$2,$3,$4,$5,'Owner / Admin') RETURNING id`,
        [hotelRow.id, u.name || `${hotelName} Admin`, email, u.phone || h.phone || null, hash]
      );

      await tsql(client, 'UPDATE hotels SET created_by=$2 WHERE id=$1', [hotelRow.id, admin.rows[0].id]);
      await ensureHotelAccounts(client, hotelRow.id);
      await ensureHotelModules(hotelRow.id, client);

      // default shifts
      await tsql(
        client,
        `INSERT INTO shifts (hotel_id, name, start_time, end_time) VALUES
         ($1,'Morning (06:00 - 14:00)','06:00','14:00'),
         ($1,'Evening (14:00 - 22:00)','14:00','22:00'),
         ($1,'Night (22:00 - 06:00)','22:00','06:00')`,
        [hotelRow.id]
      );
      await tsql(
        client,
        `INSERT INTO subscriptions (hotel_id, plan_id, billing_cycle, status, amount, ends_at, notes)
         VALUES ($1,$2,'monthly','trial', $3, now() + interval '14 days', 'Free trial')`,
        [hotelRow.id, plan?.id || null, plan?.price_monthly || 0]
      );
      await tsql(
        client,
        `INSERT INTO notifications (hotel_id, user_id, title, message, type, link)
         VALUES ($1,$2,'Welcome to HotelHub 🎉','Your property is ready. Start by adding room types and rates.','success','/dashboard/rooms')`,
        [hotelRow.id, admin.rows[0].id]
      );
      return { userId: admin.rows[0].id, hotelId: hotelRow.id };
    });

    const ctx = await loadContext(userId.userId);
    const token = signToken({ sub: userId.userId, role: 'admin', hotel: userId.hotelId });
    setAuthCookie(res, token);
    res.status(201).json({ token, user: publicUser(ctx) });
  })
);

// ---------- logout ----------
r.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ---------- me ----------
r.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const ctx = await loadContext(req.user.id);
    if (!ctx) throw unauthorized();
    const modules = ctx.hotel_id ? await enabledModules(ctx.hotel_id) : [];
    res.json({ user: publicUser(ctx), modules });
  })
);

// ---------- demo accounts (for the demo login page) ----------
r.get(
  '/demo-accounts',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `SELECT u.email, u.role, u.name, h.name AS hotel
         FROM users u LEFT JOIN hotels h ON h.id=u.hotel_id
        WHERE u.email LIKE '%@demo.hms' OR u.role='superadmin'
        ORDER BY CASE u.role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
        LIMIT 8`
    );
    res.json({ items: rows, password: 'demo123' });
  })
);

// ---------- change password ----------
r.put(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) throw badRequest('New password must be at least 6 characters');
    const user = await one('SELECT * FROM users WHERE id=$1', [req.user.id]);
    if (oldPassword && !(await bcrypt.compare(oldPassword, user.password_hash))) {
      throw badRequest('Current password is incorrect');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await sql('UPDATE users SET password_hash=$2 WHERE id=$1', [user.id, hash]);
    res.json({ ok: true });
  })
);

// ---------- profile ----------
r.put(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const { name, phone, avatar_url, designation } = req.body || {};
    const row = await one(
      `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone),
              avatar_url = COALESCE($4, avatar_url), designation = COALESCE($5, designation)
        WHERE id = $1 RETURNING id, name, email, phone, avatar_url, designation, role`,
      [req.user.id, name || null, phone || null, avatar_url || null, designation || null]
    );
    res.json(row);
  })
);

export default r;
