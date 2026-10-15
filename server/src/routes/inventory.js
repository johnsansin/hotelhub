import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging } from '../utils/api.js';
import { crud } from '../db/crud.js';

const r = Router();

// ---------------- SUPPLIERS ----------------
const suppliers = await crud({
  table: 'suppliers',
  resource: 'Supplier',
  search: ['name', 'contact_name', 'phone', 'email', 'city', 'categories'],
  defaultSort: 'name',
  sortable: ['name', 'created_at', 'total_dues'],
  writable: ['name', 'contact_name', 'phone', 'email', 'address', 'city', 'gst_no',
    'payment_terms', 'categories', 'notes', 'is_active', 'total_dues'],
});
r.use('/suppliers', suppliers);

// ---------------- CATEGORIES ----------------
const categories = await crud({
  table: 'inventory_categories',
  resource: 'Category',
  search: ['name'],
  defaultSort: 'name',
  writable: ['name', 'parent_id'],
});
r.use('/categories', categories);

// ---------------- ITEMS ----------------
const items = await crud({
  table: 'inventory_items',
  resource: 'Item',
  search: ['name', 'sku', 'location'],
  defaultSort: 'name',
  sortable: ['name', 'stock_qty', 'cost_price', 'created_at', 'reorder_level'],
  select: `inventory_items.*, ic.name AS category_name, s.name AS supplier_name,
    CASE WHEN inventory_items.stock_qty <= inventory_items.reorder_level THEN true ELSE false END AS low_stock`,
  joins: 'LEFT JOIN inventory_categories ic ON ic.id = inventory_items.category_id LEFT JOIN suppliers s ON s.id = inventory_items.supplier_id',
  writable: ['name', 'sku', 'category_id', 'unit', 'stock_qty', 'reorder_level', 'cost_price',
    'sell_price', 'supplier_id', 'location', 'expiry_date', 'is_active'],
  async custom(router) {
    router.post('/:id/stock', asyncHandler(async (req, res) => {
      const { type, qty, note, unit_cost } = req.body || {};
      const q = Number(qty);
      if (!['in', 'out', 'adjustment', 'return', 'transfer'].includes(type)) throw badRequest('Invalid movement type');
      if (!q || (type !== 'adjustment' && q <= 0)) throw badRequest('qty must be greater than 0');
      const item = await one('SELECT * FROM inventory_items WHERE id=$1 AND hotel_id=$2', [req.params.id, req.hotelId]);
      if (!item) throw notFound('Item not found');
      const delta = type === 'out' ? -Math.abs(q) : type === 'adjustment' ? q : Math.abs(q);
      const newQty = Math.max(0, Number(item.stock_qty) + delta);
      const out = await tx(async (client) => {
        await tsql(client, `UPDATE inventory_items SET stock_qty=$3 WHERE id=$1 AND hotel_id=$2`,
          [item.id, req.hotelId, newQty]);
        const mv = await tsql(
          client,
          `INSERT INTO stock_movements (hotel_id, item_id, type, qty, note, unit_cost, created_by, ref_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'manual') RETURNING *`,
          [req.hotelId, item.id, type, q, note || null, unit_cost || null, req.user.id]
        );
        return { item: { ...item, stock_qty: newQty }, movement: mv.rows[0] };
      });
      res.json(out);
    }));
  },
});
r.use('/items', items);

// ---------------- STOCK LEDGER ----------------
r.get(
  '/stock',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 50 });
    const p = [req.hotelId];
    const where = ['sm.hotel_id = $1'];
    if (req.query.item_id) { p.push(req.query.item_id); where.push(`sm.item_id = $${p.length}`); }
    if (req.query.type) { p.push(req.query.type); where.push(`sm.type = $${p.length}`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM stock_movements sm ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT sm.*, ii.name AS item_name, ii.unit, u.name AS created_by_name
         FROM stock_movements sm
         JOIN inventory_items ii ON ii.id = sm.item_id
         LEFT JOIN users u ON u.id = sm.created_by
         ${whereSql} ORDER BY sm.created_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT ii.*, ic.name AS category_name FROM inventory_items ii
         LEFT JOIN inventory_categories ic ON ic.id = ii.category_id
        WHERE ii.hotel_id=$1 AND ii.is_active AND ii.stock_qty <= ii.reorder_level
        ORDER BY ii.stock_qty ASC`,
      [req.hotelId]
    );
    res.json({ items: rows, count: rows.length });
  })
);

r.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const summary = await one(
      `SELECT
        (SELECT count(*)::int FROM inventory_items WHERE hotel_id=$1 AND is_active) AS items,
        (SELECT count(*)::int FROM inventory_items WHERE hotel_id=$1 AND is_active AND stock_qty <= reorder_level) AS low_stock,
        (SELECT coalesce(sum(stock_qty * cost_price),0) FROM inventory_items WHERE hotel_id=$1) AS stock_value,
        (SELECT count(*)::int FROM suppliers WHERE hotel_id=$1 AND is_active) AS suppliers,
        (SELECT count(*)::int FROM purchase_orders WHERE hotel_id=$1 AND status IN ('draft','sent','partial')) AS open_pos,
        (SELECT coalesce(sum(total - paid),0) FROM purchase_orders WHERE hotel_id=$1 AND status <> 'cancelled') AS payables,
        (SELECT count(*)::int FROM sales WHERE hotel_id=$1 AND status <> 'void') AS sales_count,
        (SELECT coalesce(sum(total),0) FROM sales WHERE hotel_id=$1 AND status <> 'void') AS sales_total`,
      [req.hotelId]
    );
    res.json(summary);
  })
);

export default r;
