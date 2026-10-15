import { Router } from 'express';
import { one, many, sql } from '../db/pool.js';
import { asyncHandler, badRequest, monthRange, todayStr, addDays } from '../utils/api.js';

const r = Router();

// ---------- KPI overview ----------
r.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const from = req.query.from || monthRange(0).start;
    const to = req.query.to || todayStr();
    const kpi = await one(
      `SELECT
        (SELECT coalesce(sum(total_amount),0) FROM bookings WHERE hotel_id=$1
           AND status <> 'cancelled' AND check_in BETWEEN $2::date AND $3::date) AS booking_revenue,
        (SELECT coalesce(sum(paid_amount),0) FROM bookings WHERE hotel_id=$1
           AND status <> 'cancelled' AND check_in BETWEEN $2::date AND $3::date) AS collected,
        (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status <> 'cancelled'
           AND check_in BETWEEN $2::date AND $3::date) AS bookings,
        (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status='checked_in') AS in_house,
        (SELECT coalesce(sum(total),0) FROM orders WHERE hotel_id=$1 AND status <> 'cancelled'
           AND created_at::date BETWEEN $2::date AND $3::date) AS fnb_revenue,
        (SELECT coalesce(sum(total),0) FROM sales WHERE hotel_id=$1 AND status <> 'void'
           AND sold_at::date BETWEEN $2::date AND $3::date) AS pos_revenue,
        (SELECT coalesce(sum(total),0) FROM expenses WHERE hotel_id=$1
           AND expense_date BETWEEN $2::date AND $3::date) AS expenses,
        (SELECT count(*)::int FROM reviews WHERE hotel_id=$1 AND created_at::date BETWEEN $2::date AND $3::date) AS reviews,
        (SELECT round(avg(rating),2) FROM reviews WHERE hotel_id=$1) AS avg_rating`,
      [req.hotelId, from, to]
    );

    const rooms = await one(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status='occupied')::int AS occupied,
              count(*) FILTER (WHERE status='cleaning')::int AS cleaning,
              count(*) FILTER (WHERE status IN ('maintenance','out_of_order','blocked'))::int AS ooo,
              count(*) FILTER (WHERE status='available')::int AS available
         FROM rooms WHERE hotel_id=$1 AND is_active`,
      [req.hotelId]
    );

    const occupancyPct = rooms.total ? Math.round((rooms.occupied / rooms.total) * 100) : 0;
    const adr = kpi.bookings
      ? Math.round(Number(kpi.booking_revenue) / Math.max(1, kpi.bookings) * 100) / 100
      : 0;

    res.json({
      from, to,
      kpi: {
        ...kpi,
        total_revenue: Number(kpi.booking_revenue) + Number(kpi.fnb_revenue) + Number(kpi.pos_revenue),
        rooms, occupancy: occupancyPct, adr,
      },
    });
  })
);

// ---------- revenue by month ----------
r.get(
  '/revenue-monthly',
  asyncHandler(async (req, res) => {
    const months = Math.min(24, Number(req.query.months || 12));
    const start = monthRange(-(months - 1)).start;
    const rows = await many(
      `WITH months AS (
         SELECT generate_series($2::date, $3::date, interval '1 month')::date AS m
       )
       SELECT to_char(m, 'YYYY-MM') AS month,
              to_char(m, 'Mon YYYY') AS label,
              coalesce((SELECT sum(total_amount) FROM bookings b
                 WHERE b.hotel_id=$1 AND b.status <> 'cancelled'
                   AND date_trunc('month', b.check_in)::date = date_trunc('month', m)::date), 0) AS rooms,
              coalesce((SELECT sum(total) FROM orders o
                 WHERE o.hotel_id=$1 AND o.status <> 'cancelled'
                   AND date_trunc('month', o.created_at)::date = date_trunc('month', m)::date), 0) AS fnb,
              coalesce((SELECT sum(total) FROM sales s
                 WHERE s.hotel_id=$1 AND s.status <> 'void'
                   AND date_trunc('month', s.sold_at)::date = date_trunc('month', m)::date), 0) AS pos,
              coalesce((SELECT sum(total) FROM expenses e
                 WHERE e.hotel_id=$1 AND date_trunc('month', e.expense_date)::date = date_trunc('month', m)::date), 0) AS expense
         FROM months ORDER BY m`,
      [req.hotelId, start, todayStr()]
    );
    res.json({
      items: rows.map((x) => ({
        ...x,
        revenue: Number(x.rooms) + Number(x.fnb) + Number(x.pos),
        rooms: Number(x.rooms), fnb: Number(x.fnb), pos: Number(x.pos), expense: Number(x.expense),
      })),
    });
  })
);

// ---------- occupancy by day ----------
r.get(
  '/occupancy',
  asyncHandler(async (req, res) => {
    const from = req.query.from || todayStr();
    const to = req.query.to || addDays(todayStr(), 13);
    const totalRooms = (await one(
      `SELECT count(*)::int AS c FROM rooms WHERE hotel_id=$1 AND is_active`, [req.hotelId]
    )).c;
    const bookings = await many(
      `SELECT check_in, check_out, status FROM bookings
        WHERE hotel_id=$1 AND status IN ('confirmed','checked_in') AND check_in <= $3 AND check_out > $2`,
      [req.hotelId, from, addDays(to, -1)]
    );
    const items = [];
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      const occ = bookings.filter((b) => ds >= b.check_in && ds < b.check_out).length;
      items.push({
        date: ds,
        occupied: occ,
        total: totalRooms,
        available: Math.max(0, totalRooms - occ),
        occupancy: totalRooms ? Math.round((occ / totalRooms) * 100) : 0,
      });
    }
    res.json({ items, total_rooms: totalRooms });
  })
);

// ---------- booking sources ----------
r.get(
  '/booking-sources',
  asyncHandler(async (req, res) => {
    const from = req.query.from || monthRange(-5).start;
    const to = req.query.to || todayStr();
    const rows = await many(
      `SELECT source, count(*)::int AS count, coalesce(sum(total_amount),0) AS revenue
         FROM bookings WHERE hotel_id=$1 AND status <> 'cancelled'
          AND created_at::date BETWEEN $2::date AND $3::date
        GROUP BY source ORDER BY count DESC`,
      [req.hotelId, from, to]
    );
    res.json({ items: rows });
  })
);

// ---------- room type performance ----------
r.get(
  '/room-performance',
  asyncHandler(async (req, res) => {
    const from = req.query.from || monthRange(-5).start;
    const to = req.query.to || todayStr();
    const rows = await many(
      `SELECT rt.id, rt.name, rt.base_price,
              count(b.id)::int AS bookings,
              coalesce(sum(b.total_amount),0) AS revenue,
              coalesce(sum(b.nights),0) AS room_nights,
              coalesce(avg(b.total_amount),0) AS avg_booking
         FROM room_types rt
         LEFT JOIN bookings b ON b.room_type_id = rt.id AND b.status <> 'cancelled'
              AND b.check_in BETWEEN $2::date AND $3::date
        WHERE rt.hotel_id=$1
        GROUP BY rt.id ORDER BY revenue DESC`,
      [req.hotelId, from, to]
    );
    res.json({ items: rows });
  })
);

// ---------- expense breakdown ----------
r.get(
  '/expense-breakdown',
  asyncHandler(async (req, res) => {
    const from = req.query.from || monthRange(0).start;
    const to = req.query.to || todayStr();
    const rows = await many(
      `SELECT coalesce(a.name, e.category) AS label, coalesce(sum(e.total),0) AS amount, count(*)::int AS count
         FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id
        WHERE e.hotel_id=$1 AND e.expense_date BETWEEN $2::date AND $3::date
        GROUP BY 1 ORDER BY amount DESC`,
      [req.hotelId, from, to]
    );
    res.json({ items: rows });
  })
);

// ---------- housekeeping / operations ----------
r.get(
  '/operations',
  asyncHandler(async (req, res) => {
    const month = monthRange(0);
    const data = await one(
      `SELECT
        (SELECT count(*)::int FROM housekeeping_tasks WHERE hotel_id=$1 AND completed_at::date BETWEEN $2::date AND $3::date) AS hk_done,
        (SELECT count(*)::int FROM housekeeping_tasks WHERE hotel_id=$1 AND status IN ('pending','in_progress')) AS hk_pending,
        (SELECT count(*)::int FROM maintenance_tasks WHERE hotel_id=$1 AND status IN ('open','in_progress')) AS maint_open,
        (SELECT coalesce(sum(cost),0) FROM maintenance_tasks WHERE hotel_id=$1 AND resolved_at::date BETWEEN $2::date AND $3::date) AS maint_cost,
        (SELECT count(*)::int FROM found_lost_items WHERE hotel_id=$1 AND status='found') AS found_open,
        (SELECT count(*)::int FROM found_lost_items WHERE hotel_id=$1 AND status='returned') AS found_returned,
        (SELECT count(*)::int FROM attendance WHERE hotel_id=$1 AND work_date BETWEEN $2::date AND $3::date AND status='present') AS present,
        (SELECT count(*)::int FROM attendance WHERE hotel_id=$1 AND work_date BETWEEN $2::date AND $3::date AND status='absent') AS absent,
        (SELECT count(*)::int FROM staff_profiles WHERE hotel_id=$1 AND status='active') AS staff_active,
        (SELECT count(*)::int FROM event_bookings WHERE hotel_id=$1 AND status='confirmed' AND start_at >= now()) AS upcoming_events,
        (SELECT coalesce(sum(stock_qty * cost_price),0) FROM inventory_items WHERE hotel_id=$1) AS stock_value,
        (SELECT count(*)::int FROM inventory_items WHERE hotel_id=$1 AND stock_qty <= reorder_level) AS low_stock`,
      [req.hotelId, month.start, month.end]
    );
    res.json(data);
  })
);

// ---------- CSV export ----------
const EXPORTS = {
  bookings: {
    sql: `SELECT b.code AS "Booking Code", b.guest_name AS Guest, b.guest_phone AS Phone,
            b.guest_email AS Email, b.check_in AS "Check In", b.check_out AS "Check Out",
            b.nights AS Nights, b.adults AS Adults, b.status AS Status, b.source AS Source,
            b.room_number AS Room, b.total_amount AS Total, b.paid_amount AS Paid
          FROM bookings b WHERE b.hotel_id = $1`,
    params: [],
  },
  guests: {
    sql: `SELECT first_name||' '||coalesce(last_name,'') AS Guest, email AS Email, phone AS Phone,
            city AS City, country AS Country, vip_tier AS "VIP Tier", total_stays AS Stays,
            total_spent AS "Total Spent" FROM guests WHERE hotel_id = $1`,
    params: [],
  },
  invoices: {
    sql: `SELECT invoice_no AS "Invoice No", party_name AS Party, issue_date AS "Issue Date",
            sub_total AS "Sub Total", tax AS Tax, total AS Total, paid AS Paid, status AS Status
          FROM invoices WHERE hotel_id = $1`,
    params: [],
  },
  expenses: {
    sql: `SELECT expense_no AS "Expense No", title AS Title, category AS Category, vendor AS Vendor,
            expense_date AS Date, total AS Total, status AS Status FROM expenses WHERE hotel_id = $1`,
    params: [],
  },
  inventory: {
    sql: `SELECT sku AS SKU, name AS Item, unit AS Unit, stock_qty AS "Stock", reorder_level AS "Reorder Level",
            cost_price AS "Cost", sell_price AS "Price", (stock_qty*cost_price) AS "Stock Value"
          FROM inventory_items WHERE hotel_id = $1`,
    params: [],
  },
  staff: {
    sql: `SELECT sp.employee_code AS Code, u.name AS Name, sp.department AS Department,
            sp.designation AS Designation, sp.join_date AS "Joined", sp.salary AS Salary, sp.status AS Status
          FROM staff_profiles sp LEFT JOIN users u ON u.id=sp.user_id WHERE sp.hotel_id = $1`,
    params: [],
  },
  sales: {
    sql: `SELECT invoice_no AS "Invoice No", outlet AS Outlet, customer_name AS Customer,
            sold_at::date AS Date, total AS Total, payment_method AS Method, status AS Status
          FROM sales WHERE hotel_id = $1`,
    params: [],
  },
  orders: {
    sql: `SELECT order_no AS "Order No", type AS Type, guest_name AS Guest, room_number AS Room,
            created_at::date AS Date, total AS Total, status AS Status FROM orders WHERE hotel_id = $1`,
    params: [],
  },
};

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const raw = String(v);
    const s = typeof v === 'string' && /^[\s]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((row) => headers.map((h) => esc(row[h])).join(',')),
  ].join('\n');
}

r.get(
  '/export/:entity',
  asyncHandler(async (req, res) => {
    const cfg = EXPORTS[req.params.entity];
    if (!cfg) throw badRequest(`Unknown export "${req.params.entity}". Options: ${Object.keys(EXPORTS).join(', ')}`);
    const rows = (await sql(cfg.sql, [req.hotelId, ...cfg.params])).rows;
    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}-${todayStr()}.csv"`);
    res.send(csv);
  })
);

export default r;
