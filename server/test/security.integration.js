import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { pool, one, sql } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { csrfProtection, securityHeaders } from '../src/middleware/security.js';
import { errorHandler } from '../src/middleware/error.js';

if (process.env.SECURITY_TEST_DB !== 'isolated') throw new Error('Set SECURITY_TEST_DB=isolated and point DB_* to a disposable database');
process.env.JWT_SECRET = 'test-only-random-secret-for-isolated-security-checks-2026';
await runMigrations();
const { signToken } = await import('../src/middleware/auth.js');
const { default: routes } = await import('../src/routes/index.js');
const { roomTypeAvailable, findFreeRooms } = await import('../src/services/availability.js');
const app = express();
app.use(securityHeaders, csrfProtection(['http://localhost:3200']), express.json(), cookieParser());
app.use('/api', routes);
app.use(errorHandler);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
let passed = 0;
async function request(path, { method = 'GET', body, token, headers = {} } = {}, expected = 200) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'HotelHub', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  passed++;
  return { data, response };
}
const tag = randomUUID();
const hotels = [];
try {
  for (const suffix of ['a','b']) hotels.push(await one("INSERT INTO hotels (slug,name,email,status) VALUES ($1,$2,$3,'active') RETURNING *", [`security-${tag}-${suffix}`, 'Test hotel', `${suffix}@${tag}.test`]));
  const [hotel, other] = hotels;
  const hash = await bcrypt.hash('test-password', 4);
  const tokens = {};
  const users = {};
  for (const role of ['admin','manager','receptionist','housekeeper','staff']) {
    users[role] = await one('INSERT INTO users (hotel_id,role,name,email,password_hash) VALUES ($1,$2,$2,$3,$4) RETURNING *', [hotel.id, role, `${role}@${tag}.test`, hash]);
    tokens[role] = signToken({ sub: users[role].id });
  }
  const foreignUser = await one("INSERT INTO users (hotel_id,role,name,email,password_hash) VALUES ($1,'admin','Other',$2,$3) RETURNING *", [other.id, `other@${tag}.test`, hash]);
  const rt = await one("INSERT INTO room_types (hotel_id,name,code,base_price,total_rooms) VALUES ($1,'Suite','SUITE',100,10) RETURNING *", [hotel.id]);
  const foreignRoom = await one("INSERT INTO rooms (hotel_id,number) VALUES ($1,'999') RETURNING *", [other.id]);
  await request('/users', { method:'POST', token:tokens.staff, body:{ name:'Evil', email:'evil@test', password:'password', role:'admin' } }, 403);
  await request(`/users/${users.staff.id}`, { method:'PUT', token:tokens.admin, body:{ role:'superadmin' } }, 400);
  await request('/staff', { method:'POST', token:tokens.admin, body:{ name:'Evil', email:'evil@test', password:'password', role:'superadmin' } }, 400);
  await request('/staff', { method:'POST', token:tokens.manager, body:{ name:'Evil', email:'evil@test', password:'password' } }, 400);
  await request('/staff', { method:'POST', token:tokens.admin, body:{ name:'Other', user_id:foreignUser.id } }, 400);
  await request('/frontdesk/housekeeping', { method:'POST', token:tokens.housekeeper, body:{ room_id:foreignRoom.id, type:'clean' } }, 400);
  await request('/accounts', { token:tokens.staff }, 403);
  await request('/frontdesk/maintenance', { token:tokens.housekeeper });
  await request('/auth/password', { method:'PUT', token:tokens.admin, body:{ newPassword:'new-password' } }, 400);
  await request(`/users/${users.staff.id}`, { method:'PUT', token:tokens.admin, body:{ password:'reset-password' } });
  const reset = await one('SELECT password_hash FROM users WHERE id=$1',[users.staff.id]);
  assert.ok(await bcrypt.compare('reset-password',reset.password_hash));
  await request('/auth/login', { method:'POST', body:{ email:users.admin.email,password:'test-password' },headers:{ 'X-Requested-With':'' } },403);
  await request('/auth/login', { method:'POST', body:{ email:users.admin.email,password:'test-password' },headers:{ Origin:'https://evil.test' } },403);
  const injection = "O'Brien'); DROP TABLE users; -- <script>alert(1)</script>";
  const booking = await request(`/public/hotels/${hotel.slug}/bookings`, { method:'POST', body:{ roomTypeId:rt.id,from:'2027-01-10',to:'2027-01-12',guest:{name:injection,email:`guest@${tag}.test`} } },201);
  assert.equal(booking.data.booking.guest_name,injection);
  assert.match(booking.data.booking.code,/^BK[0-9A-F]{32}$/);
  const notification = await one("SELECT message FROM notifications WHERE hotel_id=$1 AND title='New website booking' LIMIT 1",[hotel.id]);
  assert.ok(notification.message.includes(injection));
  await request(`/public/bookings/${booking.data.booking.code}`);
  await request('/public/bookings/BK00001',{},404);
  await request(`/public/hotels/${hotel.slug}/bookings`,{method:'POST',body:{roomTypeId:rt.id,from:'2027-02-30',to:'2027-03-05',guestName:'Guest',email:'guest@test'}},400);
  const room = await one("INSERT INTO rooms (hotel_id,room_type_id,number,status) VALUES ($1,$2,'101','out_of_order') RETURNING *",[hotel.id,rt.id]);
  assert.equal((await roomTypeAvailable(hotel.id,rt.id,'2027-02-01','2027-02-03')).minAvailable,0);
  await findFreeRooms(hotel.id,null,'2027-02-01','2027-02-03',booking.data.booking.id);
  const conversation = await one('INSERT INTO ai_conversations (hotel_id,user_id,title) VALUES ($1,$2,$3) RETURNING id',[hotel.id,users.admin.id,'Private']);
  await request(`/ai/conversations/${conversation.id}`,{token:tokens.receptionist},404);
  const directory = await request('/staff', { token: tokens.housekeeper });
  assert.ok(directory.data.items.every((entry) => !('salary' in entry) && !('bank_account' in entry)));
  const task = await request('/frontdesk/housekeeping', { method:'POST', token:tokens.housekeeper, body:{ room_id:room.id, type:'clean', assigned_to:users.housekeeper.id } },201);
  await request(`/frontdesk/housekeeping/${task.data.id}`, {token:signToken({sub:foreignUser.id})},404);
  await request(`/frontdesk/housekeeping/${task.data.id}`, {method:'PUT',token:signToken({sub:foreignUser.id}),body:{notes:'foreign update'}},404);
  await request('/auth/demo-accounts');
  const upload = new FormData();
  upload.append('file', new Blob(['<svg onload="alert(1)"></svg>'], { type:'image/svg+xml' }), 'attack.svg');
  const uploadResponse = await fetch(base+'/uploads',{method:'POST',headers:{Authorization:`Bearer ${tokens.admin}`},body:upload});
  assert.equal(uploadResponse.status,400);
  passed++;
  const { setAuthCookie } = await import('../src/middleware/auth.js');
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV='production';
  setAuthCookie({cookie(name,value,options){ assert.equal(options.secure,true); assert.equal(options.httpOnly,true); }},'test');
  if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previousEnvironment;
  await sql("UPDATE hotels SET status='suspended' WHERE id=$1",[hotel.id]);
  await request('/dashboard',{token:tokens.admin},403);
  console.log(`Passed ${passed} HTTP checks plus password reset, literal SQL payload, random booking code and availability assertions.`);
} finally {
  for (const hotel of hotels) await sql('DELETE FROM hotels WHERE id=$1',[hotel.id]);
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
