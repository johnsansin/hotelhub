import { many, one, tsql } from '../db/pool.js';
import { docNo } from './numbering.js';

export const ACCOUNT_TEMPLATE = [
  ['1000', 'Cash in Hand', 'asset', 'Current Assets'],
  ['1010', 'Bank Account', 'asset', 'Current Assets'],
  ['1020', 'Accounts Receivable', 'asset', 'Current Assets'],
  ['1030', 'Inventory Stock', 'asset', 'Current Assets'],
  ['1040', 'Advance to Guests', 'asset', 'Current Assets'],
  ['2000', 'Accounts Payable', 'liability', 'Current Liabilities'],
  ['2010', 'Tax Payable (GST)', 'liability', 'Current Liabilities'],
  ['2020', 'Guest Advances', 'liability', 'Current Liabilities'],
  ['3000', "Owner's Capital", 'equity', 'Equity'],
  ['3010', 'Retained Earnings', 'equity', 'Equity'],
  ['4000', 'Room Revenue', 'income', 'Operating Income'],
  ['4010', 'Restaurant Revenue', 'income', 'Operating Income'],
  ['4020', 'Retail / POS Sales', 'income', 'Operating Income'],
  ['4030', 'Event & Banquet Revenue', 'income', 'Operating Income'],
  ['4040', 'Spa & Other Income', 'income', 'Operating Income'],
  ['5000', 'Salaries & Wages', 'expense', 'Operating Expenses'],
  ['5001', 'Utilities (Power & Water)', 'expense', 'Operating Expenses'],
  ['5002', 'Food & Beverage Cost', 'expense', 'Operating Expenses'],
  ['5003', 'Housekeeping Supplies', 'expense', 'Operating Expenses'],
  ['5004', 'Maintenance & Repairs', 'expense', 'Operating Expenses'],
  ['5005', 'Marketing & Commission', 'expense', 'Operating Expenses'],
  ['5006', 'Rent & Property', 'expense', 'Operating Expenses'],
  ['5007', 'Laundry & Linen', 'expense', 'Operating Expenses'],
  ['5008', 'Software & Subscriptions', 'expense', 'Operating Expenses'],
  ['5009', 'Miscellaneous Expense', 'expense', 'Operating Expenses'],
];

export async function ensureHotelAccounts(client, hotelId) {
  const existing = await tsql(client, 'SELECT count(*)::int AS c FROM accounts WHERE hotel_id=$1', [hotelId]);
  if (Number(existing.rows[0].c) > 0) return;
  for (const [code, name, type, group] of ACCOUNT_TEMPLATE) {
    await tsql(
      client,
      `INSERT INTO accounts (hotel_id, code, name, type, group_name, is_system)
       VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`,
      [hotelId, code, name, type, group]
    );
  }
}

export async function accountByCode(client, hotelId, code) {
  return one('SELECT * FROM accounts WHERE hotel_id=$1 AND code=$2', [hotelId, code]).then(
    (r) => r || null
  ).catch(() => null);
}

/**
 * lines: [{ code | account_id, debit, credit, memo }]
 */
export async function postJournal(client, { hotelId, date, refType, refId, memo, lines = [], createdBy }) {
  const entryNo = await docNo(client, hotelId, 'journal', 'JE', 5);
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const entry = await tsql(
    client,
    `INSERT INTO journal_entries (hotel_id, entry_no, entry_date, ref_type, ref_id, memo,
       total_debit, total_credit, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [hotelId, entryNo, date, refType, refId || null, memo || null, totalDebit, totalCredit, createdBy || null]
  );
  const entryId = entry.rows[0].id;
  for (const l of lines) {
    let accountId = l.account_id;
    if (!accountId && l.code) {
      const acc = await tsql(client, 'SELECT id FROM accounts WHERE hotel_id=$1 AND code=$2', [hotelId, l.code]);
      accountId = acc.rows[0]?.id;
    }
    if (!accountId) continue;
    await tsql(
      client,
      `INSERT INTO journal_lines (entry_id, hotel_id, account_id, debit, credit, memo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entryId, hotelId, accountId, Number(l.debit || 0), Number(l.credit || 0), l.memo || null]
    );
    await tsql(client, 'UPDATE accounts SET balance = balance + $2 WHERE id = $1', [
      accountId,
      Number(l.debit || 0) - Number(l.credit || 0),
    ]);
  }
  return entry.rows[0];
}
