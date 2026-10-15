import { canAccess } from './auth.js';
import { forbidden } from '../utils/api.js';

export function moduleAccess(req, _res, next) {
  const [first, second] = req.path.split('/').filter(Boolean);
  let module = first;
  if (first === 'frontdesk' && ['housekeeping', 'maintenance', 'found-lost'].includes(second)) {
    module = second === 'found-lost' ? 'found_lost' : second;
  }
  if (first === 'staff' && !second && req.method === 'GET' && ['housekeeping', 'maintenance'].some((m) => canAccess(req.user.role, m))) return next();
  if (first === 'users') {
    if (req.method !== 'GET' && !['admin', 'superadmin'].includes(req.user.role)) return next(forbidden());
    // Staff pickers are used by housekeeping, maintenance and HR screens.
    if (req.method === 'GET' && ['staff', 'housekeeping', 'maintenance', 'settings'].some((m) => canAccess(req.user.role, m))) return next();
    module = 'settings';
  }
  if (first === 'invoices') {
    if (['accounts', 'bookings'].some((m) => canAccess(req.user.role, m))) return next();
    return next(forbidden());
  }
  if (first === 'coupons' || first === 'tickets') module = 'settings';
  if (first === 'uploads') return next();
  if (!canAccess(req.user.role, module)) return next(forbidden('You do not have permission for this module'));
  next();
}
