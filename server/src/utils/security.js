import { badRequest } from './api.js';

export const HOTEL_ROLES = ['admin', 'manager', 'receptionist', 'housekeeper', 'accountant', 'storekeeper', 'restaurant', 'staff'];
export function validateUserRole(role) {
  if (!HOTEL_ROLES.includes(role)) throw badRequest('Invalid hotel role');
}
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
    throw badRequest('Password must be at least 6 characters and at most 72 UTF-8 bytes');
  }
}
