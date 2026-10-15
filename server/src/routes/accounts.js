import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging, todayStr, round2, monthRange } from '../utils/api.js';
import { crud } from '../db/crud.js';
import { postJournal, ensureHotelAccounts } from '../services/accounting.js';
import { docNo } from '../services/numbering.js';

const r = Router();

// ---------------- CHART OF ACCOUNTS ----------------
r.get(
  '/chart',
  asyncHandler(async (req, res) => {
    await tx(async (c) => ensureHotelAccounts(c, req.hotelId));
    const rows = await many(
      `SELECT a.*,
              (SELECT count(*)::int FROM journal_lines jl WHERE jl.account_id = a.id) AS entries,
              (SELECT coalesce(sum(jl.debit),0) FROM journal_lines jl WHERE jl.account_id = a.id) AS total_debit,
              (SELECT coalesce(sum(jl.credit),0) FROM journal_lines jl WHERE jl.account_id = a.id) AS total_credit
         FROM accounts a WHERE a.hotel_id = $1 ORDER BY a.code`,
      [req.hotelId]
    );
    const grouped = {};
    for (const row of rows) {
      const g = row.group_name || 'Other';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(row);
    }
    res.json({ items: rows, grouped });
  })
);

r.post(
  '/chart',
  asyncHandler(async (req, res) => {
    const { code, name, type, group_name } = req.body || {};
    if (!code || !name || !type) throw badRequest('code, name and type are required');
    const dupe = await one(`SELECT id FROM accounts WHERE hotel_id=$1 AND code=$2`, [req.hotelId, code]);
    if (dupe) throw badRequest(`Account code ${code} already exists`);
    const row = await one(
      `INSERT INTO accounts (hotel_id, code, name, type, group_name) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.hotelId, code, name, type, group_name || 'Other']
    );
    res.status(201).json(row);
  })
);

r.put(
  '/chart/:id',
  asyncHandler(async (req, res) => {
    const { name, type, group_name, is_active } = req.body || {};
    const row = await one(
      `UPDATE accounts SET name=COALESCE($3,name), type=COALESCE($4,type),
              group_name=COALESCE($5,group_name), is_active=COALESCE($6,is_active)
        WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      [req.params.id, req.hotelId, name || null, type || null, group_name || null,
        is_active === undefined ? null : is_active]
    );
    if (!row) throw notFound('Account not found');
    res.json(row);
  })
);

// ---------------- JOURNAL ----------------
r.get(
  '/journal',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 30 });
    const p = [req.hotelId];
    const where = ['je.hotel_id = $1'];
    if (req.query.from) { p.push(req.query.from); where.push(`je.entry_date >= $${p.length}::date`); }
    if (req.query.to) { p.push(req.query.to); where.push(`je.entry_date <= $${p.length}::date`); }
    if (req.query.ref_type) { p.push(req.query.ref_type); where.push(`je.ref_type = $${p.length}`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM journal_entries je ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT je.*, u.name AS created_by_name,
              (SELECT coalesce(json_agg(json_build_object(
                 'account', a.name, 'code', a.code, 'debit', jl.debit, 'credit', jl.credit)), '[]'::json)
                 FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
                 WHERE jl.entry_id = je.id) AS lines
         FROM journal_entries je LEFT JOIN users u ON u.id = je.created_by
         ${whereSql} ORDER BY je.entry_date DESC, je.created_at DESC
         LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.post(
  '/journal',
  asyncHandler(async (req, res) => {
    const { entry_date, memo, lines = [] } = req.body || {};
    if (lines.length < 2) throw badRequest('A journal entry needs at least two lines');
    const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (round2(debit) !== round2(credit)) throw badRequest('Total debit must equal total credit');
    if (lines.some((l) => (!l.account_id && !l.code) || (!l.debit && !l.credit))) {
      throw badRequest('Each line needs an account and either a debit or credit amount');
    }
    const out = await tx(async (client) => {
      const entry = await postJournal(client, {
        hotelId: req.hotelId,
        date: entry_date || todayStr(),
        refType: 'manual',
        memo: memo || 'Manual entry',
        createdBy: req.user.id,
        lines,
      });
      return entry;
    });
    res.status(201).json(out);
  })
);

// ---------------- EXPENSES ----------------
const expenses = await crud({
  table: 'expenses',
  resource: 'Expense',
  search: ['title', 'vendor', 'category', 'expense_no', 'notes'],
  defaultSort: 'expense_date',
  sortable: ['expense_date', 'amount', 'total', 'created_at', 'category'],
  select: `expenses.*, a.name AS account_name, u.name AS created_by_name`,
  joins: 'LEFT JOIN accounts a ON a.id = expenses.account_id LEFT JOIN users u ON u.id = expenses.created_by',
  writable: ['category', 'account_id', 'title', 'vendor', 'amount', 'tax', 'total', 'expense_date',
    'payment_method', 'status', 'notes', 'attachment', 'created_by'],
  async beforeWrite(body, req, mode) {
    if (mode === 'create') {
      if (!body.expense_no) body.expense_no = await docNo(null, req.hotelId, 'expense', 'EXP', 4);
      body.created_by = req.user.id;
      if (body.amount !== undefined && body.total === undefined) {
        body.total = Number(body.amount) + Number(body.tax || 0);
      }
    }
    return body;
  },
  async afterCreate(row, req) {
    if (row.status !== 'paid') return;
    await tx(async (client) => {
      await postJournal(client, {
        hotelId: req.hotelId,
        date: row.expense_date,
        refType: 'expense',
        refId: row.id,
        memo: `Expense · ${row.title}`,
        createdBy: req.user.id,
        lines: [
          { code: '5009', debit: Number(row.total), credit: 0 },
          { code: '1000', debit: 0, credit: Number(row.total) },
        ],
      });
    });
  },
});
r.use('/expenses', expenses);

// ---------------- SUMMARY ----------------
r.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const from = req.query.from || monthRange(-5).start;
    const to = req.query.to || todayStr();
    const [types, monthly] = await Promise.all([
      many(
        `SELECT type, coalesce(sum(balance),0) AS balance, count(*)::int AS count
           FROM accounts WHERE hotel_id=$1 GROUP BY type ORDER BY type`,
        [req.hotelId]
      ),
      many(
        `SELECT to_char(date_trunc('month', entry_date), 'YYYY-MM') AS month,
                coalesce(sum(total_debit),0) AS total
           FROM journal_entries
          WHERE hotel_id=$1 AND entry_date BETWEEN $2::date AND $3::date
          GROUP BY 1 ORDER BY 1`,
        [req.hotelId, from, to]
      ),
    ]);
    const income = await one(
      `SELECT coalesce(sum(jl.credit - jl.debit),0) AS value
         FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
         JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.hotel_id=$1 AND a.type='income' AND je.entry_date BETWEEN $2::date AND $3::date`,
      [req.hotelId, from, to]
    );
    const expense = await one(
      `SELECT coalesce(sum(jl.debit - jl.credit),0) AS value
         FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
         JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.hotel_id=$1 AND a.type='expense' AND je.entry_date BETWEEN $2::date AND $3::date`,
      [req.hotelId, from, to]
    );
    const cash = await one(
      `SELECT coalesce(sum(amount) FILTER (WHERE direction='in'),0) AS inflow,
              coalesce(sum(amount) FILTER (WHERE direction='out'),0) AS outflow
         FROM payments WHERE hotel_id=$1 AND paid_at::date BETWEEN $2::date AND $3::date`,
      [req.hotelId, from, to]
    );
    const receivable = await one(
      `SELECT coalesce(sum(total - paid),0) AS value FROM invoices
        WHERE hotel_id=$1 AND status IN ('unpaid','partial')`,
      [req.hotelId]
    );
    const payable = await one(
      `SELECT coalesce(sum(total - paid),0) AS value FROM purchase_orders
        WHERE hotel_id=$1 AND status IN ('received','partial')`,
      [req.hotelId]
    );
    res.json({
      from, to,
      types,
      monthly,
      income: Number(income.value),
      expense: Number(expense.value),
      profit: Number(income.value) - Number(expense.value),
      cash_in: Number(cash.inflow),
      cash_out: Number(cash.outflow),
      receivable: Number(receivable.value),
      payable: Number(payable.value),
    });
  })
);

// ---------------- P&L ----------------
r.get(
  '/reports/pnl',
  asyncHandler(async (req, res) => {
    const from = req.query.from || monthRange(-5).start;
    const to = req.query.to || todayStr();
    const rows = await many(
      `SELECT a.type, a.code, a.name, a.group_name,
              coalesce(sum(jl.debit),0) AS debit, coalesce(sum(jl.credit),0) AS credit
         FROM accounts a
         JOIN journal_lines jl ON jl.account_id = a.id
         JOIN journal_entries je ON je.id = jl.entry_id AND je.entry_date BETWEEN $2::date AND $3::date
        WHERE a.hotel_id=$1 AND a.type IN ('income','expense')
        GROUP BY a.id ORDER BY a.code`,
      [req.hotelId, from, to]
    );
    const incomeRows = rows
      .filter((x) => x.type === 'income')
      .map((x) => ({ ...x, amount: Number(x.credit) - Number(x.debit) }))
      .filter((x) => Math.abs(x.amount) > 0.001);
    const expenseRows = rows
      .filter((x) => x.type === 'expense')
      .map((x) => ({ ...x, amount: Number(x.debit) - Number(x.credit) }))
      .filter((x) => Math.abs(x.amount) > 0.001);
    const income = incomeRows.reduce((s, x) => s + x.amount, 0);
    const expense = expenseRows.reduce((s, x) => s + x.amount, 0);
    res.json({ from, to, incomeRows, expenseRows, income, expense, net: income - expense });
  })
);

// ---------------- TRIAL BALANCE ----------------
r.get(
  '/reports/trial-balance',
  asyncHandler(async (req, res) => {
    const conds = [];
    const p = [req.hotelId];
    if (req.query.from) { p.push(req.query.from); conds.push(`je.entry_date >= $${p.length}::date`); }
    if (req.query.to) { p.push(req.query.to); conds.push(`je.entry_date <= $${p.length}::date`); }
    const dateFilter = conds.length ? conds.join(' AND ') : 'true';
    const rows = await many(
      `SELECT a.code, a.name, a.type,
              coalesce(sum(jl.debit),0) AS debit, coalesce(sum(jl.credit),0) AS credit
         FROM accounts a
         LEFT JOIN journal_lines jl ON jl.account_id = a.id
         LEFT JOIN journal_entries je ON je.id = jl.entry_id AND ${dateFilter}
        WHERE a.hotel_id=$1
        GROUP BY a.id HAVING coalesce(sum(jl.debit),0) <> coalesce(sum(jl.credit),0)
        ORDER BY a.code`,
      p
    );
    const totals = rows.reduce(
      (acc, x) => ({ debit: acc.debit + Number(x.debit), credit: acc.credit + Number(x.credit) }),
      { debit: 0, credit: 0 }
    );
    res.json({ rows, totals });
  })
);

// ---------------- BALANCE SHEET ----------------
r.get(
  '/reports/balance-sheet',
  asyncHandler(async (req, res) => {
    const asOn = req.query.as_on || todayStr();
    const rows = await many(
      `SELECT a.type, a.code, a.name, a.group_name,
              case when a.type in ('asset','expense') then coalesce(sum(jl.debit - jl.credit),0)
                   else coalesce(sum(jl.credit - jl.debit),0) end AS balance
         FROM accounts a
         LEFT JOIN journal_lines jl ON jl.account_id = a.id
         LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.entry_date <= $2::date
        WHERE a.hotel_id=$1 AND a.type IN ('asset','liability','equity')
        GROUP BY a.id HAVING coalesce(sum(jl.debit),0) <> coalesce(sum(jl.credit),0)
        ORDER BY a.code`,
      [req.hotelId, asOn]
    );
    const pick = (t) => rows.filter((x) => x.type === t);
    const totals = {
      asset: pick('asset').reduce((s, x) => s + Number(x.balance), 0),
      liability: pick('liability').reduce((s, x) => s + Number(x.balance), 0),
      equity: pick('equity').reduce((s, x) => s + Number(x.balance), 0),
    };
    res.json({ as_on: asOn, rows, totals, balanced: Math.abs(totals.asset - (totals.liability + totals.equity)) < 1 });
  })
);

// ---------------- PAYMENTS LEDGER ----------------
r.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 30 });
    const p = [req.hotelId];
    const where = ['p.hotel_id = $1'];
    if (req.query.direction) { p.push(req.query.direction); where.push(`p.direction = $${p.length}`); }
    if (req.query.method) { p.push(req.query.method); where.push(`p.method = $${p.length}`); }
    if (req.query.from) { p.push(req.query.from); where.push(`p.paid_at >= $${p.length}::date`); }
    if (req.query.to) { p.push(req.query.to); where.push(`p.paid_at < ($${p.length}::date + interval '1 day')`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM payments p ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT p.*, u.name AS received_by_name, b.code AS booking_code, i.invoice_no
         FROM payments p
         LEFT JOIN users u ON u.id = p.received_by
         LEFT JOIN bookings b ON b.id = p.booking_id
         LEFT JOIN invoices i ON i.id = p.invoice_id
         ${whereSql} ORDER BY p.paid_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    const sums = await one(
      `SELECT coalesce(sum(amount) FILTER (WHERE direction='in'),0) AS inflow,
              coalesce(sum(amount) FILTER (WHERE direction='out'),0) AS outflow
         FROM payments p ${whereSql.replace(/p\./g, 'p.')}`,
      p
    );
    res.json({ ...listResponse(rows, total, { page, limit }), sums });
  })
);

export default r;
