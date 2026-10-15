import { Router } from 'express';
import { one, many } from '../db/pool.js';
import { asyncHandler, todayStr, addDays, monthRange } from '../utils/api.js';

const r = Router();

r.get(
  '/',
  asyncHandler(async (req, res) => {
    const today = req.query.date || todayStr();
    const weekStart = addDays(today, -6);

    const [kpi, arrivals, departures, inHouse, revenue, alerts, activity, tasks, topRooms] =
      await Promise.all([
        one(
          `SELECT
            (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND is_active) AS total_rooms,
            (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='occupied') AS occupied,
            (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='available') AS available,
            (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='cleaning') AS cleaning,
            (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status IN ('maintenance','out_of_order','blocked')) AS out_of_order,
            (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND check_in=$2::date AND status IN ('pending','confirmed')) AS arrivals_today,
            (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND check_out=$2::date AND status='checked_in') AS departures_today,
            (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status='checked_in') AS in_house,
            (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status='confirmed' AND check_in > $2::date) AS upcoming,
            (SELECT coalesce(sum(total_amount - paid_amount),0) FROM bookings WHERE hotel_id=$1 AND status IN ('checked_in','checked_out')) AS dues,
            (SELECT coalesce(sum(total),0) FROM orders WHERE hotel_id=$1 AND created_at::date=$2::date AND status<>'cancelled') AS fnb_today,
            (SELECT coalesce(sum(total),0) FROM sales WHERE hotel_id=$1 AND sold_at::date=$2::date AND status<>'void') AS pos_today,
            (SELECT coalesce(sum(total_amount),0) FROM bookings WHERE hotel_id=$1 AND check_in=$2::date AND status<>'cancelled') AS room_revenue_today,
            (SELECT round(avg(rating),2) FROM reviews WHERE hotel_id=$1) AS avg_rating,
            (SELECT count(*)::int FROM reviews WHERE hotel_id=$1) AS review_count,
            (SELECT count(*)::int FROM staff_profiles WHERE hotel_id=$1 AND status='active') AS staff_count`,
          [req.hotelId, today]
        ),
        many(
          `SELECT b.id, b.code, b.guest_name, b.guest_phone, b.adults, b.children, b.total_amount,
                  b.paid_amount, b.special_requests, rt.name AS room_type_name, b.room_number, b.room_id, b.room_type_id
             FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
            WHERE b.hotel_id=$1 AND b.check_in=$2::date AND b.status IN ('pending','confirmed')
            ORDER BY b.created_at LIMIT 6`,
          [req.hotelId, today]
        ),
        many(
          `SELECT b.id, b.code, b.guest_name, b.guest_phone, b.room_number, b.room_id,
                  (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due,
                  rt.name AS room_type_name
             FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
            WHERE b.hotel_id=$1 AND b.check_out=$2::date AND b.status IN ('checked_in','confirmed')
            ORDER BY b.room_number LIMIT 6`,
          [req.hotelId, today]
        ),
        many(
          `SELECT b.id, b.code, b.guest_name, b.room_number, b.check_in, b.check_out,
                  (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due,
                  rt.name AS room_type_name, b.total_amount, b.paid_amount
             FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
            WHERE b.hotel_id=$1 AND b.status='checked_in' ORDER BY b.room_number LIMIT 12`,
          [req.hotelId]
        ),
        many(
          `WITH days AS (SELECT generate_series($2::date, $3::date, interval '1 day')::date AS d)
           SELECT to_char(d, 'Dy') AS day, d AS date,
             coalesce((SELECT sum(total_amount) FROM bookings b WHERE b.hotel_id=$1
                AND b.status<>'cancelled' AND b.check_in=d),0) AS rooms,
             coalesce((SELECT sum(total) FROM orders o WHERE o.hotel_id=$1
                AND o.status<>'cancelled' AND o.created_at::date=d),0) AS fnb,
             coalesce((SELECT sum(total) FROM sales s WHERE s.hotel_id=$1
                AND s.status<>'void' AND s.sold_at::date=d),0) AS pos
           FROM days ORDER BY d`,
          [req.hotelId, weekStart, today]
        ),
        (async () => {
          const [lowStock, pendingHk, maint, dues, openOrders, reviews] = await Promise.all([
            many(`SELECT name, stock_qty, reorder_level, unit FROM inventory_items
                   WHERE hotel_id=$1 AND is_active AND stock_qty <= reorder_level ORDER BY stock_qty LIMIT 5`, [req.hotelId]),
            many(`SELECT count(*)::int AS c FROM housekeeping_tasks WHERE hotel_id=$1 AND status IN ('pending','in_progress')`, [req.hotelId]),
            many(`SELECT count(*)::int AS c FROM maintenance_tasks WHERE hotel_id=$1 AND status IN ('open','in_progress')`, [req.hotelId]),
            many(`SELECT b.code, b.guest_name, b.room_number,
                    (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due
                   FROM bookings b WHERE b.hotel_id=$1 AND b.status='checked_in'
                    AND (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) > 0
                   ORDER BY due DESC LIMIT 5`, [req.hotelId]),
            many(`SELECT count(*)::int AS c FROM orders WHERE hotel_id=$1 AND status IN ('new','confirmed','preparing','ready','served','bill_generated')`, [req.hotelId]),
            many(`SELECT id, guest_name, rating, comment, created_at FROM reviews
                   WHERE hotel_id=$1 AND is_published ORDER BY created_at DESC LIMIT 3`, [req.hotelId]),
          ]);
          const list = [];
          if (lowStock.length) list.push({ type: 'stock', level: 'warning', title: `${lowStock.length} item(s) low on stock`, detail: lowStock.map((x) => x.name).join(', '), link: '/dashboard/inventory' });
          if (pendingHk[0]?.c) list.push({ type: 'housekeeping', level: 'info', title: `${pendingHk[0].c} housekeeping task(s) pending`, link: '/dashboard/housekeeping' });
          if (maint[0]?.c) list.push({ type: 'maintenance', level: 'warning', title: `${maint[0].c} open maintenance ticket(s)`, link: '/dashboard/maintenance' });
          if (dues.length) list.push({ type: 'payments', level: 'error', title: `₹${Math.round(dues.reduce((s, d) => s + Number(d.due), 0))} pending across ${dues.length} folio(s)`, detail: dues.map((d) => `${d.code} · ${d.guest_name}`).join(', '), link: '/dashboard/bookings' });
          if (openOrders[0]?.c) list.push({ type: 'restaurant', level: 'info', title: `${openOrders[0].c} live restaurant order(s)`, link: '/dashboard/restaurant' });
          return { alerts: list, reviews };
        })(),
        many(
          `SELECT id, title, message, type, created_at FROM notifications
            WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT 8`,
          [req.hotelId]
        ),
        many(
          `SELECT hk.*, rm.number AS room_number FROM housekeeping_tasks hk
             LEFT JOIN rooms rm ON rm.id=hk.room_id
            WHERE hk.hotel_id=$1 AND hk.status IN ('pending','in_progress')
            ORDER BY hk.priority DESC, hk.created_at LIMIT 6`,
          [req.hotelId]
        ),
        many(
          `SELECT rt.name, count(b.id)::int AS bookings, coalesce(sum(b.total_amount),0) AS revenue
             FROM room_types rt LEFT JOIN bookings b ON b.room_type_id=rt.id AND b.status<>'cancelled'
              AND b.check_in BETWEEN $2::date AND $3::date
            WHERE rt.hotel_id=$1 GROUP BY rt.id ORDER BY revenue DESC LIMIT 5`,
          [req.hotelId, monthRange(-2).start, today]
        ),
      ]);

    const occupancy = kpi.total_rooms ? Math.round((kpi.occupied / kpi.total_rooms) * 100) : 0;
    const revenueChart = revenue.map((x) => ({
      ...x,
      total: Number(x.rooms) + Number(x.fnb) + Number(x.pos),
      rooms: Number(x.rooms), fnb: Number(x.fnb), pos: Number(x.pos),
    }));

    res.json({
      date: today,
      kpi: { ...kpi, occupancy, room_revenue_today: Number(kpi.room_revenue_today), dues: Number(kpi.dues) },
      arrivals, departures, in_house: inHouse,
      revenue: revenueChart,
      alerts: alerts.alerts,
      recent_reviews: alerts.reviews,
      activity,
      tasks,
      top_rooms: topRooms,
    });
  })
);

export default r;
