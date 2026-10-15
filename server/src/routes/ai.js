import { Router } from 'express';
import { one, many, sql } from '../db/pool.js';
import { asyncHandler, badRequest, notFound, todayStr, addDays, monthRange } from '../utils/api.js';

const r = Router();

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const dt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const tm = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');

async function hotelContext(hotelId) {
  const hotel = await one(
    `SELECT name, currency_symbol, tax_rate, check_in_time, check_out_time FROM hotels WHERE id=$1`,
    [hotelId]
  );
  const today = todayStr();
  const kpi = await one(
    `SELECT
      (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND is_active) AS total_rooms,
      (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='occupied') AS occupied,
      (SELECT count(*)::int FROM rooms WHERE hotel_id=$1 AND status='available') AS available,
      (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND check_in=$2::date AND status IN ('pending','confirmed')) AS arrivals,
      (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND check_out=$2::date AND status='checked_in') AS departures,
      (SELECT count(*)::int FROM bookings WHERE hotel_id=$1 AND status='checked_in') AS in_house,
      (SELECT coalesce(sum(total_amount),0) FROM bookings WHERE hotel_id=$1 AND check_in=$2::date AND status<>'cancelled') AS room_revenue,
      (SELECT coalesce(sum(total),0) FROM orders WHERE hotel_id=$1 AND created_at::date=$2::date AND status<>'cancelled') AS fnb,
      (SELECT coalesce(sum(total),0) FROM sales WHERE hotel_id=$1 AND sold_at::date=$2::date AND status<>'void') AS pos,
      (SELECT coalesce(sum(total),0) FROM expenses WHERE hotel_id=$1 AND expense_date=$2::date) AS expenses,
      (SELECT round(avg(rating),1) FROM reviews WHERE hotel_id=$1) AS rating`,
    [hotelId, today]
  );
  return { hotel, today, kpi };
}

async function runIntent(hotelId, message) {
  const msg = message.toLowerCase().trim();
  const { hotel, today, kpi } = await hotelContext(hotelId);
  const occupancy = kpi.total_rooms ? Math.round((kpi.occupied / kpi.total_rooms) * 100) : 0;

  const has = (...words) => words.some((w) => msg.includes(w));

  // ---- daily briefing ----
  if (has('brief', 'summary of today', 'daily report', 'how are we doing', "today's summary", 'overview')) {
    const arrivals = await many(
      `SELECT code, guest_name, room_type_name, check_in, total_amount FROM (
         SELECT b.code, b.guest_name, rt.name AS room_type_name, b.check_in, b.total_amount
           FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
          WHERE b.hotel_id=$1 AND b.check_in=$2::date AND b.status IN ('pending','confirmed')) x LIMIT 8`,
      [hotelId, today]
    );
    const departures = await many(
      `SELECT code, guest_name, room_number FROM bookings
        WHERE hotel_id=$1 AND check_out=$2::date AND status='checked_in' LIMIT 8`,
      [hotelId, today]
    );
    const lowStock = await many(
      `SELECT name, stock_qty, unit FROM inventory_items
        WHERE hotel_id=$1 AND is_active AND stock_qty <= reorder_level LIMIT 5`,
      [hotelId]
    );
    const lines = [
      `Good day! Here is the briefing for ${hotel.name} · ${dt(today)}.`,
      ``,
      `🛏 Occupancy: ${occupancy}% (${kpi.occupied}/${kpi.total_rooms} rooms occupied, ${kpi.available} free)`,
      `📥 Arrivals today: ${kpi.arrivals}${arrivals.length ? ` — ${arrivals.map((a) => `${a.guest_name} (${a.code})`).join(', ')}` : ''}`,
      `📤 Departures today: ${kpi.departures}${departures.length ? ` — ${departures.map((a) => `${a.guest_name}${a.room_number ? ` rm ${a.room_number}` : ''}`).join(', ')}` : ''}`,
      `💰 Revenue today: Rooms ${money(kpi.room_revenue)} · F&B ${money(kpi.fnb)} · POS ${money(kpi.pos)}`,
      `💸 Expenses today: ${money(kpi.expenses)}`,
      `⭐ Guest rating: ${kpi.rating || '—'}`,
    ];
    if (lowStock.length) lines.push(`⚠️ Low stock: ${lowStock.map((l) => `${l.name} (${l.stock_qty}${l.unit})`).join(', ')}`);
    return { reply: lines.join('\n'), intent: 'briefing', data: { kpi, arrivals, departures, lowStock } };
  }

  // ---- availability ----
  if (has('available', 'availability', 'free room', 'vacancy', 'rooms free')) {
    const fromMatch = msg.match(/(\d{4}-\d{2}-\d{2})/);
    const from = fromMatch?.[1] || today;
    const to = addDays(from, 1);
    const rows = await many(
      `SELECT rt.name, rt.base_price, rt.total_rooms,
              (SELECT count(*)::int FROM rooms rm WHERE rm.room_type_id=rt.id AND rm.is_active) AS room_rows,
              (SELECT count(*)::int FROM bookings b WHERE b.room_type_id=rt.id AND b.status IN ('pending','confirmed','checked_in')
                 AND b.check_in <= $3::date AND b.check_out > $2::date) AS booked
         FROM room_types rt WHERE rt.hotel_id=$1 AND rt.is_active ORDER BY rt.base_price`,
      [hotelId, from, addDays(to, -1)]
    );
    if (!rows.length) {
      return { reply: 'No room types are configured yet. Add room types in Rooms → Room Types first.', intent: 'availability' };
    }
    const lines = [`Availability for ${dt(from)} (1 night):`, ''];
    for (const row of rows) {
      const total = row.room_rows > 0 ? row.room_rows : Number(row.total_rooms || 0);
      const free = Math.max(0, total - Number(row.booked));
      lines.push(`• ${row.name}: ${free}/${total} free — from ${money(row.base_price)}/night`);
    }
    return { reply: lines.join('\n'), intent: 'availability', data: rows };
  }

  // ---- arrivals / departures ----
  if (has('arrival', 'who is coming', 'expected guests', 'check-in')) {
    const rows = await many(
      `SELECT b.code, b.guest_name, b.guest_phone, rt.name AS room_type_name, b.adults, b.total_amount, b.special_requests
         FROM bookings b LEFT JOIN room_types rt ON rt.id=b.room_type_id
        WHERE b.hotel_id=$1 AND b.check_in=$2::date AND b.status IN ('pending','confirmed') ORDER BY b.created_at`,
      [hotelId, today]
    );
    if (!rows.length) return { reply: `No arrivals scheduled for ${dt(today)}. 🎉`, intent: 'arrivals', data: rows };
    return {
      reply: `${rows.length} arrival(s) today:\n\n` + rows.map((x, i) =>
        `${i + 1}. ${x.guest_name} — ${x.room_type_name || 'Room'} · ${x.adults} guest(s) · ${money(x.total_amount)}${x.special_requests ? `\n   📝 ${x.special_requests}` : ''}`
      ).join('\n'),
      intent: 'arrivals', data: rows,
    };
  }
  if (has('departure', 'checking out', 'check-out', 'leaving today', 'due out')) {
    const rows = await many(
      `SELECT b.code, b.guest_name, b.room_number, b.total_amount, b.paid_amount,
              (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due
         FROM bookings b WHERE b.hotel_id=$1 AND b.check_out=$2::date AND b.status='checked_in' ORDER BY b.room_number`,
      [hotelId, today]
    );
    if (!rows.length) return { reply: `No departures scheduled for ${dt(today)}.`, intent: 'departures', data: rows };
    return {
      reply: `${rows.length} departure(s) today:\n\n` + rows.map((x, i) =>
        `${i + 1}. ${x.guest_name}${x.room_number ? ` · Room ${x.room_number}` : ''} — folio due ${money(x.due)}`
      ).join('\n'),
      intent: 'departures', data: rows,
    };
  }

  // ---- occupancy ----
  if (has('occupancy', 'occupy', 'how full', 'fill rate')) {
    const pct = occupancy;
    let advice = '';
    if (pct >= 90) advice = 'You are nearly full — consider raising rates for last-minute bookings.';
    else if (pct >= 70) advice = 'Healthy occupancy. Push direct bookings to cut OTA commission.';
    else if (pct >= 40) advice = 'Moderate occupancy — run a short-stay promo or contact past guests.';
    else advice = 'Occupancy is low. Consider a limited-time offer and reviewing your OTA rates.';
    return {
      reply: `Occupancy right now is ${pct}% — ${kpi.occupied} of ${kpi.total_rooms} rooms are occupied, ${kpi.available} are free.\n\n${advice}`,
      intent: 'occupancy', data: { occupancy: pct, ...kpi },
    };
  }

  // ---- low stock ----
  if (has('low stock', 'stock', 'inventory', 'running out', 'reorder')) {
    const rows = await many(
      `SELECT name, sku, stock_qty, reorder_level, unit, cost_price FROM inventory_items
        WHERE hotel_id=$1 AND is_active AND stock_qty <= reorder_level ORDER BY stock_qty LIMIT 10`,
      [hotelId]
    );
    if (!rows.length) return { reply: 'Good news — no inventory items are below their reorder level right now. ✅', intent: 'inventory' };
    return {
      reply: `${rows.length} item(s) need reordering:\n\n` + rows.map((x) =>
        `• ${x.name} (${x.sku}) — ${x.stock_qty} ${x.unit} left (reorder at ${x.reorder_level})`
      ).join('\n'),
      intent: 'inventory', data: rows,
    };
  }

  // ---- dues / unpaid folios ----
  if (has('due', 'unpaid', 'pending payment', 'outstanding', 'balance pending', 'who owes')) {
        const list = await many(
      `SELECT b.id, b.code, b.guest_name, b.room_number, b.status,
              (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) AS due
         FROM bookings b
        WHERE b.hotel_id=$1 AND b.status IN ('checked_in','checked_out')
          AND (SELECT coalesce(sum(total-paid),0) FROM invoices i WHERE i.booking_id=b.id) > 0
        ORDER BY due DESC LIMIT 10`,
      [hotelId]
    );
    const total = list.reduce((s, x) => s + Number(x.due), 0);
    if (!list.length) return { reply: 'No pending folio balances — every guest is settled up. ✅', intent: 'dues' };
    return {
      reply: `${list.length} folio(s) with outstanding balance totalling ${money(total)}:\n\n` +
        list.map((x) => `• ${x.code} · ${x.guest_name}${x.room_number ? ` · Room ${x.room_number}` : ''} — ${money(x.due)} (${x.status})`).join('\n'),
      intent: 'dues', data: list,
    };
  }

  // ---- revenue / money ----
  if (has('revenue', 'income', 'sales', 'earnings', 'how much did we make', 'money today', 'earnings today')) {
    const month = monthRange(0);
    const m = await one(
      `SELECT
        (SELECT coalesce(sum(total_amount),0) FROM bookings WHERE hotel_id=$1 AND status<>'cancelled'
           AND check_in BETWEEN $2::date AND $3::date) AS rooms,
        (SELECT coalesce(sum(total),0) FROM orders WHERE hotel_id=$1 AND status<>'cancelled'
           AND created_at::date BETWEEN $2::date AND $3::date) AS fnb,
        (SELECT coalesce(sum(total),0) FROM sales WHERE hotel_id=$1 AND status<>'void'
           AND sold_at::date BETWEEN $2::date AND $3::date) AS pos,
        (SELECT coalesce(sum(total),0) FROM expenses WHERE hotel_id=$1 AND expense_date BETWEEN $2::date AND $3::date) AS expense`,
      [hotelId, month.start, month.end]
    );
    const todayTotal = Number(kpi.room_revenue) + Number(kpi.fnb) + Number(kpi.pos);
    const monthTotal = Number(m.rooms) + Number(m.fnb) + Number(m.pos);
    return {
      reply: [
        `📅 Today (${dt(today)}): ${money(todayTotal)}`,
        `   • Rooms ${money(kpi.room_revenue)} · F&B ${money(kpi.fnb)} · POS ${money(kpi.pos)}`,
        ``,
        `📆 This month (${month.label}): ${money(monthTotal)}`,
        `   • Rooms ${money(m.rooms)} · F&B ${money(m.fnb)} · POS ${money(m.pos)}`,
        `   • Expenses ${money(m.expense)} → Net ${money(monthTotal - Number(m.expense))}`,
      ].join('\n'),
      intent: 'revenue', data: { today: kpi, month: m },
    };
  }

  // ---- expenses ----
  if (has('expense', 'spending', 'cost this month')) {
    const month = monthRange(0);
    const rows = await many(
      `SELECT category, coalesce(sum(total),0) AS amount, count(*)::int AS count
         FROM expenses WHERE hotel_id=$1 AND expense_date BETWEEN $2::date AND $3::date
        GROUP BY category ORDER BY amount DESC LIMIT 8`,
      [hotelId, month.start, month.end]
    );
    const total = rows.reduce((s, x) => s + Number(x.amount), 0);
    if (!rows.length) return { reply: `No expenses recorded for ${month.label}.`, intent: 'expenses' };
    return {
      reply: `Expenses in ${month.label}: ${money(total)}\n\n` + rows.map((x) => `• ${x.category}: ${money(x.amount)} (${x.count} entries)`).join('\n'),
      intent: 'expenses', data: rows,
    };
  }

  // ---- housekeeping ----
  if (has('housekeeping', 'cleaning', 'hk', 'room status')) {
    const [tasks, statuses] = await Promise.all([
      many(
        `SELECT hk.type, hk.priority, hk.status, rm.number AS room_number, u.name AS assigned_to
           FROM housekeeping_tasks hk LEFT JOIN rooms rm ON rm.id=hk.room_id
           LEFT JOIN users u ON u.id=hk.assigned_to
          WHERE hk.hotel_id=$1 AND hk.status IN ('pending','in_progress')
          ORDER BY hk.priority DESC, hk.created_at LIMIT 10`,
        [hotelId]
      ),
      many(`SELECT status, count(*)::int AS c FROM rooms WHERE hotel_id=$1 GROUP BY status`, [hotelId]),
    ]);
    const map = Object.fromEntries(statuses.map((s) => [s.status, s.c]));
    const header = `Rooms: ${map.available || 0} available · ${map.occupied || 0} occupied · ${map.cleaning || 0} cleaning · ${(map.maintenance || 0) + (map.out_of_order || 0)} out of order.`;
    if (!tasks.length) return { reply: `${header}\n\nNo pending housekeeping tasks. All clear! ✅`, intent: 'housekeeping' };
    return {
      reply: `${header}\n\n${tasks.length} open task(s):\n` + tasks.map((t, i) =>
        `${i + 1}. ${t.room_number || '—'} · ${t.type} · ${t.priority} · ${t.status}${t.assigned_to ? ` · ${t.assigned_to}` : ''}`
      ).join('\n'),
      intent: 'housekeeping', data: tasks,
    };
  }

  // ---- guest lookup ----
  const guestMatch = msg.match(/(?:guest|find|search|look up)\s+(?:named\s+|called\s+)?([a-z][a-z\s.'-]{2,})/i);
  if (guestMatch) {
    const name = guestMatch[1].trim();
    const rows = await many(
      `SELECT g.first_name, g.last_name, g.email, g.phone, g.total_stays, g.vip_tier,
              b.code, b.status, b.check_in, b.check_out, b.room_number
         FROM guests g LEFT JOIN bookings b ON b.guest_id = g.id AND b.status IN ('checked_in','confirmed')
        WHERE g.hotel_id=$1 AND (g.first_name ILIKE $2 OR g.last_name ILIKE $2 OR (g.first_name||' '||coalesce(g.last_name,'')) ILIKE $2)
        LIMIT 8`,
      [hotelId, `%${name}%`]
    );
    if (!rows.length) return { reply: `I could not find a guest matching "${name}".`, intent: 'guest_lookup' };
    return {
      reply: `Found ${rows.length} match(es):\n\n` + rows.map((g, i) =>
        `${i + 1}. ${g.first_name} ${g.last_name || ''} — ${g.phone || g.email || 'no contact'} · ${g.total_stays} stay(s) · ${g.vip_tier}${g.code ? `\n   Booking ${g.code} (${g.status}) ${g.check_in}→${g.check_out}${g.room_number ? ` room ${g.room_number}` : ''}` : ''}`
      ).join('\n'),
      intent: 'guest_lookup', data: rows,
    };
  }

  // ---- booking lookup ----
  const codeMatch = msg.match(/\b(bk[- ]?\d{3,})\b/i);
  if (codeMatch) {
    const code = codeMatch[1].replace(/[-\s]/g, '').toUpperCase();
    const b = await one(
      `SELECT b.*, rt.name AS room_type_name FROM bookings b
         LEFT JOIN room_types rt ON rt.id=b.room_type_id
        WHERE b.hotel_id=$1 AND replace(upper(b.code),'-','') = $2`,
      [hotelId, code]
    );
    if (!b) return { reply: `No booking found with code ${code}.`, intent: 'booking_lookup' };
    return {
      reply: [
        `Booking ${b.code}: ${b.guest_name}`,
        `• ${b.room_type_name || 'Room'} · ${b.nights} night(s) · ${b.adults} adult(s)`,
        `• ${dt(b.check_in)} → ${dt(b.check_out)}`,
        `• Status: ${b.status}${b.room_number ? ` · Room ${b.room_number}` : ''}`,
        `• Total ${money(b.total_amount)} · Paid ${money(b.paid_amount)} · Due ${money(Number(b.total_amount) - Number(b.paid_amount))}`,
      ].join('\n'),
      intent: 'booking_lookup', data: b,
    };
  }

  // ---- pricing suggestion ----
  if (has('price', 'rate', 'suggest', 'should i charge', 'pricing')) {
    const perf = await many(
      `SELECT rt.name, rt.base_price, rt.weekend_price, count(b.id)::int AS bookings
         FROM room_types rt LEFT JOIN bookings b ON b.room_type_id=rt.id AND b.status<>'cancelled'
          AND b.check_in >= $2::date
        WHERE rt.hotel_id=$1 GROUP BY rt.id ORDER BY bookings DESC`,
      [hotelId, monthRange(-1).start]
    );
    let advice;
    if (occupancy >= 85) advice = `Occupancy is at ${occupancy} — you can safely raise rates by 10–15% for the next 7 days.`;
    else if (occupancy >= 60) advice = `At ${occupancy}% occupancy you're in the sweet spot — hold current rates and push direct bookings.`;
    else advice = `Occupancy is ${occupancy}% — a 8–12% discount or 3rd-night-free offer should stimulate demand.`;
    const lines = [advice, '', 'Room type snapshot (last 30 days):'];
    for (const p of perf) lines.push(`• ${p.name}: base ${money(p.base_price)}, weekend ${money(p.weekend_price || p.base_price)} · ${p.bookings} booking(s)`);
    lines.push('', 'Tip: open Rooms → Rate Seasons to schedule festive/weekend pricing.');
    return { reply: lines.join('\n'), intent: 'pricing', data: { occupancy, perf } };
  }

  // ---- reviews ----
  if (has('review', 'rating', 'feedback', 'guest said')) {
    const rows = await many(
      `SELECT guest_name, rating, comment, created_at FROM reviews
        WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT 5`,
      [hotelId]
    );
    if (!rows.length) return { reply: 'No guest reviews yet.', intent: 'reviews' };
    return {
      reply: `Latest reviews (avg ${kpi.rating || '—'}⭐):\n\n` + rows.map((x) =>
        `• ${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)} ${x.guest_name}: ${x.comment || ''}`
      ).join('\n'),
      intent: 'reviews', data: rows,
    };
  }

  // ---- restaurant live orders ----
  if (has('order', 'restaurant', 'kot', 'kitchen', 'table')) {
    const rows = await many(
      `SELECT o.order_no, o.type, o.status, o.total, o.guest_name, o.room_number, t.name AS table_name,
              (SELECT count(*)::int FROM order_items oi WHERE oi.order_id=o.id) AS items
         FROM orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id
        WHERE o.hotel_id=$1 AND o.status NOT IN ('paid','cancelled') ORDER BY o.created_at LIMIT 10`,
      [hotelId]
    );
    if (!rows.length) return { reply: 'No live restaurant orders right now.', intent: 'restaurant' };
    return {
      reply: `${rows.length} live order(s):\n\n` + rows.map((x) =>
        `• ${x.order_no} · ${x.type}${x.table_name ? ` · ${x.table_name}` : ''}${x.room_number ? ` · rm ${x.room_number}` : ''} · ${x.items} item(s) · ${money(x.total)} · ${x.status}`
      ).join('\n'),
      intent: 'restaurant', data: rows,
    };
  }

  // ---- staff on duty ----
  if (has('staff', 'on duty', 'attendance', 'who is working', 'employee')) {
    const rows = await many(
      `SELECT u.name, sp.designation, sp.department, a.status
         FROM staff_profiles sp JOIN users u ON u.id=sp.user_id
         LEFT JOIN attendance a ON a.staff_id=sp.id AND a.work_date=CURRENT_DATE
        WHERE sp.hotel_id=$1 AND sp.status='active' ORDER BY u.name LIMIT 15`,
      [hotelId]
    );
    if (!rows.length) return { reply: 'No active staff records found.', intent: 'staff' };
    return {
      reply: `${rows.filter((x) => x.status === 'present').length}/${rows.length} staff present today:\n\n` +
        rows.map((x) => `• ${x.name} — ${x.designation || x.department} · ${x.status || 'not marked'}`).join('\n'),
      intent: 'staff', data: rows,
    };
  }

  // ---- help / fallback ----
  if (has('help', 'what can you', 'commands', 'how do you')) {
    return {
      reply: [
        'I am your HotelHub AI concierge. I can answer anything about your property in real time. Try:',
        '',
        '• "Give me the daily briefing"',
        '• "What is my occupancy today?"',
        '• "Any rooms available on 2026-11-01?"',
        '• "Who is arriving today?"',
        '• "Show low stock items"',
        '• "How much did we make this month?"',
        '• "Find guest Priya"',
        '• "Look up booking BK00001"',
        '• "Suggest room pricing"',
        '• "Show unpaid folios"',
        '• "Who is on duty?"',
        '',
        'Tip: set OPENAI_API_KEY in the server .env to unlock free-form AI answers.',
      ].join('\n'),
      intent: 'help',
    };
  }

  // ---- default ----
  const summary = `${kpi.occupied}/${kpi.total_rooms} rooms occupied (${occupancy}%), ${kpi.arrivals} arrivals, ${kpi.departures} departures, ${money(Number(kpi.room_revenue) + Number(kpi.fnb) + Number(kpi.pos))} revenue today.`;
  return {
    reply: [
      `I can help with that. Here is where things stand right now:\n${summary}`,
      '',
      'Try asking about: occupancy, arrivals, departures, availability, revenue, low stock, unpaid folios, housekeeping, staff on duty, restaurant orders or guest reviews.',
      'Type "help" for a full list.',
    ].join('\n'),
    intent: 'fallback',
    data: { kpi },
  };
}

async function askLLM(hotelId, message, history) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const { hotel, today, kpi } = await hotelContext(hotelId);
  const system = [
    `You are the AI concierge for ${hotel.name}, built into HotelHub hotel management software.`,
    `Today is ${today}. Answer concisely (max 120 words), use ₹ for money, be warm and professional.`,
    `Live snapshot: ${kpi.occupied}/${kpi.total_rooms} rooms occupied, ${kpi.arrivals} arrivals, ${kpi.departures} departures,`,
    `room revenue today ₹${kpi.room_revenue}, F&B ₹${kpi.fnb}, POS ₹${kpi.pos}.`,
    `For deep operational questions, tell the user which dashboard page to open.`,
  ].join(' ');
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: message },
        ],
        max_tokens: 400,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// ---------- chat ----------
r.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) throw badRequest('message is required');
    let conversationId = req.body?.conversationId || null;

    if (conversationId) {
      const exists = await one(`SELECT id FROM ai_conversations WHERE id=$1 AND hotel_id=$2 AND user_id=$3`, [conversationId, req.hotelId, req.user.id]);
      if (!exists) conversationId = null;
    }
    if (!conversationId) {
      const c = await one(
        `INSERT INTO ai_conversations (hotel_id, user_id, title) VALUES ($1,$2,$3) RETURNING id`,
        [req.hotelId, req.user.id, message.slice(0, 60)]
      );
      conversationId = c.id;
    }

    await sql(
      `INSERT INTO ai_messages (conversation_id, hotel_id, role, content) VALUES ($1,$2,'user',$3)`,
      [conversationId, req.hotelId, message]
    );

    const history = await many(
      `SELECT role, content FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 12`,
      [conversationId]
    );
    history.reverse();

    let llm = null;
    if (process.env.OPENAI_API_KEY) llm = await askLLM(req.hotelId, message, history);

    let result;
    if (llm) {
      result = { reply: llm, intent: 'llm', data: null };
    } else {
      result = await runIntent(req.hotelId, message);
    }

    await sql(
      `INSERT INTO ai_messages (conversation_id, hotel_id, role, content, meta) VALUES ($1,$2,'assistant',$3,$4)`,
      [conversationId, req.hotelId, result.reply, JSON.stringify({ intent: result.intent, data: result.data || null })]
    );
    await sql(`UPDATE ai_conversations SET updated_at=now() WHERE id=$1`, [conversationId]);

    res.json({
      reply: result.reply,
      conversationId,
      intent: result.intent,
      data: result.data || null,
      engine: llm ? 'openai' : 'local',
    });
  })
);

// ---------- structured briefing (dashboard widget) ----------
r.get(
  '/briefing',
  asyncHandler(async (req, res) => {
    const result = await runIntent(req.hotelId, 'daily briefing');
    res.json({ text: result.reply, data: result.data, intent: result.intent });
  })
);

// ---------- suggestions ----------
r.get(
  '/suggestions',
  asyncHandler(async (_req, res) => {
    res.json({
      items: [
        'Give me the daily briefing',
        'What is my occupancy today?',
        'Who is arriving today?',
        'Show low stock items',
        'How much did we make this month?',
        'Show unpaid folios',
        'Suggest room pricing',
        'Who is on duty?',
        'Any restaurant orders open?',
        'Latest guest reviews',
      ],
    });
  })
);

// ---------- conversations ----------
r.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const rows = await many(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT count(*)::int FROM ai_messages m WHERE m.conversation_id=c.id) AS messages
         FROM ai_conversations c
        WHERE c.hotel_id=$1 AND ($2::uuid IS NULL OR c.user_id=$2::uuid)
        ORDER BY c.updated_at DESC LIMIT 30`,
      [req.hotelId, req.user.id]
    );
    res.json({ items: rows });
  })
);

r.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conv = await one(`SELECT * FROM ai_conversations WHERE id=$1 AND hotel_id=$2 AND user_id=$3`, [req.params.id, req.hotelId, req.user.id]);
    if (!conv) throw notFound('Conversation not found');
    const messages = await many(
      `SELECT id, role, content, meta, created_at FROM ai_messages
        WHERE conversation_id=$1 ORDER BY created_at`,
      [conv.id]
    );
    res.json({ conversation: conv, messages });
  })
);

r.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const r2 = await sql(`DELETE FROM ai_conversations WHERE id=$1 AND hotel_id=$2 AND user_id=$3`, [req.params.id, req.hotelId, req.user.id]);
    if (!r2.rowCount) throw notFound('Conversation not found');
    res.json({ deleted: true });
  })
);

export default r;
