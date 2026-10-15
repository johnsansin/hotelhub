/* eslint-disable no-console */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, sql, one, many, tx, tsql } from './pool.js';
import { runMigrations } from './migrate.js';
import { ensureHotelAccounts, postJournal } from '../services/accounting.js';
import { docNo } from '../services/numbering.js';
import { ensureHotelModules } from '../services/modules.js';

// ---------- deterministic RNG ----------
let _s = 987654321;
function rnd() { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function rint(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function day(offset) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }
function money(n) { return Math.round(n * 100) / 100; }

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Kabir', 'Rohan', 'Arjun', 'Rahul', 'Sanjay', 'Vikram',
  'Priya', 'Ananya', 'Meera', 'Sanya', 'Kavya', 'Neha', 'Divya', 'Riya', 'Pooja', 'Sneha',
  'James', 'Emily', 'John', 'Sarah', 'Michael', 'Olivia', 'David', 'Sophie', 'Daniel', 'Grace'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Mehta', 'Joshi',
  'Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Anderson', 'Thomas', 'Moore', 'Clark', 'Hall'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Jaipur',
  'London', 'Dubai', 'Singapore', 'New York', 'Sydney', 'Toronto'];
const NATIONALITIES = ['Indian', 'British', 'American', 'Emirati', 'Singaporean', 'Australian', 'Canadian', 'German'];
const SPECIAL = ['High floor please', 'Late check-in around 11 PM', 'Honeymoon - surprise setup if possible',
  'Extra towels', 'Quiet room away from the lift', 'Vegetarian meals only', 'Airport pickup at 6 AM',
  'Anniversary on ' + day(rint(1, 30)), 'Twin beds preferred', 'Need a baby cot', '', '', ''];

const ROOM_TYPES = [
  { name: 'Standard Double', code: 'STD', price: 2499, weekend: 2999, adults: 2, children: 1, bed: 'Queen', size: 220, img: '/images/rooms/standard-double.jpg', amenities: ['Wi-Fi', 'TV', 'AC', 'Mini Fridge', 'Study Desk'] },
  { name: 'Deluxe King', code: 'DLX', price: 3499, weekend: 4199, adults: 2, children: 1, bed: 'King', size: 280, img: '/images/rooms/deluxe-king.jpg', amenities: ['Wi-Fi', 'Smart TV', 'AC', 'Mini Bar', 'Sofa', 'Work Desk'] },
  { name: 'Twin Deluxe', code: 'TWN', price: 3299, weekend: 3899, adults: 2, children: 2, bed: 'Twin', size: 285, img: '/images/rooms/twin-deluxe.jpg', amenities: ['Wi-Fi', 'Smart TV', 'AC', 'Twin Beds', 'Work Desk'] },
  { name: 'Garden View', code: 'GRD', price: 3999, weekend: 4699, adults: 2, children: 2, bed: 'King', size: 300, img: '/images/rooms/garden-view.jpg', amenities: ['Garden View', 'Wi-Fi', 'AC', 'Balcony', 'Mini Bar'] },
  { name: 'Family Room', code: 'FAM', price: 4999, weekend: 5799, adults: 3, children: 2, bed: 'King + Sofa', size: 360, img: '/images/rooms/family-room.jpg', amenities: ['Family Friendly', 'Wi-Fi', 'AC', 'Mini Bar', 'Sofa Bed'] },
  { name: 'Executive Suite', code: 'EXE', price: 6999, weekend: 7999, adults: 2, children: 2, bed: 'King', size: 480, img: '/images/rooms/executive-suite.jpg', amenities: ['Living Area', 'Jacuzzi', 'Wi-Fi', 'Lounge Access', 'Espresso Machine'] },
  { name: 'Presidential Suite', code: 'PRE', price: 14999, weekend: 16999, adults: 4, children: 3, bed: 'King', size: 900, img: '/images/rooms/presidential-suite.jpg', amenities: ['Butler Service', 'Private Bar', 'Study', 'Panoramic View', 'Dining Area'] },
  { name: 'Studio Apartment', code: 'APT', price: 5499, weekend: 6299, adults: 2, children: 2, bed: 'King', size: 420, img: '/images/rooms/apartment.jpg', amenities: ['Kitchenette', 'Wi-Fi', 'Washer', 'Living Area', 'Balcony'] },
];

const MENU = {
  'Starters': [
    ['Paneer Tikka', 320, true], ['Chicken Seekh Kebab', 380, false], ['Crispy Corn', 260, true],
    ['Fish Amritsari', 420, false], ['Veg Spring Rolls', 240, true], ['Tandoori Prawns', 520, false],
  ],
  'Main Course': [
    ['Butter Chicken', 480, false], ['Paneer Butter Masala', 380, true], ['Dal Makhani', 320, true],
    ['Lamb Rogan Josh', 560, false], ['Veg Biryani', 320, true], ['Chicken Biryani', 420, false],
    ['Grilled Fish Lemon Butter', 620, false], ['Kadai Mushroom', 340, true],
  ],
  'Breads & Rice': [
    ['Garlic Naan', 90, true], ['Butter Roti', 60, true], ['Jeera Rice', 140, true],
    ['Lemon Rice', 130, true], ['Veg Pulao', 180, true],
  ],
  'Desserts': [
    ['Gulab Jamun', 140, true], ['Rasmalai', 160, true], ['Chocolate Brownie', 220, true],
    ['Cheesecake of the Day', 260, true],
  ],
  'Beverages': [
    ['Masala Chai', 90, true], ['Cafe Latte', 160, true], ['Fresh Lime Soda', 110, true],
    ['Cold Coffee', 180, true], ['Mango Lassi', 150, true], ['Soft Drink', 80, true],
    ['Kingfisher Beer (btl)', 220, true], ['House Wine (glass)', 350, true],
  ],
};

async function ensurePlan(code, data) {
  const existing = await one('SELECT * FROM plans WHERE code=$1', [code]);
  if (existing) return existing;
  return one(
    `INSERT INTO plans (code, name, tagline, price_monthly, price_yearly, max_rooms, max_staff,
        max_orders_month, features, highlights, is_popular, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [code, data.name, data.tagline, data.price_monthly, data.price_yearly, data.max_rooms,
      data.max_staff, data.max_orders, JSON.stringify(data.features), JSON.stringify(data.highlights),
      !!data.popular, data.sort]
  );
}

async function createHotel(h, adminEmail) {
  return tx(async (client) => {
    const hotel = (await tsql(
      client,
      `INSERT INTO hotels (slug, name, legal_name, tagline, description, email, phone, website,
          address, city, state, country, zip, currency, currency_symbol, star_rating, status,
          plan_id, trial_ends_at, logo_url, cover_url, amenities, gallery, about, policies, social)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NULL,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [
        h.slug, h.name, h.legal_name || h.name, h.tagline, h.description, h.email, h.phone, h.website,
        h.address, h.city, h.state, h.country || 'India', h.zip || '403001', 'INR', '₹', h.stars,
        h.status || 'active', h.plan_id,
        h.logo_url || null, h.cover_url || '/images/site/hero.jpg',
        JSON.stringify(h.amenities || []), JSON.stringify(h.gallery || []),
        h.about || h.description, JSON.stringify(h.policies || {}), JSON.stringify(h.social || {}),
      ]
    )).rows[0];

    const hash = await bcrypt.hash('demo123', 10);
    const admin = (await tsql(
      client,
      `INSERT INTO users (hotel_id, role, name, email, phone, password_hash, designation, is_active)
       VALUES ($1,'admin',$2,$3,$4,$5,'Owner / Admin',true) RETURNING id`,
      [hotel.id, h.adminName, adminEmail, h.phone, hash]
    )).rows[0];
    await tsql(client, 'UPDATE hotels SET created_by=$2 WHERE id=$1', [hotel.id, admin.id]);

    await ensureHotelAccounts(client, hotel.id);
    await tsql(
      client,
      `INSERT INTO shifts (hotel_id, name, start_time, end_time) VALUES
       ($1,'Morning (06:00 - 14:00)','06:00','14:00'),
       ($1,'Evening (14:00 - 22:00)','14:00','22:00'),
       ($1,'Night (22:00 - 06:00)','22:00','06:00')`,
      [hotel.id]
    );
    const sub = (await tsql(
      client,
      `INSERT INTO subscriptions (hotel_id, plan_id, billing_cycle, status, amount, starts_at, ends_at, paid_via, reference)
       VALUES ($1,$2,'monthly','active',$3, now() - interval '3 months', now() + interval '9 months', 'card','SEED-REF')
       RETURNING *`,
      [hotel.id, h.plan_id, h.planPrice || 0]
    )).rows[0];
    return { hotel, admin, sub };
  });
}

async function seedRoomTypes(client, hotelId, types, prefix = '') {
  const map = {};
  let sort = 1;
  for (const t of types) {
    const row = (await tsql(
      client,
      `INSERT INTO room_types (hotel_id, name, code, slug, description, short_desc, base_price,
          weekend_price, peak_price, max_adults, max_children, extra_bed, bed_type, size_sqft,
          total_rooms, amenities, image, images, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true) RETURNING *`,
      [
        hotelId, t.name, `${prefix}${t.code}`, t.name.toLowerCase().replace(/\s+/g, '-'),
        `${t.name} — ${t.size} sq.ft of calm with ${t.bed.toLowerCase()} bed, ${t.amenities.slice(0, 4).join(', ').toLowerCase()} and garden/city views. Perfect for ${t.adults} adult(s).`,
        `${t.size} sq.ft · ${t.bed} bed · Sleeps ${t.adults + t.children}`,
        t.price, t.weekend, Math.round(t.weekend * 1.25), t.adults, t.children, 800,
        t.bed, t.size, t.total || 0, JSON.stringify(t.amenities), t.img, JSON.stringify([t.img]), sort++,
      ]
    )).rows[0];
    map[t.code] = row;
  }
  return map;
}

async function seedRooms(client, hotelId, type, count, startNo) {
  const rooms = [];
  for (let i = 0; i < count; i++) {
    const number = String(startNo + i);
    const floor = String(Math.floor((startNo + i) / 100) * 100 || 1);
    const row = (await tsql(
      client,
      `INSERT INTO rooms (hotel_id, room_type_id, number, floor, view, status, housekeeping, is_active)
       VALUES ($1,$2,$3,$4,$5,'available','clean',true) RETURNING *`,
      [hotelId, type.id, number, floor, pick(['City', 'Garden', 'Pool', 'Sea', 'Courtyard'])]
    )).rows[0];
    rooms.push(row);
  }
  return rooms;
}

async function seedGuests(client, hotelId, n) {
  const guests = [];
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${rint(1, 999)}@example.com`;
    const row = (await tsql(
      client,
      `INSERT INTO guests (hotel_id, first_name, last_name, email, phone, nationality, country,
          id_type, id_number, city, gender, vip_tier, total_stays, total_spent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0) RETURNING *`,
      [hotelId, first, last, email, `+91 ${rint(70000, 99999)}${rint(10000, 99999)}`,
        pick(NATIONALITIES), pick(['India', 'UK', 'USA', 'UAE', 'Singapore']),
        pick(['Passport', 'Aadhaar', 'Driver License']), `ID${rint(100000, 999999)}`,
        pick(CITIES), pick(['Male', 'Female', 'Other']),
        pick(['standard', 'standard', 'standard', 'silver', 'gold', 'platinum'])]
    )).rows[0];
    guests.push(row);
  }
  return guests;
}

async function seedBooking(client, hotel, roomTypes, rooms, guests, opts) {
  const rt = opts.room_type || pick(roomTypes);
  const typeRooms = rooms.filter((r) => r.room_type_id === rt.id);
  const guest = opts.guest || pick(guests);
  const nights = opts.nights || rint(1, 4);
  const from = opts.from;
  const to = dayOffset(from, nights);
  const weekendNights = countWeekend(from, nights);
  const rate = money(rt.base_price * (nights - weekendNights) + rt.weekend_price * weekendNights);
  const taxRate = Number(hotel.tax_rate || 12);
  const tax = money(rate * taxRate / 100);
  const total = money(rate + tax);
  const code = await docNo(client, hotel.id, 'booking', 'BK', 5);
  const name = `${guest.first_name} ${guest.last_name || ''}`.trim();

  const booking = (await tsql(
    client,
    `INSERT INTO bookings (hotel_id, code, guest_id, room_type_id, room_id, room_number, check_in, check_out,
        nights, adults, children, status, source, rate, subtotal, tax, total_amount, paid_amount,
        guest_name, guest_email, guest_phone, special_requests, internal_notes, checked_in_at, checked_out_at,
        created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     RETURNING *`,
    [
      hotel.id, code, guest.id, rt.id, opts.room?.id || null, opts.room?.number || null,
      from, to, nights, Math.min(rt.max_adults, rint(1, 2)), rint(0, rt.max_children),
      opts.status, opts.source || pick(['website', 'walk_in', 'phone', 'ota', 'corporate']),
      money(rate / nights), rate, tax, total, opts.paid === undefined ? total : opts.paid,
      name, guest.email, guest.phone, pick(SPECIAL), opts.notes || null,
      opts.status === 'checked_in' || opts.status === 'checked_out' ? `${from}T14:00:00Z` : null,
      opts.status === 'checked_out' ? `${to}T11:00:00Z` : null,
      opts.createdBy || null, opts.createdAt || `${day(rint(-45, -1))}T${rint(8, 21)}:00:00Z`,
    ]
  )).rows[0];

  await tsql(
    client,
    `INSERT INTO booking_logs (booking_id, hotel_id, action, detail, actor_name)
     VALUES ($1,$2,'created','Booking created during seed','System')`,
    [booking.id, hotel.id]
  );

  // folio + payment for checked_in / checked_out
  if (['checked_in', 'checked_out'].includes(opts.status)) {
    const invNo = await docNo(client, hotel.id, 'invoice', 'INV', 5);
    const inv = (await tsql(
      client,
      `INSERT INTO invoices (hotel_id, booking_id, invoice_no, type, party_name, party_email, party_phone,
          issue_date, sub_total, tax, total, paid, status, created_at)
       VALUES ($1,$2,$3,'stay',$4,$5,$6,$7,$8,$9,$9,$10,$11,$12) RETURNING *`,
      [hotel.id, booking.id, invNo, name, guest.email, guest.phone, from, rate, tax,
        opts.status === 'checked_out' ? total : 0,
        opts.status === 'checked_out' ? 'paid' : 'unpaid',
        `${from}T14:05:00Z`]
    )).rows[0];
    await tsql(
      client,
      `INSERT INTO invoice_items (invoice_id, hotel_id, description, category, qty, rate, amount, tax)
       VALUES ($1,$2,$3,'room',$4,$5,$6,$7)`,
      [inv.id, hotel.id, `Room charge · ${nights} night(s) @ ₹${money(rate / nights)}`, nights, money(rate / nights), rate, tax]
    );
    if (opts.status === 'checked_out') {
      const paidAt = `${to}T11:10:00Z`;
      await tsql(
        client,
        `INSERT INTO payments (hotel_id, invoice_id, booking_id, amount, method, direction, category, paid_at, received_by)
         VALUES ($1,$2,$3,$4,$5,'in','guest',$6,$7)`,
        [hotel.id, inv.id, booking.id, total, pick(['cash', 'card', 'upi']), paidAt, opts.createdBy || null]
      );
      await postJournal(client, {
        hotelId: hotel.id, date: to, refType: 'invoice', refId: inv.id,
        memo: `Stay revenue ${code}`, createdBy: opts.createdBy,
        lines: [
          { code: '4000', credit: rate },
          { code: '2010', credit: tax },
          { code: '1000', debit: total },
        ],
      });
      await tsql(client, `UPDATE guests SET total_stays = total_stays + 1, total_spent = total_spent + $2 WHERE id=$1`,
        [guest.id, total]);
    }
  }
  return booking;
}

function dayOffset(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function countWeekend(dateStr, nights) {
  let c = 0;
  for (let i = 0; i < nights; i++) {
    const dow = new Date(dayOffset(dateStr, i) + 'T12:00:00').getDay();
    if (dow === 5 || dow === 6) c++;
  }
  return c;
}

async function seedRestaurant(client, hotel, users) {
  const cats = {};
  let sort = 1;
  for (const [cat, items] of Object.entries(MENU)) {
    const c = (await tsql(client,
      `INSERT INTO menu_categories (hotel_id, name, sort_order, is_active) VALUES ($1,$2,$3,true) RETURNING *`,
      [hotel.id, cat, sort++])).rows[0];
    cats[cat] = c;
    for (const [name, price, veg] of items) {
      await tsql(
        client,
        `INSERT INTO menu_items (hotel_id, category_id, name, description, price, cost, code, is_veg, is_available, prep_time, taxes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,5)`,
        [hotel.id, c.id, name, `Freshly prepared ${name.toLowerCase()} by our kitchen team.`,
          price, money(price * 0.38), name.slice(0, 3).toUpperCase() + rint(10, 99), veg, rint(10, 30)]
      );
    }
  }
  const tables = [];
  const areas = ['Indoor', 'Terrace', 'Poolside', 'Private'];
  for (let i = 1; i <= 12; i++) {
    const t = (await tsql(client,
      `INSERT INTO restaurant_tables (hotel_id, name, area, seats, status) VALUES ($1,$2,$3,$4,'free') RETURNING *`,
      [hotel.id, `T${i}`, pick(areas), pick([2, 4, 4, 6, 8])])).rows[0];
    tables.push(t);
  }
  return { cats, tables };
}

async function seedOrders(client, hotel, menuItems, tables, guests, users) {
  const orders = [];
  for (let d = -14; d <= 0; d++) {
    const count = rint(2, 7);
    for (let i = 0; i < count; i++) {
      const type = pick(['dine_in', 'dine_in', 'room_service', 'takeaway']);
      const table = type === 'dine_in' ? pick(tables) : null;
      const created = `${day(d)}T${rint(8, 22)}:${rint(0, 59)}:00Z`;
      const orderNo = await docNo(client, hotel.id, 'order', 'ORD', 4);
      const guest = pick(guests);
      const status = d < 0 ? 'paid' : pick(['new', 'preparing', 'ready', 'served', 'paid']);
      const order = (await tsql(
        client,
        `INSERT INTO orders (hotel_id, order_no, type, table_id, guest_name, room_number, status, persons,
            served_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
        [hotel.id, orderNo, type, table?.id || null, `${guest.first_name} ${guest.last_name}`,
          type === 'room_service' ? String(rint(101, 408)) : null, status, rint(1, 5),
          pick(users).id, created]
      )).rows[0];

      const lineCount = rint(1, 4);
      let sub = 0; let tax = 0;
      for (let j = 0; j < lineCount; j++) {
        const mi = pick(menuItems);
        const qty = rint(1, 3);
        const amount = money(mi.price * qty);
        const lineTax = money(amount * 0.05);
        sub += amount; tax += lineTax;
        await tsql(
          client,
          `INSERT INTO order_items (order_id, hotel_id, menu_item_id, name, qty, price, cost, tax, amount, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'served')`,
          [order.id, hotel.id, mi.id, mi.name, qty, mi.price, mi.cost, lineTax, amount]
        );
      }
      const total = money(sub + tax);
      await tsql(client, `UPDATE orders SET sub_total=$2, tax=$3, total=$4, paid=$5 WHERE id=$1`,
        [order.id, sub, tax, total, status === 'paid' ? total : 0]);
      if (status === 'paid') {
        await tsql(client,
          `INSERT INTO payments (hotel_id, amount, method, ref_type, ref_id, category, paid_at, received_by)
           VALUES ($1,$2,$3,'order',$4,'restaurant',$5,$6)`,
          [hotel.id, total, pick(['cash', 'card', 'upi']), order.id, created, pick(users).id]);
        await postJournal(client, {
          hotelId: hotel.id, date: day(d), refType: 'order', refId: order.id,
          memo: `Restaurant sale ${orderNo}`, createdBy: pick(users).id,
          lines: [
            { code: '1000', debit: total },
            { code: '4010', credit: sub },
            { code: '2010', credit: tax },
          ],
        });
      }
      orders.push(order);
    }
  }
  return orders;
}

async function seedInventory(client, hotel, users) {
  const catNames = ['Housekeeping', 'Kitchen', 'Front Desk', 'Linen', 'Maintenance', 'Beverage'];
  const cats = {};
  for (const n of catNames) {
    const c = (await tsql(client,
      `INSERT INTO inventory_categories (hotel_id, name) VALUES ($1,$2) RETURNING *`, [hotel.id, n])).rows[0];
    cats[n] = c;
  }
  const suppliers = [];
  const supData = [
    ['CleanCo Supplies', 'Housekeeping', 'Rajesh Kumar'],
    ['FreshFarm Produce', 'Kitchen', 'Anita Desai'],
    ['Urban Linens Pvt Ltd', 'Linen', 'Suresh Pillai'],
    ['TechFix Services', 'Maintenance', 'Mike Ross'],
    ['BevWorld Distributors', 'Beverage', 'Carlos Mendes'],
    ['Frontline Essentials', 'Front Desk', 'Neha Kapoor'],
  ];
  for (const [name, cat, contact] of supData) {
    const s = (await tsql(
      client,
      `INSERT INTO suppliers (hotel_id, name, contact_name, phone, email, city, gst_no, payment_terms, categories, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING *`,
      [hotel.id, name, contact, `+91 ${rint(70000, 99999)}${rint(10000, 99999)}`,
        `${name.split(' ')[0].toLowerCase()}@supplier.example`, pick(CITIES),
        `GST${rint(1000000000, 9999999999)}`, pick(['Net 15', 'Net 30', 'Advance']),
        JSON.stringify([cat])]
    )).rows[0];
    suppliers.push(s);
  }
  const itemData = [
    ['Bath Towel (White)', 'TOW-001', 'Linen', 'pcs', 180, 40, 220, 320],
    ['Bed Sheet Queen', 'SHT-002', 'Linen', 'pcs', 90, 25, 450, 650],
    ['Pillow Cover', 'PLW-003', 'Linen', 'pcs', 140, 40, 90, 140],
    ['Shampoo 30ml', 'SHM-004', 'Housekeeping', 'btl', 220, 60, 25, 45],
    ['Body Lotion 30ml', 'LOT-005', 'Housekeeping', 'btl', 160, 50, 28, 50],
    ['Toilet Roll', 'TRL-006', 'Housekeeping', 'pcs', 300, 80, 18, 30],
    ['Floor Cleaner 5L', 'CLN-007', 'Housekeeping', 'can', 12, 4, 420, 600],
    ['Glass Cleaner 1L', 'CLN-008', 'Housekeeping', 'btl', 24, 8, 180, 260],
    ['Onion (kg)', 'VEG-010', 'Kitchen', 'kg', 28, 8, 32, 0],
    ['Tomato (kg)', 'VEG-011', 'Kitchen', 'kg', 18, 6, 36, 0],
    ['Paneer (kg)', 'VEG-012', 'Kitchen', 'kg', 6, 2, 340, 0],
    ['Basmati Rice (kg)', 'GRN-013', 'Kitchen', 'kg', 90, 20, 110, 0],
    ['Sunflower Oil 5L', 'OIL-014', 'Kitchen', 'can', 8, 3, 780, 0],
    ['Tea Leaves 1kg', 'BEV-015', 'Beverage', 'kg', 14, 4, 420, 0],
    ['Coffee Beans 1kg', 'BEV-016', 'Beverage', 'kg', 9, 3, 980, 0],
    ['Mineral Water 1L', 'BEV-017', 'Beverage', 'btl', 240, 60, 18, 30],
    ['Soft Drink Cans', 'BEV-018', 'Beverage', 'can', 180, 48, 40, 60],
    ['Laundry Detergent 5kg', 'LND-019', 'Housekeeping', 'pack', 4, 2, 620, 0],
    ['Key Card Blank', 'KCD-020', 'Front Desk', 'pcs', 250, 60, 22, 40],
    ['Guest Slippers', 'GST-021', 'Housekeeping', 'pair', 320, 80, 35, 60],
    ['Notepad + Pen Set', 'GST-022', 'Front Desk', 'set', 150, 40, 55, 90],
    ['LED Bulb 9W', 'MNT-023', 'Maintenance', 'pcs', 45, 12, 90, 140],
    ['AC Filter Large', 'MNT-024', 'Maintenance', 'pcs', 8, 3, 650, 900],
    ['Door Lock Battery', 'MNT-025', 'Maintenance', 'pcs', 20, 6, 140, 200],
  ];
  const items = [];
  for (const [name, sku, cat, unit, qty, reorder, cost, sell] of itemData) {
    const it = (await tsql(
      client,
      `INSERT INTO inventory_items (hotel_id, name, sku, category_id, unit, stock_qty, reorder_level,
          cost_price, sell_price, supplier_id, location, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING *`,
      [hotel.id, name, sku, cats[cat]?.id || null, unit, qty + rint(-2, 8), reorder,
        cost, sell, pick(suppliers).id, pick(['Store A', 'Store B', 'Kitchen Store', 'Linen Room'])]
    )).rows[0];
    items.push(it);
    await tsql(client,
      `INSERT INTO stock_movements (hotel_id, item_id, type, qty, note, unit_cost, created_by, ref_type)
       VALUES ($1,$2,'in',$3,'Opening stock',$4,$5,'manual')`,
      [hotel.id, it.id, it.stock_qty, it.cost_price, pick(users).id]);
  }

  // purchase orders
  for (let i = 0; i < 8; i++) {
    const sup = pick(suppliers);
    const poNo = await docNo(client, hotel.id, 'purchase', 'PO', 4);
    const status = pick(['received', 'received', 'sent', 'partial', 'draft', 'cancelled']);
    const lines = [];
    for (let j = 0; j < rint(1, 3); j++) {
      const it = pick(items);
      const qty = rint(5, 40);
      lines.push({ item: it, qty, rate: it.cost_price, amount: money(qty * it.cost_price) });
    }
    const sub = money(lines.reduce((s, l) => s + l.amount, 0));
    const tax = money(sub * 0.18);
    const total = money(sub + tax);
    const od = day(rint(-40, -2));
    const po = (await tsql(
      client,
      `INSERT INTO purchase_orders (hotel_id, po_no, supplier_id, order_date, expected_date, status,
          sub_total, tax, total, paid, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [hotel.id, poNo, sup.id, od, dayOffset(od, rint(2, 8)), status, sub, tax, total,
        status === 'received' ? total : 0, pick(users).id, `${od}T10:00:00Z`]
    )).rows[0];
    for (const l of lines) {
      const received = status === 'received' ? l.qty : status === 'partial' ? Math.floor(l.qty / 2) : 0;
      await tsql(client,
        `INSERT INTO purchase_order_items (po_id, hotel_id, item_id, name, qty, received_qty, rate, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [po.id, hotel.id, l.item.id, l.item.name, l.qty, received, l.rate, l.amount]);
      if (received > 0) {
        await tsql(client, `UPDATE inventory_items SET stock_qty = stock_qty + $2 WHERE id=$1`, [l.item.id, received]);
        await tsql(client,
          `INSERT INTO stock_movements (hotel_id, item_id, type, qty, ref_type, ref_id, note, unit_cost, created_by)
           VALUES ($1,$2,'in',$3,'purchase',$4,$5,$6,$7)`,
          [hotel.id, l.item.id, received, po.id, `Received against ${poNo}`, l.rate, pick(users).id]);
      }
    }
    if (status === 'received') {
      await postJournal(client, {
        hotelId: hotel.id, date: od, refType: 'purchase', refId: po.id,
        memo: `Purchase ${poNo}`, createdBy: pick(users).id,
        lines: [
          { code: '1030', debit: total },
          { code: '2000', credit: total },
        ],
      });
      await tsql(client,
        `INSERT INTO payments (hotel_id, amount, method, direction, category, ref_type, ref_id, paid_at, received_by)
         VALUES ($1,$2,'bank_transfer','out','supplier','purchase',$3,$4,$5)`,
        [hotel.id, total, po.id, `${od}T16:00:00Z`, pick(users).id]);
    }
  }
  return { cats, suppliers, items };
}

async function seedStaff(client, hotel, admin) {
  const staffDefs = [
    ['Ramesh Chowdary', 'General Manager', 'Management', 'admin', 120000],
    ['Sunita Rao', 'Front Desk Manager', 'Front Office', 'manager', 65000],
    ['Amit Shah', 'Receptionist', 'Front Office', 'receptionist', 32000],
    ['Lakshmi Menon', 'Receptionist', 'Front Office', 'receptionist', 30000],
    ['Prakash Yadav', 'Housekeeping Supervisor', 'Housekeeping', 'housekeeper', 38000],
    ['Suman Devi', 'Housekeeping Attendant', 'Housekeeping', 'housekeeper', 22000],
    ['Fernandes Silva', 'Executive Chef', 'Restaurant', 'restaurant', 85000],
    ['Nisha Patel', 'Server', 'Restaurant', 'restaurant', 24000],
    ['Karan Malhotra', 'Accountant', 'Accounts', 'accountant', 55000],
    ['Deepak Kumar', 'Store Keeper', 'Stores', 'storekeeper', 28000],
    ['Anil Kumar', 'Maintenance Tech', 'Engineering', 'staff', 30000],
  ];
  const shifts = await many(`SELECT * FROM shifts WHERE hotel_id=$1`, [hotel.id]);
  const users = [];
  const profiles = [];
  for (const [name, designation, dept, role, salary] of staffDefs) {
    const email = `${name.split(' ')[0].toLowerCase()}.${hotel.slug.slice(0, 6)}@demo.hms`;
    const exists = await one(`SELECT id FROM users WHERE lower(email)=lower($1)`, [email]);
    let user;
    if (exists) {
      user = exists;
    } else {
      const hash = await bcrypt.hash('demo123', 10);
      user = (await tsql(
        client,
        `INSERT INTO users (hotel_id, role, name, email, phone, password_hash, designation, is_active, last_login_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true, now() - interval '${rint(1, 48)} hours') RETURNING *`,
        [hotel.id, role, name, email, `+91 ${rint(70000, 99999)}${rint(10000, 99999)}`, hash, designation]
      )).rows[0];
    }
    users.push(user);
    const prof = (await tsql(
      client,
      `INSERT INTO staff_profiles (hotel_id, user_id, employee_code, department, designation, shift_id,
          join_date, salary, gender, address, emergency_name, emergency_phone, bank_account, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active') RETURNING *`,
      [hotel.id, user.id, `EMP-${String(rint(100, 999))}${profiles.length}`, dept, designation,
        pick(shifts).id, day(rint(-900, -60)), salary, pick(['Male', 'Female']),
        `${rint(1, 99)} ${pick(['MG Road', 'Link Road', 'Station Road', 'Hill View'])}, ${hotel.city}`,
        pick(FIRST) + ' ' + name.split(' ')[1], `+91 ${rint(70000, 99999)}${rint(10000, 99999)}`,
        `HDFC${rint(100000, 999999)}`]
    )).rows[0];
    profiles.push(prof);

    // attendance last 21 days
    for (let d = -21; d <= 0; d++) {
      const dow = new Date(day(d) + 'T12:00:00').getDay();
      if (dow === 0) continue;
      const status = rnd() > 0.9 ? pick(['late', 'leave', 'absent']) : 'present';
      const ci = `${day(d)}T0${rint(5, 9)}:${rint(0, 59)}:00Z`;
      const co = `${day(d)}T${rint(14, 19)}:${rint(0, 59)}:00Z`;
      await tsql(client,
        `INSERT INTO attendance (hotel_id, staff_id, work_date, status, check_in, check_out, hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (staff_id, work_date) DO NOTHING`,
        [hotel.id, prof.id, day(d), status, status === 'present' || status === 'late' ? ci : null,
          status === 'present' ? co : null, status === 'present' ? 8 : status === 'late' ? 7.5 : 0]);
    }
    // payroll
    const period = day(0).slice(0, 7);
    await tsql(client,
      `INSERT INTO payroll (hotel_id, staff_id, period, basic, allowances, deductions, net_pay, status, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'paid',$8)
       ON CONFLICT (staff_id, period) DO NOTHING`,
      [hotel.id, prof.id, period, salary, 5000, 1500, salary + 3500, `${day(-2)}T10:00:00Z`]);
    await postJournal(client, {
      hotelId: hotel.id, date: day(-2), refType: 'payroll', refId: prof.id,
      memo: `Salary ${period} · ${name}`, createdBy: admin.id,
      lines: [
        { code: '5000', debit: salary + 3500 },
        { code: '1000', credit: salary + 3500 },
      ],
    });
  }
  // leaves
  for (let i = 0; i < 4; i++) {
    const p = pick(profiles);
    const fd = day(rint(-10, 20));
    await tsql(client,
      `INSERT INTO leave_requests (hotel_id, staff_id, type, from_date, to_date, reason, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [hotel.id, p.id, pick(['casual', 'sick', 'paid']), fd, dayOffset(fd, rint(1, 3)),
        pick(['Family function', 'Not feeling well', 'Personal work', 'Travel']),
        pick(['approved', 'pending', 'approved', 'rejected'])]);
  }
  return { users, profiles };
}

async function seedExpenses(client, hotel, admin) {
  const cats = [
    ['Utilities (Power & Water)', '5001'], ['Food & Beverage Cost', '5002'],
    ['Housekeeping Supplies', '5003'], ['Maintenance & Repairs', '5004'],
    ['Marketing & Commission', '5005'], ['Laundry & Linen', '5007'],
    ['Software & Subscriptions', '5008'], ['Miscellaneous Expense', '5009'],
  ];
  for (let i = 0; i < 28; i++) {
    const [cat, code] = pick(cats);
    const amount = money(rint(5, 120) * 250);
    const tax = money(amount * 0.18);
    const total = money(amount + tax);
    const d = day(rint(-60, 0));
    const expNo = await docNo(client, hotel.id, 'expense', 'EXP', 4);
    const exp = (await tsql(
      client,
      `INSERT INTO expenses (hotel_id, expense_no, category, account_id, title, vendor, amount, tax, total,
          expense_date, payment_method, status, created_by, created_at)
       VALUES ($1,$2,$3,(SELECT id FROM accounts WHERE hotel_id=$1 AND code=$4),$5,$6,$7,$8,$9,$10,$11,'paid',$12,$13)
       RETURNING *`,
      [hotel.id, expNo, cat, code, `${cat} — ${pick(['monthly', 'weekly', 'one-time', 'urgent'])}`,
        pick(['City Power Board', 'Local Vendor', 'Agency Partner', 'Service Provider', 'Amazon Business']),
        amount, tax, total, d, pick(['cash', 'bank_transfer', 'card']), admin.id, `${d}T12:00:00Z`]
    )).rows[0];
    await postJournal(client, {
      hotelId: hotel.id, date: d, refType: 'expense', refId: exp.id,
      memo: `Expense ${expNo}`, createdBy: admin.id,
      lines: [
        { code, debit: total },
        { code: '1000', credit: total },
      ],
    });
  }
}

async function seedOps(client, hotel, rooms, users) {
  for (let i = 0; i < 12; i++) {
    const room = pick(rooms);
    await tsql(client,
      `INSERT INTO housekeeping_tasks (hotel_id, room_id, type, priority, status, assigned_to, notes, created_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [hotel.id, room.id, pick(['clean', 'deep_clean', 'inspect', 'towel_change']),
        pick(['low', 'normal', 'normal', 'high']),
        pick(['pending', 'pending', 'in_progress', 'done', 'done']),
        pick(users).id, pick(['Turndown service', 'Checkout turnover', 'VIP arrival prep', 'Stayover service']),
        `${day(rint(-5, 0))}T${rint(8, 17)}:00:00Z`,
        rnd() > 0.5 ? `${day(rint(-4, 0))}T${rint(10, 19)}:00:00Z` : null]);
  }
  for (let i = 0; i < 6; i++) {
    const room = pick(rooms);
    const status = pick(['open', 'in_progress', 'resolved', 'closed']);
    await tsql(client,
      `INSERT INTO maintenance_tasks (hotel_id, room_id, title, description, category, priority, status, cost, vendor, assigned_to, reported_by, due_date, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [hotel.id, room.id,
        pick(['AC not cooling', 'Leaky tap', 'Broken wardrobe hinge', 'Light flickering', 'TV remote missing', 'Door lock jammed']),
        pick(['Reported by guest', 'Found during inspection', 'Routine check']), pick(['Electrical', 'Plumbing', 'Carpentry', 'HVAC']),
        pick(['low', 'normal', 'high']), status, money(rint(2, 40) * 100),
        pick(['In-house team', 'City Services', 'Apex Maintenance']), pick(users).id, pick(users).id,
        day(rint(1, 10)), status === 'resolved' || status === 'closed' ? `${day(rint(-3, 0))}T15:00:00Z` : null]);
  }
  const flItems = [
    ['iPhone 13', 'Electronics', 'Room 204', 'found'],
    ['Gold bracelet', 'Jewellery', 'Pool area', 'stored'],
    ['Black umbrella', 'Accessories', 'Lobby', 'returned'],
    ['MacBook charger', 'Electronics', 'Restaurant', 'found'],
    ['Blue jacket', 'Clothing', 'Banquet hall', 'claimed'],
    ['Prescription glasses', 'Personal', 'Room 108', 'returned'],
    ['Leather wallet', 'Accessories', 'Spa', 'donated'],
  ];
  for (const [name, cat, loc, status] of flItems) {
    await tsql(client,
      `INSERT INTO found_lost_items (hotel_id, item_name, description, category, location, found_date, found_by, value, status, guest_name, claimant, claim_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [hotel.id, name, `${name} handed to front desk`, cat, loc, day(rint(-20, -1)),
        pick(['Housekeeping', 'Front Desk', 'Restaurant']), money(rint(5, 50) * 100), status,
        rnd() > 0.5 ? pick(FIRST) + ' ' + pick(LAST) : null,
        status === 'returned' || status === 'claimed' ? pick(FIRST) + ' ' + pick(LAST) : null,
        status === 'returned' || status === 'claimed' ? day(rint(-10, 0)) : null,
        pick(['Stored in lost & found locker', 'Waiting for guest call', 'Logged via app'])]);
  }
}

async function seedExtras(client, hotel, guests, admin, users) {
  const coupons = [
    ['WELCOME10', 'percent', 10, '10% off for first direct booking'],
    ['FESTIVE500', 'flat', 500, 'Flat ₹500 off on 2+ nights'],
    ['WEEKEND15', 'percent', 15, 'Weekend special — 15% off'],
  ];
  for (const [code, type, value, desc] of coupons) {
    await tsql(client,
      `INSERT INTO coupons (hotel_id, code, description, type, value, min_stay, max_uses, used_count, valid_from, valid_to, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
      [hotel.id, code, desc, type, value, type === 'flat' ? 2 : 1, 200, rint(2, 40),
        day(-30), day(90)]);
  }
  const reviews = [
    ['James Carter', 5, 'overall', 'Absolutely wonderful stay. The staff went out of their way for our anniversary. Will return!'],
    ['Priya Sharma', 4, 'rooms', 'Spacious room with a lovely view. Housekeeping was prompt. Breakfast could have more variety.'],
    ['Michael Chen', 5, 'service', 'Front desk arranged an early check-in without hesitation. Smooth from start to finish.'],
    ['Ananya Iyer', 4, 'food', 'Dinner at the restaurant was superb — the butter chicken is a must try.'],
    ['Sophie Turner', 5, 'overall', 'One of the best stays this year. The pool area is stunning at sunset.'],
    ['Rahul Mehta', 3, 'rooms', 'Good value for money. AC was a bit noisy, but everything else was great.'],
    ['Emily Watson', 5, 'cleanliness', 'Immaculately clean. Loved the little turndown chocolates.'],
    ['Vikram Singh', 4, 'location', 'Great location, easy access to the beach. Parking was convenient.'],
  ];
  for (const [name, rating, category, comment] of reviews) {
    await tsql(client,
      `INSERT INTO reviews (hotel_id, guest_name, rating, category, comment, is_published, created_at)
       VALUES ($1,$2,$3,$4,$5,true,$6)`,
      [hotel.id, name, rating, category, comment, `${day(rint(-50, -2))}T${rint(9, 20)}:00:00Z`]);
  }
  const events = [
    ['Sharma Wedding Reception', 'Grand Ballroom', day(12), 220, 'confirmed', 185000],
    ['TechCorp Annual Offsite', 'Conference Hall A', day(25), 80, 'confirmed', 95000],
    ['Gupta 60th Birthday', 'Poolside Lawn', day(6), 120, 'enquiry', 120000],
    ['Startup Mixer', 'Rooftop Lounge', day(-8), 90, 'completed', 75000],
  ];
  for (const [title, venue, d, pax, status, rate] of events) {
    await tsql(client,
      `INSERT INTO event_bookings (hotel_id, title, venue, client_name, client_email, client_phone, start_at, end_at, pax, event_type, status, rate, advance, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'banquet',$10,$11,$12,$13)`,
      [hotel.id, title, venue, pick(FIRST) + ' ' + pick(LAST),
        `events${rint(1, 99)}@example.com`, `+91 ${rint(70000, 99999)}${rint(10000, 99999)}`,
        `${d}T18:00:00Z`, `${d}T23:00:00Z`, pax, status, rate, money(rate * 0.2), admin.id]);
    if (status === 'confirmed' || status === 'completed') {
      await postJournal(client, {
        hotelId: hotel.id, date: d, refType: 'event', refId: null,
        memo: `Event booking · ${title}`, createdBy: admin.id,
        lines: [
          { code: '1000', debit: money(rate * 0.2) },
          { code: '4030', credit: money(rate * 0.2) },
        ],
      });
    }
  }
  // notifications
  const notifs = [
    ['New booking received', 'A booking was created through your website.', 'booking'],
    ['Low stock alert', 'Bath Towel (White) is below reorder level.', 'stock'],
    ['Payment received', '₹4,500 received against folio INV-0007.', 'payment'],
    ['Housekeeping pending', '3 rooms are awaiting turnover.', 'info'],
    ['Weekly report ready', 'Your occupancy held steady at 78% this week.', 'success'],
  ];
  for (const [title, message, type] of notifs) {
    await tsql(client,
      `INSERT INTO notifications (hotel_id, user_id, title, message, type, link, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [hotel.id, admin.id, title, message, type, '/dashboard', `${day(rint(-3, 0))}T${rint(8, 20)}:00:00Z`]);
  }
}

async function seedSales(client, hotel, inventory, users) {
  for (let i = 0; i < 12; i++) {
    const invNo = await docNo(client, hotel.id, 'sale', 'SAL', 4);
    const d = day(rint(-20, 0));
    const lines = [];
    for (let j = 0; j < rint(1, 3); j++) {
      const it = pick(inventory.items);
      const qty = rint(1, 5);
      lines.push({ item: it, qty, rate: it.sell_price || it.cost_price * 1.5 });
    }
    const sub = money(lines.reduce((s, l) => s + l.qty * l.rate, 0));
    const tax = money(sub * 0.18);
    const total = money(sub + tax);
    const sale = (await tsql(
      client,
      `INSERT INTO sales (hotel_id, invoice_no, outlet, customer_name, sub_total, tax, total, paid, payment_method, status, sold_by, sold_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$7,'paid',$8,$9) RETURNING *`,
      [hotel.id, invNo, pick(['reception', 'shop', 'spa', 'laundry', 'minibar']),
        pick(FIRST) + ' ' + pick(LAST), sub, tax, pick(['cash', 'card', 'upi']), pick(users).id,
        `${d}T${rint(9, 21)}:00:00Z`]
    )).rows[0];
    for (const l of lines) {
      await tsql(client,
        `INSERT INTO sale_items (sale_id, hotel_id, item_id, name, qty, rate, amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sale.id, hotel.id, l.item.id, l.item.name, l.qty, l.rate, money(l.qty * l.rate)]);
    }
  }
}

async function seedHotelData(hotel, admin, opts) {
  return tx(async (client) => {
    await ensureHotelModules(hotel.id, client);
    const types = await seedRoomTypes(client, hotel.id, opts.types, opts.prefix || '');
    const rooms = [];
    for (const t of opts.types) {
      rooms.push(...await seedRooms(client, hotel.id, types[t.code], opts.roomCounts[t.code], opts.roomStarts[t.code]));
    }
    const guests = await seedGuests(client, hotel.id, opts.guestCount);

    // bookings across -45 … +45 days
    const statuses = [];
    for (let d = -45; d <= 45; d++) {
      const count = d < 0 ? rint(1, opts.busyness) : rint(0, opts.busyness);
      for (let i = 0; i < count; i++) {
        let status;
        if (d < -1) status = rnd() > 0.12 ? 'checked_out' : pick(['cancelled', 'no_show']);
        else if (d === -1) status = rnd() > 0.4 ? 'checked_out' : 'checked_in';
        else if (d === 0) status = rnd() > 0.5 ? 'checked_in' : 'confirmed';
        else status = rnd() > 0.2 ? 'confirmed' : 'pending';
        statuses.push({ d, status });
      }
    }
    const typeList = Object.values(types);
    const activeBookings = [];
    for (const s of statuses) {
      // keep only a slice so seeds stay fast
      const b = await seedBooking(client, hotel, typeList, rooms, guests, {
        from: day(s.d),
        status: s.status,
        createdBy: admin.id,
        room: rnd() > 0.75 ? pick(rooms) : null,
      });
      if (['checked_in', 'confirmed'].includes(s.status)) activeBookings.push(b);
    }

    // ensure some checked_in right now
    for (let i = 0; i < opts.inHouse; i++) {
      await seedBooking(client, hotel, typeList, rooms, guests, {
        from: day(-rint(0, 3)),
        nights: rint(2, 5),
        status: 'checked_in',
        createdBy: admin.id,
        room: pick(rooms),
        source: pick(['walk_in', 'phone', 'website', 'ota']),
      });
    }
    // arrivals today
    for (let i = 0; i < opts.arrivals; i++) {
      await seedBooking(client, hotel, typeList, rooms, guests, {
        from: day(0),
        nights: rint(1, 3),
        status: 'confirmed',
        createdBy: admin.id,
      });
    }
    // departures today
    for (let i = 0; i < opts.departures; i++) {
      await seedBooking(client, hotel, typeList, rooms, guests, {
        from: day(-rint(1, 2)),
        nights: rint(1, 2),
        status: 'checked_in',
        createdBy: admin.id,
        room: pick(rooms),
      });
    }

    const { tables: tableRows } = await seedRestaurant(client, hotel, [admin]);
    const menu = (await tsql(client, `SELECT * FROM menu_items WHERE hotel_id=$1 AND is_available`, [hotel.id])).rows;
    await seedOrders(client, hotel, menu, tableRows, guests, [admin]);

    const inventory = await seedInventory(client, hotel, [admin]);
    await seedSales(client, hotel, inventory, [admin]);
    const staff = await seedStaff(client, hotel, admin);
    await seedExpenses(client, hotel, admin);
    await seedOps(client, hotel, rooms, [admin, ...staff.users]);
    await seedExtras(client, hotel, guests, admin, [admin, ...staff.users]);

    // mark some rooms occupied to match in-house bookings
    const inHouseNow = (await tsql(
      client,
      `SELECT DISTINCT room_id FROM bookings WHERE hotel_id=$1 AND status='checked_in' AND room_id IS NOT NULL`,
      [hotel.id]
    )).rows;
    for (const row of inHouseNow) {
      await tsql(client, `UPDATE rooms SET status='occupied', housekeeping='dirty' WHERE id=$1`, [row.room_id]);
    }
    const cleaningRooms = (await tsql(
      client, `SELECT id FROM rooms WHERE hotel_id=$1 AND status='available' LIMIT 4`, [hotel.id]
    )).rows;
    for (const row of cleaningRooms) {
      await tsql(client, `UPDATE rooms SET status='cleaning', housekeeping='dirty' WHERE id=$1`, [row.id]);
    }
    return { types, rooms, guests };
  });
}

async function dropAll() {
  const views = await sql(`SELECT table_name AS viewname FROM information_schema.views WHERE table_schema='public'`);
  for (const v of views.rows) await sql(`DROP VIEW IF EXISTS "${v.viewname}" CASCADE`);
  const tables = await sql(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  for (const t of tables.rows) await sql(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
  await sql(`DROP TABLE IF EXISTS schema_migrations CASCADE`);
}

async function main() {
  console.log('Running migrations…');
  await runMigrations();

  const existing = await one(`SELECT count(*)::int AS c FROM hotels`);
  if (existing.c > 0 && !process.argv.includes('--reseed')) {
    console.log('Database already seeded. Use --reseed to wipe and reseed.');
    await pool.end();
    return;
  }
  if (existing.c > 0) {
    console.log('Reseeding — dropping tables…');
    await dropAll();
    await runMigrations();
  }

  console.log('Seeding plans…');
  const starter = await ensurePlan('starter', {
    name: 'Starter', tagline: 'For boutique properties finding their feet',
    price_monthly: 1999, price_yearly: 19990, max_rooms: 20, max_staff: 5, max_orders: 500,
    features: ['Up to 20 rooms', 'Bookings & front desk', 'Restaurant POS', '5 staff logins', 'Email support'],
    highlights: ['Core PMS', 'Direct bookings', 'Basic reports'], sort: 1,
  });
  const growth = await ensurePlan('growth', {
    name: 'Growth', tagline: 'The complete stack for busy hotels',
    price_monthly: 4999, price_yearly: 49990, max_rooms: 80, max_staff: 25, max_orders: 5000,
    popular: true, sort: 2,
    features: ['Up to 80 rooms', 'Everything in Starter', 'Inventory & purchases', 'Accounts & GST reports',
      'AI concierge', '25 staff logins', 'Priority support'],
    highlights: ['AI assistant', 'Accounting suite', 'Advanced reports'],
  });
  await ensurePlan('enterprise', {
    name: 'Enterprise', tagline: 'For chains and resorts that need it all',
    price_monthly: 12999, price_yearly: 129990, max_rooms: 0, max_staff: 0, max_orders: 0,
    sort: 3,
    features: ['Unlimited rooms & staff', 'Multi-property control', 'Custom roles & permissions',
      'Banquet & events module', 'Dedicated success manager', 'API access'],
    highlights: ['Unlimited everything', 'Multi-property', 'White-glove onboarding'],
  });

  console.log('Seeding superadmin…');
  const superHash = await bcrypt.hash('demo123', 10);
  await sql(
    `INSERT INTO users (hotel_id, role, name, email, password_hash, designation, is_active)
     VALUES (NULL,'superadmin','Platform Superadmin','superadmin@hotelhub.io',$1,'Founder',true)
     ON CONFLICT DO NOTHING`,
    [superHash]
  ).catch(async () => {
    await sql(
      `INSERT INTO users (hotel_id, role, name, email, password_hash, designation, is_active)
       VALUES (NULL,'superadmin','Platform Superadmin','superadmin@hotelhub.io',$1,'Founder',true)`,
      [superHash]
    );
  });
  // unique index is on lower(email) expression — ensure row exists
  const superExists = await one(`SELECT id FROM users WHERE lower(email)='superadmin@hotelhub.io'`);
  if (!superExists) {
    await sql(
      `INSERT INTO users (hotel_id, role, name, email, password_hash, designation, is_active)
       VALUES (NULL,'superadmin','Platform Superadmin','superadmin@hotelhub.io',$1,'Founder',true)`,
      [superHash]
    );
  }

  console.log('Seeding The Grand Meridian (Goa)…');
  const h1 = await createHotel({
    slug: 'grand-meridian',
    name: 'The Grand Meridian',
    legal_name: 'Grand Meridian Hospitality Pvt Ltd',
    tagline: 'Where the Arabian Sea meets five-star comfort',
    description: 'A landmark beachfront property in North Goa, The Grand Meridian blends Konkan warmth with contemporary luxury — 52 rooms, two restaurants, a rooftop lounge and a spa overlooking the sea.',
    about: 'Perched on the shores of Candolim, The Grand Meridian has been welcoming guests since 2009. Every room faces either the sea or our tropical gardens, and our kitchen serves everything from forgotten Goan grandmothers’ recipes to modern craft cocktails. Whether you are here for the beach, a wedding, or a workation, we take care of the details.',
    email: 'stay@grandmeridian.example',
    phone: '+91 98200 12345',
    website: 'https://grandmeridian.example',
    address: '123 Candolim Beach Road', city: 'North Goa', state: 'Goa', zip: '403516',
    stars: 5, status: 'active', plan_id: growth.id, planPrice: growth.price_monthly,
    adminName: 'Ramesh Chowdary',
    amenities: ['Free Wi-Fi', 'Infinity Pool', 'Spa & Wellness', 'Beach Access', '24/7 Room Service',
      'Airport Transfer', 'Fitness Centre', 'Banquet Halls', 'Multi-cuisine Restaurant', 'Rooftop Bar',
      'Laundry', 'Business Centre', 'Kids Club', 'EV Charging'],
    gallery: ['/images/site/hero.jpg', '/images/site/pool.jpg', '/images/site/lobby.jpg',
      '/images/site/restaurant.jpg', '/images/site/spa.jpg', '/images/site/event.jpg'],
    policies: {
      check_in: '2:00 PM', check_out: '11:00 AM',
      cancellation: 'Free cancellation up to 48 hours before check-in.',
      children: 'Children of all ages are welcome. Extra beds available on request.',
      pets: 'Pets are not allowed.',
    },
    social: { instagram: '@grandmeridian', facebook: 'grandmeridian', twitter: '@grandmeridian' },
  }, 'admin@demo.hms');

  await seedHotelData(h1.hotel, h1.admin, {
    types: ROOM_TYPES,
    roomCounts: { STD: 12, DLX: 10, TWN: 6, GRD: 6, FAM: 5, EXE: 4, PRE: 2, APT: 4 },
    roomStarts: { STD: 101, DLX: 201, TWN: 301, GRD: 401, FAM: 501, EXE: 601, PRE: 701, APT: 801 },
    guestCount: 30, inHouse: 9, arrivals: 5, departures: 4, busyness: 3,
  });

  console.log('Seeding Azure Beach Resort (Kerala)…');
  const h2 = await createHotel({
    slug: 'azure-beach-resort',
    name: 'Azure Beach Resort',
    legal_name: 'Azure Resorts LLP',
    tagline: 'Barefoot luxury on the Malabar coast',
    description: 'A 28-key boutique resort tucked between coconut groves and the beach at Varkala. Slow mornings, long lunches, sunset yoga.',
    about: 'Azure Beach Resort is a family-run hideaway where the day is paced by the tide. Our twenty-eight cottages sit among coconut palms, a few steps from the cliff beach at Varkala.',
    email: 'hello@azurebeach.example',
    phone: '+91 98470 55521',
    website: 'https://azurebeach.example',
    address: 'Cliff Road, Varkala', city: 'Varkala', state: 'Kerala', zip: '695141',
    stars: 4, status: 'active', plan_id: starter.id, planPrice: starter.price_monthly,
    adminName: 'Meera Nair',
    amenities: ['Free Wi-Fi', 'Beach Access', 'Yoga Deck', 'Multi-cuisine Restaurant', 'Ayurveda Spa',
      'Bonfire Nights', 'Bicycle Rental', 'Laundry'],
    gallery: ['/images/site/beach.jpg', '/images/site/pool.jpg', '/images/site/breakfast.jpg'],
    policies: {
      check_in: '1:00 PM', check_out: '11:00 AM',
      cancellation: 'Free cancellation up to 24 hours before check-in.',
      children: 'Children welcome.', pets: 'Pets welcome in cottage categories only.',
    },
    social: { instagram: '@azurebeachvarkala' },
  }, 'meera@azure.demo.hms');

  await seedHotelData(h2.hotel, h2.admin, {
    types: ROOM_TYPES.slice(0, 5),
    prefix: 'A-',
    roomCounts: { STD: 6, DLX: 6, TWN: 4, GRD: 4, FAM: 4 },
    roomStarts: { STD: 1, DLX: 11, TWN: 21, GRD: 31, FAM: 41 },
    guestCount: 16, inHouse: 4, arrivals: 2, departures: 2, busyness: 2,
  });

  console.log('Seeding Highland Lodge (Manali, pending)…');
  await createHotel({
    slug: 'highland-lodge',
    name: 'Highland Lodge',
    tagline: 'Cosy stays in the Himalayas',
    description: 'A newly listed mountain lodge in Old Manali — wooden interiors, a cafe and river views.',
    email: 'stay@highlandlodge.example',
    phone: '+91 94180 00099',
    address: 'Old Manali Road', city: 'Manali', state: 'Himachal Pradesh', zip: '175131',
    stars: 3, status: 'pending', plan_id: starter.id, planPrice: starter.price_monthly,
    adminName: 'Tenzin Norbu',
    amenities: ['Free Wi-Fi', 'Mountain View', 'Cafe', 'Bonfire', 'Trekking Desk'],
    gallery: ['/images/site/lobby.jpg'],
    policies: { check_in: '2:00 PM', check_out: '11:00 AM' },
    social: {},
  }, 'tenzin@highland.demo.hms');

  // support ticket sample
  const h1admin = await one(`SELECT id FROM users WHERE email='admin@demo.hms'`);
  if (h1admin) {
    const t1 = await one(
      `INSERT INTO support_tickets (hotel_id, subject, category, priority, status, created_by)
       VALUES ($1,'How do I set up seasonal rates?','how_to','medium','in_progress',$2) RETURNING *`,
      [h1.hotel.id, h1admin.id]
    );
    await sql(
      `INSERT INTO ticket_messages (ticket_id, author_id, author_role, message) VALUES ($1,$2,$3,$4)`,
      [t1.id, h1admin.id, 'admin', 'We want to configure Diwali-week pricing across all room types. Where do I do that?']
    );
    await sql(
      `INSERT INTO ticket_messages (ticket_id, author_id, author_role, message) VALUES ($1,$2,$3,$4)`,
      [t1.id, null, 'superadmin', 'Hi! Head to Rooms → Rate Seasons, choose the room type, set the date range and the price for that window. It automatically overrides base and weekend rates. Let me know if you get stuck!']
    );
  }

  const counts = await one(
    `SELECT (SELECT count(*) FROM hotels) AS hotels, (SELECT count(*) FROM users) AS users,
            (SELECT count(*) FROM rooms) AS rooms, (SELECT count(*) FROM bookings) AS bookings,
            (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM inventory_items) AS items,
            (SELECT count(*) FROM staff_profiles) AS staff, (SELECT count(*) FROM journal_entries) AS journals`
  );
  console.log('Seed complete ✔', counts);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
