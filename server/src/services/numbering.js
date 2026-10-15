import { one, tsql } from '../db/pool.js';

/**
 * Sequential document numbers per hotel, e.g. INV-0001, PO-0042, ORD-108.
 */
export async function nextDocNo(client, hotelId, kind, pad = 4) {
  const text = `INSERT INTO doc_counters (hotel_id, kind, value) VALUES ($1,$2,1)
       ON CONFLICT (hotel_id, kind) DO UPDATE SET value = doc_counters.value + 1
       RETURNING value`;
  const params = [hotelId, kind];
  const row = client ? (await tsql(client, text, params)).rows[0] : (await one(text, params));
  return String(Number(row.value)).padStart(pad, '0');
}

export async function docNo(client, hotelId, kind, prefix, pad = 4) {
  const n = await nextDocNo(client, hotelId, kind, pad);
  return `${prefix}-${n}`;
}

export async function bookingCode(hotelId) {
  const n = await nextDocNo(null, hotelId, 'booking', 5);
  return `BK${n}`;
}
