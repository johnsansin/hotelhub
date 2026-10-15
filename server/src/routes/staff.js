import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, parsePaging, listResponse, monthRange } from '../utils/api.js';
import { crud } from '../db/crud.js';
import { canAccess } from '../middleware/auth.js';
import { validateUserRole, validatePassword } from '../utils/security.js';
import { postJournal } from '../services/accounting.js';

const r = Router();

const STAFF_SELECT = `sp.*, u.name, u.email, u.phone, u.role, u.is_active, u.avatar_url,
  sh.name AS shift_name, sh.start_time, sh.end_time,
  (SELECT count(*)::int FROM attendance a WHERE a.staff_id=sp.id
     AND a.work_date >= date_trunc('month', CURRENT_DATE)::date) AS present_days,
  (SELECT count(*)::int FROM leave_requests lr WHERE lr.staff_id=sp.id AND lr.status='pending') AS pending_leaves`;

const STAFF_JOINS = `LEFT JOIN users u ON u.id = sp.user_id
  LEFT JOIN shifts sh ON sh.id = sp.shift_id`;

// ---------------- STAFF ----------------
r.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 50 });
    const p = [req.hotelId];
    const where = ['sp.hotel_id = $1'];
    if (req.query.status) { p.push(req.query.status); where.push(`sp.status = $${p.length}`); }
    if (req.query.department) { p.push(req.query.department); where.push(`sp.department = $${p.length}`); }
    const q = String(req.query.q || '').trim();
    if (q) {
      p.push(`%${q}%`);
      where.push(`(u.name ILIKE $${p.length} OR u.email ILIKE $${p.length} OR sp.employee_code ILIKE $${p.length} OR sp.designation ILIKE $${p.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM staff_profiles sp ${STAFF_JOINS} ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT ${STAFF_SELECT} FROM staff_profiles sp ${STAFF_JOINS} ${whereSql}
        ORDER BY u.name LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    const visible = canAccess(req.user.role, 'staff') ? rows : rows.map(({ id, user_id, name, department, designation, status }) => ({ id, user_id, name, department, designation, status }));
    res.json(listResponse(visible, total, { page, limit }));
  })
);


// create staff (optionally with a login)
r.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = b.name || b.user?.name;
    const email = b.email || b.user?.email;
    if (!name) throw badRequest('Name is required');
    validateUserRole(b.role || 'staff');
    if (!b.user_id && email && b.create_login !== false) {
      if (!['admin', 'superadmin'].includes(req.user.role)) throw badRequest('Only an admin may create login accounts');
      validatePassword(b.password);
    }

    const staff = await tx(async (client) => {
      let userId = b.user_id || null;
      if (userId) {
        const linked = await tsql(client, 'SELECT id FROM users WHERE id=$1 AND hotel_id=$2', [userId, req.hotelId]);
        if (!linked.rows.length) throw badRequest('Invalid staff account');
      }
      if (email) {
        const dupe = await tsql(client, `SELECT id FROM users WHERE lower(email)=lower($1)`, [email]);
        if (dupe.rows.length && !b.user_id) throw badRequest('A user with this email already exists');
      }
      if (!userId && email && b.create_login !== false) {
        const hash = await bcrypt.hash(b.password, 10);
        const u = await tsql(
          client,
          `INSERT INTO users (hotel_id, role, name, email, phone, password_hash, designation, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
          [req.hotelId, b.role || 'staff', name, email, b.phone || null, hash, b.designation || null]
        );
        userId = u.rows[0].id;
      }
      const code = b.employee_code || `EMP-${String(Date.now()).slice(-5)}`;
      const s = await tsql(
        client,
        `INSERT INTO staff_profiles (hotel_id, user_id, employee_code, department, designation, shift_id,
            join_date, salary, gender, dob, blood_group, address, emergency_name, emergency_phone,
            id_proof, bank_account, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [req.hotelId, userId, code, b.department || 'Front Office', b.designation || null,
          b.shift_id || null, b.join_date || new Date().toISOString().slice(0, 10),
          Number(b.salary || 0), b.gender || null, b.dob || null, b.blood_group || null,
          b.address || null, b.emergency_name || null, b.emergency_phone || null,
          b.id_proof || null, b.bank_account || null, b.status || 'active']
      );
      return s.rows[0];
    });
    res.status(201).json(staff);
  })
);

r.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const b = { ...req.body };
    if (b.user && !['admin', 'superadmin'].includes(req.user.role)) throw badRequest('Only an admin may edit login accounts');
    delete b.id; delete b.hotel_id; delete b.name; delete b.email; delete b.role;
    const allowed = ['department', 'designation', 'shift_id', 'join_date', 'salary', 'gender', 'dob',
      'blood_group', 'address', 'emergency_name', 'emergency_phone', 'id_proof', 'bank_account', 'status'];
    const sets = [];
    const p = [req.params.id, req.hotelId];
    for (const k of allowed) {
      if (b[k] !== undefined) { p.push(b[k]); sets.push(`"${k}"=$${p.length}`); }
    }
    if (!sets.length && !b.user) throw badRequest('Nothing to update');
    let row = null;
    if (sets.length) {
      row = await one(
        `UPDATE staff_profiles SET ${sets.join(', ')} WHERE id=$1 AND hotel_id=$2 RETURNING *`, p
      );
      if (!row) throw notFound('Staff member not found');
    } else {
      row = await one(`SELECT * FROM staff_profiles WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
      if (!row) throw notFound('Staff member not found');
    }
    if (b.user && typeof b.user === 'object' && row.user_id) {
      const u = b.user;
      const usets = [];
      const up = [row.user_id, req.hotelId];
      for (const k of ['name', 'phone', 'avatar_url', 'designation', 'is_active']) {
        if (u[k] !== undefined) { up.push(u[k]); usets.push(`"${k}"=$${up.length}`); }
      }
      if (usets.length) {
        await sql(`UPDATE users SET ${usets.join(', ')} WHERE id=$1 AND hotel_id=$2`, up);
      }
    }
    res.json(row);
  })
);

r.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const r2 = await sql(`DELETE FROM staff_profiles WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!r2.rowCount) throw notFound('Staff member not found');
    res.json({ deleted: true });
  })
);

// ---------------- ATTENDANCE ----------------
r.get(
  '/attendance/list',
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const rows = await many(
      `SELECT sp.id AS staff_id, sp.employee_code, sp.department, sp.designation,
              u.name, u.avatar_url, sh.name AS shift_name,
              a.id, a.status, a.check_in, a.check_out, a.hours, a.note
         FROM staff_profiles sp
         LEFT JOIN users u ON u.id = sp.user_id
         LEFT JOIN shifts sh ON sh.id = sp.shift_id
         LEFT JOIN attendance a ON a.staff_id = sp.id AND a.work_date = $2::date
        WHERE sp.hotel_id = $1 AND sp.status <> 'terminated'
        ORDER BY u.name`,
      [req.hotelId, date]
    );
    res.json({ date, items: rows });
  })
);

r.post(
  '/attendance/mark',
  asyncHandler(async (req, res) => {
    const { staff_id, date, status, check_in, check_out, note } = req.body || {};
    if (!staff_id) throw badRequest('staff_id is required');
    const d = date || new Date().toISOString().slice(0, 10);
    const row = await one(
      `INSERT INTO attendance (hotel_id, staff_id, work_date, status, check_in, check_out, note)
       VALUES ($1,$2,$3::date,$4,$5,$6,$7)
       ON CONFLICT (staff_id, work_date) DO UPDATE
         SET status=EXCLUDED.status, check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out,
             note=EXCLUDED.note, hours=EXCLUDED.hours
       RETURNING *`,
      [req.hotelId, staff_id, d, status || 'present', check_in || null, check_out || null, note || null]
    );
    res.status(201).json(row);
  })
);

r.post(
  '/attendance/bulk',
  asyncHandler(async (req, res) => {
    const { date, entries = [] } = req.body || {};
    const d = date || new Date().toISOString().slice(0, 10);
    const results = [];
    for (const e of entries) {
      const row = await one(
        `INSERT INTO attendance (hotel_id, staff_id, work_date, status, note)
         VALUES ($1,$2,$3::date,$4,$5)
         ON CONFLICT (staff_id, work_date) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note
         RETURNING *`,
        [req.hotelId, e.staff_id, d, e.status || 'present', e.note || null]
      );
      results.push(row);
    }
    res.json({ items: results });
  })
);

// ---------------- LEAVES ----------------
const leaves = await crud({
  table: 'leave_requests',
  resource: 'Leave request',
  search: ['type', 'reason', 'status'],
  defaultSort: 'created_at',
  select: `leave_requests.*, sp.employee_code, u.name AS staff_name`,
  joins: 'LEFT JOIN staff_profiles sp ON sp.id = leave_requests.staff_id LEFT JOIN users u ON u.id = sp.user_id',
  writable: ['staff_id', 'type', 'from_date', 'to_date', 'reason', 'status', 'reviewed_by'],
  beforeWrite(body, req) {
    if (['approved', 'rejected'].includes(body.status)) body.reviewed_by = req.user.id;
    return body;
  },
});
r.use('/leaves', leaves);

// ---------------- PAYROLL ----------------
r.get(
  '/payroll',
  asyncHandler(async (req, res) => {
    const period = req.query.period || monthRange(0).label.slice(0, 7) || null;
    const per = req.query.period || new Date().toISOString().slice(0, 7);
    const rows = await many(
      `SELECT p.*, sp.employee_code, sp.salary AS ctc, u.name AS staff_name, sp.department
         FROM payroll p
         JOIN staff_profiles sp ON sp.id = p.staff_id
         LEFT JOIN users u ON u.id = sp.user_id
        WHERE p.hotel_id = $1 AND p.period = $2
        ORDER BY u.name`,
      [req.hotelId, per]
    );
    const total = rows.reduce((s, x) => s + Number(x.net_pay), 0);
    res.json({ period: per, items: rows, total });
  })
);

r.post(
  '/payroll/generate',
  asyncHandler(async (req, res) => {
    const period = req.body?.period || new Date().toISOString().slice(0, 7);
    const staff = await many(
      `SELECT sp.*, u.name FROM staff_profiles sp LEFT JOIN users u ON u.id=sp.user_id
        WHERE sp.hotel_id=$1 AND sp.status='active'`,
      [req.hotelId]
    );
    if (!staff.length) throw badRequest('No active staff found');
    const items = [];
    for (const s of staff) {
      const basic = Number(s.salary || 0);
      const allowances = Number(req.body?.allowances || 0);
      const deductions = Number(req.body?.deductions || 0);
      const net = basic + allowances - deductions;
      const row = await one(
        `INSERT INTO payroll (hotel_id, staff_id, period, basic, allowances, deductions, net_pay, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')
         ON CONFLICT (staff_id, period) DO UPDATE
           SET basic=EXCLUDED.basic, allowances=EXCLUDED.allowances, deductions=EXCLUDED.deductions,
               net_pay=EXCLUDED.net_pay
         RETURNING *`,
        [req.hotelId, s.id, period, basic, allowances, deductions, net]
      );
      items.push({ ...row, staff_name: s.name, employee_code: s.employee_code });
    }
    res.json({ period, items, total: items.reduce((a, b) => a + Number(b.net_pay), 0) });
  })
);

r.post(
  '/payroll/:id/pay',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE payroll SET status='paid', paid_at=now() WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      [req.params.id, req.hotelId]
    );
    if (!row) throw notFound('Payroll record not found');
    await tx(async (client) => {
      await postJournal(client, {
        hotelId: req.hotelId,
        date: new Date().toISOString().slice(0, 10),
        refType: 'payroll',
        refId: row.id,
        memo: `Salary payout ${row.period}`,
        createdBy: req.user.id,
        lines: [
          { code: '5000', debit: Number(row.net_pay), credit: 0 },
          { code: '1000', debit: 0, credit: Number(row.net_pay) },
        ],
      });
    });
    res.json(row);
  })
);

// ---------------- SHIFTS ----------------
const shifts = await crud({
  table: 'shifts',
  resource: 'Shift',
  search: ['name'],
  defaultSort: 'start_time',
  writable: ['name', 'start_time', 'end_time', 'grace_min', 'is_active'],
});
r.use('/shifts', shifts);

r.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await one(
      `SELECT ${STAFF_SELECT} FROM staff_profiles sp ${STAFF_JOINS} WHERE sp.id=$1 AND sp.hotel_id=$2`,
      [req.params.id, req.hotelId]
    );
    if (!row) throw notFound('Staff member not found');
    const [attendance, leaves, payroll] = await Promise.all([
      many(`SELECT * FROM attendance WHERE staff_id=$1 ORDER BY work_date DESC LIMIT 60`, [row.id]),
      many(`SELECT * FROM leave_requests WHERE staff_id=$1 ORDER BY from_date DESC LIMIT 30`, [row.id]),
      many(`SELECT * FROM payroll WHERE staff_id=$1 ORDER BY period DESC LIMIT 24`, [row.id]),
    ]);
    res.json({ staff: row, attendance, leaves, payroll });
  })
);

export default r;
