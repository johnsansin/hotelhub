import jwt from 'jsonwebtoken';
import { one } from '../db/pool.js';
import { unauthorized, forbidden, ApiError } from '../utils/api.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32 || /^(dev-secret|change-me)/i.test(SECRET)) {
  throw new Error('JWT_SECRET must be a unique random secret of at least 32 characters');
}
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

export const COOKIE_NAME = 'hms_token';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function extract(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  return null;
}

export async function authenticate(req, _res, next) {
  try {
    const token = extract(req);
    if (!token) throw unauthorized('Authentication required');
    let decoded;
    try {
      decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    } catch {
      throw unauthorized('Session expired, please sign in again');
    }
    const user = await one(
      `SELECT u.id, u.hotel_id, u.role, u.name, u.email, u.phone, u.avatar_url,
              u.designation, u.is_active, h.name AS hotel_name, h.slug AS hotel_slug,
              h.status AS hotel_status, h.currency_symbol, h.timezone, h.check_in_time, h.check_out_time
         FROM users u LEFT JOIN hotels h ON h.id = u.hotel_id
        WHERE u.id = $1`,
      [decoded.sub]
    );
    if (!user) throw unauthorized('Account no longer exists');
    if (!user.is_active) throw forbidden('Your account has been deactivated');
    if (user.hotel_status === 'suspended' && user.role !== 'superadmin') throw forbidden('This hotel account is suspended');
    req.user = user;
    req.isSuper = user.role === 'superadmin';
    next();
  } catch (e) {
    next(e);
  }
}

export function optionalAuth(req, _res, next) {
  const token = extract(req);
  if (!token) return next();
  return authenticate(req, _res, next).catch(() => next());
}

/** require hotel context: superadmin must pass ?hotelId=, staff use their own */
export function hotelScope(req, _res, next) {
  const q = req.query.hotelId || req.body?.hotelId || req.headers['x-hotel-id'];
  if (req.isSuper) {
    const hid = q || req.user.hotel_id;
    if (!hid) return next(new ApiError(400, 'hotelId is required for superadmin', 'hotel_required'));
    req.hotelId = hid;
    req.scopeAll = !q && !req.headers['x-hotel-id'];
  } else {
    if (!req.user.hotel_id) return next(forbidden('This account is not linked to a hotel'));
    req.hotelId = req.user.hotel_id;
  }
  next();
}

export function permit(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'superadmin') return next();
    if (!roles.includes(req.user.role)) return next(forbidden('You do not have permission for this action'));
    next();
  };
}

/** module-level access map used by the sidebar + API guards */
export const ROLE_ACCESS = {
  superadmin: ['*'],
  admin: ['*'],
  manager: ['dashboard', 'bookings', 'frontdesk', 'rooms', 'guests', 'restaurant', 'pos',
    'inventory', 'purchases', 'accounts', 'staff', 'reports', 'found_lost', 'housekeeping',
    'maintenance', 'events', 'reviews', 'settings', 'ai', 'notifications'],
  receptionist: ['dashboard', 'bookings', 'frontdesk', 'rooms', 'guests', 'restaurant', 'pos',
    'found_lost', 'housekeeping', 'events', 'notifications', 'ai'],
  housekeeper: ['dashboard', 'frontdesk', 'rooms', 'housekeeping', 'maintenance', 'notifications'],
  accountant: ['dashboard', 'accounts', 'purchases', 'inventory', 'reports', 'staff', 'notifications'],
  storekeeper: ['dashboard', 'inventory', 'purchases', 'reports', 'notifications'],
  restaurant: ['dashboard', 'restaurant', 'pos', 'inventory', 'notifications'],
  staff: ['dashboard', 'notifications'],
};

export function canAccess(role, module) {
  const list = ROLE_ACCESS[role] || [];
  return list.includes('*') || list.includes(module);
}
