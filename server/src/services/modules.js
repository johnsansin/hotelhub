import { many, sql, tsql } from '../db/pool.js';

export const DEFAULT_MODULES = [
  'bookings',
  'rooms',
  'frontdesk',
  'housekeeping',
  'maintenance',
  'guests',
  'found_lost',
  'staff',
  'inventory',
  'purchases',
  'restaurant',
  'pos',
  'sales',
  'accounts',
  'reports',
  'events',
  'reviews',
  'notifications',
  'ai',
];

export async function ensureHotelModules(hotelId, client = null) {
  if (!hotelId) return;
  const run = client
    ? (q, p) => tsql(client, q, p)
    : (q, p) => sql(q, p);
  for (const module of DEFAULT_MODULES) {
    await run(
      `INSERT INTO hotel_modules (hotel_id, module, is_enabled) VALUES ($1, $2, true)
       ON CONFLICT (hotel_id, module) DO NOTHING`,
      [hotelId, module]
    );
  }
}

export async function enabledModules(hotelId) {
  if (!hotelId) return [];
  const existing = await many(`SELECT count(*)::int AS n FROM hotel_modules WHERE hotel_id=$1`, [hotelId]);
  if (!existing[0].n) await ensureHotelModules(hotelId);
  const rows = await many(
    `SELECT module FROM hotel_modules WHERE hotel_id=$1 AND is_enabled = true ORDER BY module`,
    [hotelId]
  );
  return rows.map((r) => r.module);
}
