import test from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, setClause } from '../src/utils/api.js';
import { validateUserRole, validatePassword } from '../src/utils/security.js';
import { csrfProtection, rateLimit, uploadHeaders } from '../src/middleware/security.js';

function run(middleware, req) {
  let error;
  middleware(req, { set() {} }, (err) => { error = err; });
  return error;
}
test('SQL field names cannot inject identifiers; values remain parameters', () => {
  assert.throws(() => setClause({ 'name"=NULL;--': 'x' }), /Invalid field/);
  assert.deepEqual(setClause({ name: "O'Brien'; DROP TABLE users;--" }), {
    clause: '"name"=$1', vals: ["O'Brien'; DROP TABLE users;--"],
  });
});
test('date ranges reject invalid, reversed and excessive dates', () => {
  for (const dates of [['2026-02-30','2026-03-02'], ['2026-10-02','2026-10-01'], ['2026-01-01','2030-01-01']]) {
    assert.throws(() => daysBetween(...dates));
  }
  assert.equal(daysBetween('2026-10-01','2026-10-03'), 2);
});
test('tenant accounts cannot have a platform role or truncated bcrypt passwords', () => {
  assert.throws(() => validateUserRole('superadmin'));
  assert.throws(() => validatePassword('a'.repeat(73)));
  assert.throws(() => validatePassword('😀'.repeat(20)));
  validateUserRole('receptionist');
  validatePassword('valid-password');
});
test('CSRF blocks forms and hostile origins but permits the application', () => {
  const guard = csrfProtection(['https://hotel.test']);
  assert.equal(run(guard, { method: 'POST', headers: {} }).status, 403);
  assert.equal(run(guard, { method: 'POST', headers: { 'x-requested-with': 'HotelHub', origin: 'https://evil.test' } }).status, 403);
  assert.equal(run(guard, { method: 'POST', headers: { 'x-requested-with': 'HotelHub', origin: 'https://hotel.test' } }), undefined);
});
test('rate limiter blocks repeated requests and separates clients', () => {
  const limit = rateLimit({ limit: 2 });
  const req = { ip: '127.0.0.1' };
  assert.equal(run(limit, req), undefined);
  assert.equal(run(limit, req), undefined);
  assert.equal(run(limit, req).status, 429);
  assert.equal(run(limit, { ip: '127.0.0.2' }), undefined);
});
test('uploads cannot execute scripts even for pre-existing SVG files', () => {
  const headers = {};
  const res = { set(k, v) { headers[k] = v; } };
  uploadHeaders(res, '/uploads/old.svg');
  assert.match(headers['Content-Security-Policy'], /sandbox; default-src 'none'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  uploadHeaders(res, '/uploads/file.pdf');
  assert.equal(headers['Content-Disposition'], 'attachment');
});
