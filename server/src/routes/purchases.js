import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging, todayStr } from '../utils/api.js';
import { docNo } from '../services/numbering.js';
import { postJournal } from '../services/accounting.js';

const r = Router();

const SELECT = `po.*, s.name AS supplier_name, s.phone AS supplier_phone,
  u.name AS created_by_name,
  (SELECT count(*)::int FROM purchase_order_items i WHERE i.po_id = po.id) AS line_items,
  (SELECT coalesce(sum(received_qty),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS received`;

const JOINS = `LEFT JOIN suppliers s ON s.id = po.supplier_id LEFT JOIN users u ON u.id = po.created_by`;

// ---------------- LIST ----------------
r.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 25 });
    const p = [req.hotelId];
    const where = ['po.hotel_id = $1'];
    if (req.query.status) { p.push(req.query.status); where.push(`po.status = $${p.length}`); }
    if (req.query.supplier_id) { p.push(req.query.supplier_id); where.push(`po.supplier_id = $${p.length}`); }
    const q = String(req.query.q || '').trim();
    if (q) { p.push(`%${q}%`); where.push(`(po.po_no ILIKE $${p.length} OR s.name ILIKE $${p.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM purchase_orders po ${JOINS} ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT ${SELECT} FROM purchase_orders po ${JOINS} ${whereSql}
        ORDER BY po.order_date DESC, po.created_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const po = await one(
      `SELECT ${SELECT} FROM purchase_orders po ${JOINS} WHERE po.id=$1 AND po.hotel_id=$2`,
      [req.params.id, req.hotelId]
    );
    if (!po) throw notFound('Purchase order not found');
    const items = await many(
      `SELECT pi.*, ii.sku, ii.unit, ii.stock_qty FROM purchase_order_items pi
         LEFT JOIN inventory_items ii ON ii.id = pi.item_id
        WHERE pi.po_id=$1 ORDER BY pi.created_at`,
      [po.id]
    );
    const payments = await many(
      `SELECT * FROM payments WHERE ref_type='purchase' AND ref_id=$1 ORDER BY paid_at DESC`, [po.id]
    ).catch(() => []);
    res.json({ po, items, payments });
  })
);

// ---------------- CREATE ----------------
r.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const items = b.items || [];
    if (!items.length) throw badRequest('Add at least one line item');
    if (!b.supplier_id) throw badRequest('Select a supplier');

    const out = await tx(async (client) => {
      const poNo = await docNo(client, req.hotelId, 'purchase', 'PO', 4);
      let sub = 0;
      for (const it of items) sub += Number(it.qty || 0) * Number(it.rate || 0);
      const tax = Number(b.tax || 0);
      const discount = Number(b.discount || 0);
      const total = sub + tax - discount;

      const po = await tsql(
        client,
        `INSERT INTO purchase_orders (hotel_id, po_no, supplier_id, order_date, expected_date, status,
            sub_total, tax, discount, total, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [req.hotelId, poNo, b.supplier_id, b.order_date || todayStr(), b.expected_date || null,
          b.status || 'draft', sub, tax, discount, total, b.notes || null, req.user.id]
      );
      for (const it of items) {
        const amount = Number(it.qty || 0) * Number(it.rate || 0);
        await tsql(
          client,
          `INSERT INTO purchase_order_items (po_id, hotel_id, item_id, name, qty, rate, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [po.rows[0].id, req.hotelId, it.item_id || null, it.name || 'Item',
            Number(it.qty || 1), Number(it.rate || 0), amount]
        );
      }
      return po.rows[0];
    });
    res.status(201).json(out);
  })
);

// ---------------- UPDATE ----------------
r.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await one(`SELECT * FROM purchase_orders WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]);
    if (!existing) throw notFound('Purchase order not found');
    if (['received', 'cancelled'].includes(existing.status)) {
      throw badRequest('This purchase order can no longer be edited');
    }
    const b = req.body || {};
    const out = await tx(async (client) => {
      let sub = existing.sub_total;
      if (Array.isArray(b.items)) {
        await tsql(client, `DELETE FROM purchase_order_items WHERE po_id=$1`, [existing.id]);
        sub = 0;
        for (const it of b.items) {
          const amount = Number(it.qty || 0) * Number(it.rate || 0);
          sub += amount;
          await tsql(
            client,
            `INSERT INTO purchase_order_items (po_id, hotel_id, item_id, name, qty, rate, amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [existing.id, req.hotelId, it.item_id || null, it.name || 'Item',
              Number(it.qty || 1), Number(it.rate || 0), amount]
          );
        }
      }
      const tax = b.tax !== undefined ? Number(b.tax) : Number(existing.tax);
      const discount = b.discount !== undefined ? Number(b.discount) : Number(existing.discount);
      const total = sub + tax - discount;
      const po = await tsql(
        client,
        `UPDATE purchase_orders SET supplier_id=$3, expected_date=$4, notes=$5, status=$6,
            sub_total=$7, tax=$8, discount=$9, total=$10
          WHERE id=$1 AND hotel_id=$2 RETURNING *`,
        [existing.id, req.hotelId, b.supplier_id || existing.supplier_id,
          b.expected_date ?? existing.expected_date, b.notes ?? existing.notes,
          b.status || existing.status, sub, tax, discount, total]
      );
      return po.rows[0];
    });
    res.json(out);
  })
);

// ---------------- RECEIVE GOODS ----------------
r.post(
  '/:id/receive',
  asyncHandler(async (req, res) => {
    const existing = await one(`SELECT * FROM purchase_orders WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]);
    if (!existing) throw notFound('Purchase order not found');
    if (existing.status === 'cancelled') throw badRequest('Purchase order is cancelled');

    const lines = await many(`SELECT * FROM purchase_order_items WHERE po_id=$1`, [existing.id]);
    const receiveAll = req.body?.full !== false;
    const qtys = req.body?.quantities || {};

    const out = await tx(async (client) => {
      let any = false;
      let fully = true;
      for (const line of lines) {
        const qty = receiveAll
          ? Number(line.qty) - Number(line.received_qty)
          : Number(qtys[line.id] ?? 0);
        if (qty <= 0) { if (Number(line.received_qty) < Number(line.qty)) fully = false; continue; }
        any = true;
        await tsql(client,
          `UPDATE purchase_order_items SET received_qty = received_qty + $2 WHERE id=$1`,
          [line.id, qty]);
        if (line.item_id) {
          await tsql(client, `UPDATE inventory_items SET stock_qty = stock_qty + $2 WHERE id=$1`,
            [line.item_id, qty]);
          await tsql(
            client,
            `INSERT INTO stock_movements (hotel_id, item_id, type, qty, ref_type, ref_id, note, unit_cost, created_by)
             VALUES ($1,$2,'in',$3,'purchase',$4,$5,$6,$7)`,
            [req.hotelId, line.item_id, qty, existing.id, `Received against ${existing.po_no}`, line.rate, req.user.id]
          );
        }
        if (!receiveAll) fully = false;
      }
      if (!any) throw badRequest('Nothing to receive');
      const status = fully ? 'received' : 'partial';
      const po = await tsql(client,
        `UPDATE purchase_orders SET status=$3, paid = CASE WHEN $3='received' THEN paid ELSE paid END
          WHERE id=$1 AND hotel_id=$2 RETURNING *`,
        [existing.id, req.hotelId, status]);

      if (fully) {
        await postJournal(client, {
          hotelId: req.hotelId,
          date: todayStr(),
          refType: 'purchase',
          refId: existing.id,
          memo: `Purchase received ${existing.po_no}`,
          createdBy: req.user.id,
          lines: [
            { code: '1030', debit: Number(existing.total), credit: 0 },
            { code: '2000', debit: 0, credit: Number(existing.total) },
          ],
        });
      }
      return po.rows[0];
    });
    res.json(out);
  })
);

// ---------------- PAY / BILL ----------------
r.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const existing = await one(`SELECT * FROM purchase_orders WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]);
    if (!existing) throw notFound('Purchase order not found');
    const amount = Number(req.body?.amount || 0);
    if (amount <= 0) throw badRequest('Amount must be greater than 0');
    const due = Number(existing.total) - Number(existing.paid);
    if (amount > due + 0.001) throw badRequest(`Amount exceeds outstanding due of ₹${due}`);

    const out = await tx(async (client) => {
      const pay = await tsql(
        client,
        `INSERT INTO payments (hotel_id, amount, method, reference, direction, category, notes, received_by, ref_type, ref_id)
         VALUES ($1,$2,$3,$4,'out','supplier',$5,$6,'purchase',$7) RETURNING *`,
        [req.hotelId, amount, req.body.method || 'bank_transfer', req.body.reference || null,
          req.body.notes || null, req.user.id, existing.id]
      );
      const po = await tsql(client,
        `UPDATE purchase_orders SET paid = paid + $3 WHERE id=$1 AND hotel_id=$2 RETURNING *`,
        [existing.id, req.hotelId, amount]);
      await tsql(client,
        `UPDATE suppliers SET total_dues = greatest(0, total_dues - $2) WHERE id=$3 AND $1::uuid IS NOT NULL`,
        [req.hotelId, amount, existing.supplier_id]);
      await postJournal(client, {
        hotelId: req.hotelId,
        date: todayStr(),
        refType: 'payment',
        refId: pay.rows[0].id,
        memo: `Payment for ${existing.po_no}`,
        createdBy: req.user.id,
        lines: [
          { code: '2000', debit: amount, credit: 0 },
          { code: '1000', debit: 0, credit: amount },
        ],
      });
      return { payment: pay.rows[0], po: po.rows[0] };
    });
    res.json(out);
  })
);

// ---------------- CANCEL ----------------
r.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const row = await one(
      `UPDATE purchase_orders SET status='cancelled' WHERE id=$1 AND hotel_id=$2
        AND status IN ('draft','sent') RETURNING *`,
      [req.params.id, req.hotelId]
    );
    if (!row) throw badRequest('This purchase order cannot be cancelled');
    res.json(row);
  })
);

r.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await one(`SELECT status FROM purchase_orders WHERE id=$1 AND hotel_id=$2`,
      [req.params.id, req.hotelId]);
    if (!row) throw notFound('Purchase order not found');
    if (!['draft', 'cancelled'].includes(row.status)) {
      throw badRequest('Only draft purchase orders can be deleted');
    }
    await sql(`DELETE FROM purchase_orders WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    res.json({ deleted: true });
  })
);

export default r;
