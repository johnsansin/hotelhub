import { Router } from 'express';
import { one, many, sql, tx, tsql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, listResponse, parsePaging, todayStr, round2 } from '../utils/api.js';
import { crud } from '../db/crud.js';
import { docNo } from '../services/numbering.js';
import { postJournal } from '../services/accounting.js';

const r = Router();

// ---------------- MENU ----------------
const menuCats = await crud({
  table: 'menu_categories',
  resource: 'Menu category',
  search: ['name'],
  defaultSort: 'sort_order',
  sortable: ['sort_order', 'name', 'created_at'],
  writable: ['name', 'sort_order', 'is_active'],
});
r.use('/categories', menuCats);

const menuItems = await crud({
  table: 'menu_items',
  resource: 'Menu item',
  search: ['name', 'description', 'code'],
  defaultSort: 'name',
  sortable: ['name', 'price', 'created_at'],
  select: `menu_items.*, mc.name AS category_name,
    (SELECT count(*)::int FROM order_items oi WHERE oi.menu_item_id = menu_items.id) AS times_ordered`,
  joins: 'LEFT JOIN menu_categories mc ON mc.id = menu_items.category_id',
  writable: ['category_id', 'name', 'description', 'price', 'cost', 'code', 'image', 'is_veg',
    'is_available', 'prep_time', 'taxes'],
});
r.use('/items', menuItems);

// ---------------- TABLES ----------------
const tables = await crud({
  table: 'restaurant_tables',
  resource: 'Table',
  search: ['name', 'area'],
  defaultSort: 'name',
  writable: ['name', 'area', 'seats', 'status', 'is_active'],
  select: `restaurant_tables.*,
    (SELECT o.id FROM orders o WHERE o.table_id = restaurant_tables.id
       AND o.status NOT IN ('paid','cancelled') LIMIT 1) AS active_order_id`,
});
r.use('/tables', tables);

// ---------------- ORDERS ----------------
const ORDER_SELECT = `o.*, t.name AS table_name, b.room_number AS booking_room,
  u.name AS served_by_name,
  (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
  (SELECT coalesce(sum(qty),0) FROM order_items oi WHERE oi.order_id = o.id) AS total_qty`;
const ORDER_JOINS = `LEFT JOIN restaurant_tables t ON t.id = o.table_id
  LEFT JOIN bookings b ON b.id = o.booking_id
  LEFT JOIN users u ON u.id = o.served_by`;

r.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 25 });
    const p = [req.hotelId];
    const where = ['o.hotel_id = $1'];
    if (req.query.status) {
      if (req.query.status === 'open') where.push(`o.status NOT IN ('paid','cancelled')`);
      else { p.push(req.query.status); where.push(`o.status = $${p.length}`); }
    }
    if (req.query.type) { p.push(req.query.type); where.push(`o.type = $${p.length}`); }
    if (req.query.today) {
      p.push(todayStr());
      where.push(`o.created_at >= $${p.length}::date AND o.created_at < $${p.length}::date + interval '1 day'`);
    }
    const q = String(req.query.q || '').trim();
    if (q) { p.push(`%${q}%`); where.push(`(o.order_no ILIKE $${p.length} OR o.guest_name ILIKE $${p.length} OR o.room_number ILIKE $${p.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM orders o ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT ${ORDER_SELECT} FROM orders o ${ORDER_JOINS} ${whereSql}
        ORDER BY o.created_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.get(
  '/orders/stats',
  asyncHandler(async (req, res) => {
    const stats = await one(
      `SELECT
        (SELECT count(*)::int FROM orders WHERE hotel_id=$1 AND status NOT IN ('paid','cancelled')) AS open_orders,
        (SELECT count(*)::int FROM orders WHERE hotel_id=$1 AND status IN ('preparing','new','confirmed')) AS in_kitchen,
        (SELECT count(*)::int FROM orders WHERE hotel_id=$1 AND created_at >= CURRENT_DATE AND status <> 'cancelled') AS today_orders,
        (SELECT coalesce(sum(total),0) FROM orders WHERE hotel_id=$1 AND created_at >= CURRENT_DATE AND status <> 'cancelled') AS today_sales,
        (SELECT coalesce(sum(total - paid),0) FROM orders WHERE hotel_id=$1 AND status NOT IN ('paid','cancelled')) AS pending_bills`,
      [req.hotelId]
    );
    res.json(stats);
  })
);

async function computeOrderTotals(orderId) {
  const agg = await one(
    `SELECT coalesce(sum(amount - discount),0) AS sub, coalesce(sum(tax),0) AS tax
       FROM order_items WHERE order_id=$1 AND status <> 'cancelled'`,
    [orderId]
  );
  return { sub: round2(agg.sub), tax: round2(agg.tax) };
}

r.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await one(
      `SELECT ${ORDER_SELECT} FROM orders o ${ORDER_JOINS} WHERE o.id=$1 AND o.hotel_id=$2`,
      [req.params.id, req.hotelId]
    );
    if (!order) throw notFound('Order not found');
    const items = await many(
      `SELECT oi.*, mi.is_veg, mi.image, mi.prep_time FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id=$1 ORDER BY oi.created_at`,
      [order.id]
    );
    const payments = await many(`SELECT * FROM payments WHERE ref_type='order' AND ref_id=$1`, [order.id]);
    res.json({ order, items, payments });
  })
);

r.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const items = b.items || [];
    if (!items.length) throw badRequest('Add at least one item');

    const out = await tx(async (client) => {
      const orderNo = await docNo(client, req.hotelId, 'order', 'ORD', 4);
      const order = await tsql(
        client,
        `INSERT INTO orders (hotel_id, order_no, type, table_id, booking_id, room_number, guest_name,
            status, persons, notes, served_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [req.hotelId, orderNo, b.type || 'dine_in', b.table_id || null, b.booking_id || null,
          b.room_number || null, b.guest_name || null, 'new', Number(b.persons || 1),
          b.notes || null, req.user.id]
      );
      const row = order.rows[0];
      let sub = 0;
      let tax = 0;
      for (const it of items) {
        const mi = it.menu_item_id
          ? await tsql(client, `SELECT * FROM menu_items WHERE id=$1 AND hotel_id=$2`, [it.menu_item_id, req.hotelId])
          : null;
        const price = Number(it.price ?? mi?.rows[0]?.price ?? 0);
        const qty = Number(it.qty || 1);
        const amount = round2(price * qty);
        const lineTax = round2((amount * Number(it.taxes ?? mi?.rows[0]?.taxes ?? 0)) / 100);
        sub += amount;
        tax += lineTax;
        await tsql(
          client,
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, name, qty, price, cost, tax, amount, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [row.id, req.hotelId, it.menu_item_id || null, mi?.rows[0]?.name || it.name || 'Item',
            qty, price, Number(mi?.rows[0]?.cost || 0), lineTax, amount, it.notes || null]
        );
      }
      const total = round2(sub + tax - Number(b.discount || 0));
      const updated = await tsql(
        client,
        `UPDATE orders SET sub_total=$2, tax=$3, discount=$4, total=$5 WHERE id=$1 RETURNING *`,
        [row.id, sub, tax, Number(b.discount || 0), total]
      );
      if (b.type === 'dine_in' && b.table_id) {
        await tsql(client, `UPDATE restaurant_tables SET status='occupied' WHERE id=$1`, [b.table_id]);
      }
      return updated.rows[0];
    });
    res.status(201).json(out);
  })
);

r.post(
  '/orders/:id/items',
  asyncHandler(async (req, res) => {
    const order = await one(`SELECT * FROM orders WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!order) throw notFound('Order not found');
    if (['paid', 'cancelled'].includes(order.status)) throw badRequest('Order is already closed');
    const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
    if (!items.length) throw badRequest('No items supplied');

    await tx(async (client) => {
      for (const it of items) {
        const mi = it.menu_item_id
          ? (await tsql(client, `SELECT * FROM menu_items WHERE id=$1 AND hotel_id=$2`, [it.menu_item_id, req.hotelId])).rows[0]
          : null;
        if (it.menu_item_id && !mi) throw notFound('Menu item not found');
        const price = Number(it.price ?? mi?.price ?? 0);
        const qty = Number(it.qty || 1);
        const amount = round2(price * qty);
        const lineTax = round2((amount * Number(it.taxes ?? mi?.taxes ?? 0)) / 100);
        await tsql(
          client,
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, name, qty, price, cost, tax, amount, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [order.id, req.hotelId, it.menu_item_id || null, mi?.name || it.name || 'Item',
            qty, price, Number(mi?.cost || 0), lineTax, amount, it.notes || null]
        );
      }
      const { sub, tax } = await computeOrderTotals(order.id);
      await tsql(client, `UPDATE orders SET sub_total=$2, tax=$3, total=$4 WHERE id=$1`, [
        order.id, sub, tax, round2(sub + tax - Number(order.discount || 0)),
      ]);
      if (order.status === 'served' || order.status === 'bill_generated') {
        await tsql(client, `UPDATE orders SET status='preparing' WHERE id=$1`, [order.id]);
      }
    });
    const fresh = await one(`SELECT * FROM orders WHERE id=$1`, [order.id]);
    res.status(201).json(fresh);
  })
);

r.put(
  '/orders/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const { qty, notes, status } = req.body || {};
    const item = await one(
      `SELECT oi.* FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE oi.id=$1 AND o.id=$2 AND o.hotel_id=$3`,
      [req.params.itemId, req.params.id, req.hotelId]
    );
    if (!item) throw notFound('Order item not found');
    const sets = [];
    const p = [item.id];
    if (qty !== undefined) {
      if (Number(qty) <= 0) { p.push('cancelled'); sets.push(`status=$${p.length}`); }
      else {
        p.push(Number(qty)); sets.push(`qty=$${p.length}`);
        p.push(round2(Number(qty) * Number(item.price))); sets.push(`amount=$${p.length}`);
      }
    }
    if (notes !== undefined) { p.push(notes); sets.push(`notes=$${p.length}`); }
    if (status !== undefined) { p.push(status); sets.push(`status=$${p.length}`); }
    if (!sets.length) throw badRequest('Nothing to update');
    const row = await one(`UPDATE order_items SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, p);
    const { sub, tax } = await computeOrderTotals(item.order_id);
    const ord = await one(`SELECT discount FROM orders WHERE id=$1`, [item.order_id]);
    await sql(`UPDATE orders SET sub_total=$2, tax=$3, total=$4 WHERE id=$1`, [
      item.order_id, sub, tax, round2(sub + tax - Number(ord.discount || 0)),
    ]);
    res.json(row);
  })
);

const ORDER_FLOW = ['new', 'confirmed', 'preparing', 'ready', 'served', 'bill_generated', 'paid'];
r.post(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const { status, kot } = req.body || {};
    if (!ORDER_FLOW.includes(status) && status !== 'cancelled') throw badRequest('Invalid status');
    const order = await one(`SELECT * FROM orders WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!order) throw notFound('Order not found');
    const row = await one(`UPDATE orders SET status=$3 WHERE id=$1 AND hotel_id=$2 RETURNING *`,
      [order.id, req.hotelId, status]);
    if (kot) await sql(`UPDATE orders SET kot_printed=true WHERE id=$1`, [order.id]);
    if (status === 'cancelled' && order.table_id) {
      await sql(`UPDATE restaurant_tables SET status='free' WHERE id=$1`, [order.table_id]);
    }
    res.json(row);
  })
);

// pay an order: cash/card at counter OR charge to a room folio
r.post(
  '/orders/:id/pay',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const order = await one(`SELECT * FROM orders WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!order) throw notFound('Order not found');
    if (['paid', 'cancelled'].includes(order.status)) throw badRequest('Order is already closed');
    const amount = Number(b.amount ?? order.total);
    if (amount <= 0) throw badRequest('Amount must be greater than 0');
    const toFolio = b.charge_to_room && (b.booking_id || order.booking_id);

    const out = await tx(async (client) => {
      let payment = null;
      if (toFolio) {
        const booking = (await tsql(client,
          `SELECT * FROM bookings WHERE id=$1 AND hotel_id=$2`, [b.booking_id || order.booking_id, req.hotelId])).rows[0];
        if (!booking) throw badRequest('Booking not found for room charge');
        if (booking.status !== 'checked_in') throw badRequest('Guest is not checked in — collect payment at counter');
        let folio = (await tsql(client,
          `SELECT * FROM invoices WHERE booking_id=$1 AND type='stay' ORDER BY created_at LIMIT 1`, [booking.id])).rows[0];
        if (!folio) {
          const invNo = await docNo(client, req.hotelId, 'invoice', 'INV', 5);
          folio = (await tsql(client,
            `INSERT INTO invoices (hotel_id, booking_id, invoice_no, type, party_name, party_email, party_phone, status)
             VALUES ($1,$2,$3,'stay',$4,$5,$6,'unpaid') RETURNING *`,
            [req.hotelId, booking.id, invNo, booking.guest_name, booking.guest_email, booking.guest_phone])).rows[0];
        }
        await tsql(client,
          `INSERT INTO invoice_items (invoice_id, hotel_id, description, category, qty, rate, amount, tax)
           VALUES ($1,$2,$3,'restaurant',1,$4,$5,$6)`,
          [folio.id, req.hotelId, `Restaurant order ${order.order_no}`, amount, amount, Number(order.tax || 0)]);
        const agg = await tsql(client,
          `SELECT coalesce(sum(amount),0) AS sub, coalesce(sum(tax),0) AS tax FROM invoice_items WHERE invoice_id=$1`,
          [folio.id]);
        const sub = Number(agg.rows[0].sub);
        const tax = Number(agg.rows[0].tax);
        const paidRow = await tsql(client, `SELECT coalesce(sum(amount),0) AS p FROM payments WHERE invoice_id=$1`, [folio.id]);
        const paid = Number(paidRow.rows[0].p);
        const total = sub + tax;
        await tsql(client,
          `UPDATE invoices SET sub_total=$2, tax=$3, total=$4, paid=$5, status=$6 WHERE id=$1`,
          [folio.id, sub, tax, total, paid, paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid']);
        await tsql(client, `UPDATE bookings SET total_amount=$3, paid_amount=$4 WHERE id=$1 AND hotel_id=$2`,
          [booking.id, req.hotelId, total, paid]);
        await tsql(client,
          `INSERT INTO payments (hotel_id, invoice_id, booking_id, amount, method, ref_type, ref_id, category, notes, received_by)
           VALUES ($1,$2,$3,$4,$5,'order',$6,'guest','Room charge',$7)`,
          [req.hotelId, folio.id, booking.id, amount, b.method || 'room_charge', order.id, req.user.id]);
        payment = { charged_to_room: true, invoice_id: folio.id };
      } else {
        const pay = await tsql(
          client,
          `INSERT INTO payments (hotel_id, amount, method, reference, ref_type, ref_id, category, notes, received_by)
           VALUES ($1,$2,$3,$4,'order',$5,'restaurant',$6,$7) RETURNING *`,
          [req.hotelId, amount, b.method || 'cash', b.reference || null, order.id,
            b.notes || null, req.user.id]
        );
        payment = pay.rows[0];
        await tsql(client, `UPDATE orders SET paid = paid + $2 WHERE id=$1`, [order.id, amount]);
        await postJournal(client, {
          hotelId: req.hotelId,
          date: todayStr(),
          refType: 'order',
          refId: order.id,
          memo: `Restaurant sale ${order.order_no}`,
          createdBy: req.user.id,
          lines: [
            { code: '1000', debit: amount, credit: 0 },
            { code: '4010', debit: 0, credit: round2(amount - Number(order.tax || 0)) },
            { code: '2010', debit: 0, credit: Number(order.tax || 0) },
          ],
        });
      }

      await tsql(client, `UPDATE orders SET status='paid', payment_method=$3 WHERE id=$1 AND hotel_id=$2`,
        [order.id, req.hotelId, b.method || (toFolio ? 'room_charge' : 'cash')]);
      if (order.table_id) {
        await tsql(client, `UPDATE restaurant_tables SET status='free' WHERE id=$1`, [order.table_id]);
      }
      return { order: (await tsql(client, `SELECT * FROM orders WHERE id=$1`, [order.id])).rows[0], payment };
    });
    res.json(out);
  })
);

r.post(
  '/orders/:id/cancel',
  asyncHandler(async (req, res) => {
    const order = await one(`SELECT * FROM orders WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!order) throw notFound('Order not found');
    if (order.status === 'paid') throw badRequest('A paid order cannot be cancelled — void the payment instead');
    const row = await one(`UPDATE orders SET status='cancelled' WHERE id=$1 RETURNING *`, [order.id]);
    if (order.table_id) await sql(`UPDATE restaurant_tables SET status='free' WHERE id=$1`, [order.table_id]);
    res.json(row);
  })
);

// ---------------- SALES (POS) ----------------
r.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePaging(req, { defaultLimit: 25 });
    const p = [req.hotelId];
    const where = ['s.hotel_id = $1'];
    if (req.query.outlet) { p.push(req.query.outlet); where.push(`s.outlet = $${p.length}`); }
    if (req.query.status) { p.push(req.query.status); where.push(`s.status = $${p.length}`); }
    if (req.query.today) {
      p.push(todayStr());
      where.push(`s.sold_at >= $${p.length}::date AND s.sold_at < $${p.length}::date + interval '1 day'`);
    }
    const q = String(req.query.q || '').trim();
    if (q) { p.push(`%${q}%`); where.push(`(s.invoice_no ILIKE $${p.length} OR s.customer_name ILIKE $${p.length})`); }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = (await sql(`SELECT count(*)::int AS c FROM sales s ${whereSql}`, p)).rows[0].c;
    const rows = await many(
      `SELECT s.*, u.name AS sold_by_name,
              (SELECT count(*)::int FROM sale_items si WHERE si.sale_id=s.id) AS item_count
         FROM sales s LEFT JOIN users u ON u.id = s.sold_by
         ${whereSql} ORDER BY s.sold_at DESC LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, limit, offset]
    );
    res.json(listResponse(rows, total, { page, limit }));
  })
);

r.get(
  '/sales/:id',
  asyncHandler(async (req, res) => {
    const sale = await one(`SELECT * FROM sales WHERE id=$1 AND hotel_id=$2`, [req.params.id, req.hotelId]);
    if (!sale) throw notFound('Sale not found');
    const items = await many(
      `SELECT si.*, ii.sku, ii.unit FROM sale_items si LEFT JOIN inventory_items ii ON ii.id=si.item_id
        WHERE si.sale_id=$1`, [sale.id]
    );
    const payments = await many(`SELECT * FROM payments WHERE ref_type='sale' AND ref_id=$1`, [sale.id]);
    res.json({ sale, items, payments });
  })
);

r.post(
  '/sales',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const items = b.items || [];
    if (!items.length) throw badRequest('Add at least one item');

    const out = await tx(async (client) => {
      const invNo = await docNo(client, req.hotelId, 'sale', 'SAL', 4);
      let sub = 0;
      let tax = 0;
      const rows = [];
      for (const it of items) {
        const qty = Number(it.qty || 1);
        const rate = Number(it.rate || it.price || 0);
        const amount = round2(qty * rate);
        sub += amount;
        tax += round2((amount * Number(it.tax || 0)) / 100);
        rows.push({ ...it, qty, rate, amount });
      }
      const discount = Number(b.discount || 0);
      const total = round2(sub + tax - discount);
      const sale = (await tsql(
        client,
        `INSERT INTO sales (hotel_id, invoice_no, outlet, customer_name, customer_phone, sub_total,
            discount, tax, total, paid, payment_method, status, notes, sold_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13) RETURNING *`,
        [req.hotelId, invNo, b.outlet || 'reception', b.customer_name || null, b.customer_phone || null,
          sub, discount, tax, total, b.payment_method || 'cash',
          b.payment_method === 'credit' ? 'unpaid' : 'paid', b.notes || null, req.user.id]
      )).rows[0];

      for (const it of rows) {
        await tsql(
          client,
          `INSERT INTO sale_items (sale_id, hotel_id, item_id, name, qty, rate, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [sale.id, req.hotelId, it.item_id || null, it.name || 'Item', it.qty, it.rate, it.amount]
        );
        if (it.item_id) {
          const item = (await tsql(client, `SELECT * FROM inventory_items WHERE id=$1`, [it.item_id])).rows[0];
          if (!item) throw notFound('Inventory item not found');
          if (Number(item.stock_qty) < it.qty) {
            throw badRequest(`Insufficient stock for ${item.name} (available ${item.stock_qty})`);
          }
          await tsql(client, `UPDATE inventory_items SET stock_qty = stock_qty - $2 WHERE id=$1`, [item.id, it.qty]);
          await tsql(
            client,
            `INSERT INTO stock_movements (hotel_id, item_id, type, qty, ref_type, ref_id, note, unit_cost, created_by)
             VALUES ($1,$2,'out',$3,'sale',$4,$5,$6,$7)`,
            [req.hotelId, item.id, it.qty, sale.id, `Sale ${invNo}`, item.cost_price, req.user.id]
          );
        }
      }

      if (sale.status === 'paid') {
        await tsql(client,
          `INSERT INTO payments (hotel_id, amount, method, ref_type, ref_id, category, received_by)
           VALUES ($1,$2,$3,'sale',$4,'pos',$5)`,
          [req.hotelId, total, b.payment_method || 'cash', sale.id, req.user.id]);
        await postJournal(client, {
          hotelId: req.hotelId,
          date: todayStr(),
          refType: 'sale',
          refId: sale.id,
          memo: `POS sale ${invNo}`,
          createdBy: req.user.id,
          lines: [
            { code: '1000', debit: total, credit: 0 },
            { code: '4020', debit: 0, credit: round2(sub - discount) },
            { code: '2010', debit: 0, credit: tax },
            { code: '5002', debit: round2(items.reduce((s, x) => s + Number(x.cost || 0) * Number(x.qty || 1), 0)), credit: 0 },
            { code: '1030', debit: 0, credit: round2(items.reduce((s, x) => s + Number(x.cost || 0) * Number(x.qty || 1), 0)) },
          ],
        });
      }
      return sale;
    });
    res.status(201).json(out);
  })
);

export default r;
