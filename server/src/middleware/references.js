import { one } from '../db/pool.js';
import { asyncHandler, badRequest } from '../utils/api.js';

const TABLES = {
  room_id: 'rooms', room_type_id: 'room_types', roomTypeId: 'room_types',
  booking_id: 'bookings', guest_id: 'guests', user_id: 'users', assigned_to: 'users',
  staff_id: 'staff_profiles', shift_id: 'shifts', supplier_id: 'suppliers',
  item_id: 'inventory_items', menu_item_id: 'menu_items', table_id: 'restaurant_tables',
  account_id: 'accounts', invoice_id: 'invoices', order_id: 'orders',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate client-selected relationships before any writes, including nested lines.
// Table names are exclusively from this server-owned allowlist.
export const tenantReferences = asyncHandler(async (req, _res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  const refs = new Map();
  function visit(value, depth = 0) {
    if (!value || typeof value !== 'object') return;
    if (depth > 12) throw badRequest('Request nesting is too deep');
    for (const [key, id] of Object.entries(value)) {
      let table = TABLES[key];
      if (key === 'category_id') table = req.path.startsWith('/restaurant') ? 'menu_categories' : 'inventory_categories';
      if (key === 'parent_id') table = req.path.startsWith('/accounts') ? 'accounts' : 'inventory_categories';
      if (table && id !== null && id !== '') {
        if (typeof id !== 'string' || !UUID.test(id)) throw badRequest(`Invalid ${key}`);
        refs.set(`${table}:${id}`, { table, id, key });
      } else if (typeof id === 'object') visit(id, depth + 1);
    }
  }
  visit(req.body);
  if (refs.size > 200) throw badRequest('Too many references');
  for (const { table, id, key } of refs.values()) {
    const row = await one(`SELECT id FROM ${table} WHERE id=$1 AND hotel_id=$2`, [id, req.hotelId]);
    if (!row) throw badRequest(`Invalid ${key} for this hotel`);
  }
  next();
});
