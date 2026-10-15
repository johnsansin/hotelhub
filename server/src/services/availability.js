import { many, one, tx, tsql } from '../db/pool.js';
import { addDays, daysBetween } from '../utils/api.js';

const ACTIVE_BOOKING = `('pending','confirmed','checked_in')`;

/** Nightly availability across a date range (optionally for one room type) */
export async function nightlyAvailability(hotelId, from, to, roomTypeId = null) {
  const nights = daysBetween(from, to);
  const dates = [];
  for (let i = 0; i < nights; i++) dates.push(addDays(from, i));

  const params = [hotelId];
  let typeFilter = '';
  if (roomTypeId) {
    params.push(roomTypeId);
    typeFilter = ' AND r.room_type_id = $2';
  }

  const totals = await many(
    `SELECT r.room_type_id,
            count(*) FILTER (WHERE r.is_active AND r.status <> 'out_of_order')::int AS total
       FROM rooms r
      WHERE r.hotel_id = $1${typeFilter}
      GROUP BY r.room_type_id`,
    params
  );

  const typeParams = [hotelId];
  let typeFilter2 = '';
  if (roomTypeId) {
    typeParams.push(roomTypeId);
    typeFilter2 = ' AND id = $2';
  }
  const roomTypes = await many(
    `SELECT id, total_rooms FROM room_types WHERE hotel_id = $1 AND is_active${typeFilter2}`,
    typeParams
  );

  const bkParams = [hotelId, from, addDays(to, -1)];
  let bkFilter = '';
  if (roomTypeId) {
    bkParams.push(roomTypeId);
    bkFilter = ' AND b.room_type_id = $4';
  }
  const bookings = await many(
    `SELECT COALESCE(b.room_type_id, r.room_type_id) AS room_type_id,
            b.check_in, b.check_out, b.room_id, b.status
       FROM bookings b
       LEFT JOIN rooms r ON r.id = b.room_id
      WHERE b.hotel_id = $1 AND b.status IN ${ACTIVE_BOOKING}
        AND b.check_in <= $3 AND b.check_out > $2${bkFilter}`,
    bkParams
  );

  const blocks = await many(
    `SELECT bl.room_id, COALESCE(bl.room_type_id, r.room_type_id) AS room_type_id,
            bl.start_date, bl.end_date
       FROM room_blocks bl
       LEFT JOIN rooms r ON r.id = bl.room_id
      WHERE bl.hotel_id = $1 AND bl.start_date <= $3 AND bl.end_date > $2`,
    [hotelId, from, addDays(to, -1)]
  );

  // capacity: prefer real room rows, fall back to room_types.total_rooms
  const byType = {};
  for (const rt of roomTypes) byType[rt.id] = { total: 0, nights: {} };
  for (const t of totals) {
    if (!byType[t.room_type_id]) byType[t.room_type_id] = { total: 0, nights: {} };
    byType[t.room_type_id].total = t.total;
  }
  for (const rt of roomTypes) {
    if (!totals.some((t) => t.room_type_id === rt.id)) byType[rt.id].total = Number(rt.total_rooms || 0);
  }
  for (const d of dates) {
    for (const key of Object.keys(byType)) {
      byType[key].nights[d] = { booked: 0, blocked: 0 };
    }
  }
  for (const b of bookings) {
    if (!b.room_type_id || !byType[b.room_type_id]) continue;
    for (const d of dates) {
      if (d >= b.check_in && d < b.check_out) byType[b.room_type_id].nights[d].booked++;
    }
  }
  for (const bl of blocks) {
    const key = bl.room_type_id;
    if (!key || !byType[key]) continue;
    for (const d of dates) {
      if (d >= bl.start_date && d < bl.end_date) byType[key].nights[d].blocked++;
    }
  }

  return dates.map((d) => {
    const perType = {};
    let availTotal = 0;
    for (const [key, val] of Object.entries(byType)) {
      const available = Math.max(0, val.total - val.nights[d].booked - val.nights[d].blocked);
      perType[key] = { total: val.total, booked: val.nights[d].booked, blocked: val.nights[d].blocked, available };
      availTotal += available;
    }
    return { date: d, available: availTotal, byType: perType };
  });
}

export async function roomTypeAvailable(hotelId, roomTypeId, from, to) {
  const nightly = await nightlyAvailability(hotelId, from, to, roomTypeId);
  if (!nightly.length) return { available: 0, minAvailable: 0, nightly };
  const minAvailable = Math.min(...nightly.map((n) => n.byType[roomTypeId]?.available ?? 0));
  return { available: minAvailable, minAvailable, nightly };
}

/** Rooms of a type that are free for the entire stay */
export async function findFreeRooms(hotelId, roomTypeId, from, to, excludeBookingId = null) {
  const params = [hotelId, from, addDays(to, -1)];
  let typeFilter = '';
  if (roomTypeId) {
    params.push(roomTypeId);
    typeFilter = ' AND r.room_type_id = $4';
  }
  const exclude = excludeBookingId ? ` AND b.id <> $${params.length + 1}` : '';
  if (excludeBookingId) params.push(excludeBookingId);

  const rows = await many(
    `SELECT r.id, r.number, r.floor, r.status, r.housekeeping
       FROM rooms r
      WHERE r.hotel_id = $1 AND r.is_active AND r.status IN ('available','cleaning','occupied')
        ${typeFilter}
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
           WHERE b.room_id = r.id AND b.status IN ${ACTIVE_BOOKING}
             AND b.check_in <= $3 AND b.check_out > $2${exclude}
        )
        AND NOT EXISTS (
          SELECT 1 FROM room_blocks bl
           WHERE bl.room_id = r.id AND bl.start_date <= $3 AND bl.end_date > $2
        )
      ORDER BY r.status = 'available' DESC, r.number ASC`,
    params
  );
  return rows;
}

export async function quoteStay(hotelId, roomTypeId, from, to, adults = 2, children = 0, couponCode = null) {
  const rt = await one('SELECT * FROM room_types WHERE id=$1 AND hotel_id=$2', [roomTypeId, hotelId]);
  if (!rt) return null;
  const nights = daysBetween(from, to);
  const taxRate = Number((await one('SELECT tax_rate, service_charge FROM hotels WHERE id=$1', [hotelId]))?.tax_rate || 0);
  const servicePct = Number((await one('SELECT tax_rate, service_charge FROM hotels WHERE id=$1', [hotelId]))?.service_charge || 0);

  const seasons = await many(
    `SELECT * FROM rate_seasons WHERE hotel_id=$1 AND room_type_id=$2 AND is_active
       AND start_date <= $4 AND end_date >= $3 ORDER BY start_date`,
    [hotelId, roomTypeId, from, to]
  );

  let subtotal = 0;
  const nightly = [];
  for (let i = 0; i < nights; i++) {
    const d = addDays(from, i);
    const dow = new Date(d + 'T00:00:00').getDay();
    const season = seasons.find((s) => d >= s.start_date && d <= s.end_date);
    let price = Number(rt.base_price);
    if (season) price = Number(season.price);
    else if (dow === 5 || dow === 6) price = Number(rt.weekend_price) || price;
    subtotal += price;
    nightly.push({ date: d, price });
  }

  let discount = 0;
  let coupon = null;
  if (couponCode) {
    const c = await one(
      `SELECT * FROM coupons WHERE hotel_id=$1 AND upper(code)=upper($2) AND is_active
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
      [hotelId, couponCode]
    );
    if (c && Number(c.used_count) < Number(c.max_uses) && nights >= Number(c.min_stay) && subtotal >= Number(c.min_amount)) {
      discount = c.type === 'percent' ? (subtotal * Number(c.value)) / 100 : Number(c.value);
      discount = Math.min(discount, subtotal);
      coupon = c.code;
    }
  }

  const taxable = Math.max(0, subtotal - discount);
  const service = (taxable * servicePct) / 100;
  const tax = ((taxable + service) * taxRate) / 100;
  const total = taxable + service + tax;

  return {
    room_type: rt,
    nights,
    nightly,
    subtotal: round(subtotal),
    discount: round(discount),
    service: round(service),
    tax: round(tax),
    total: round(total),
    rate: nights ? round(subtotal / nights) : 0,
    coupon,
    taxRate,
    maxAdults: rt.max_adults,
    maxChildren: rt.max_children,
  };
}

function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
