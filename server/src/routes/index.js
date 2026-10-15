import { Router } from 'express';
import { authenticate, hotelScope } from '../middleware/auth.js';
import authRoutes from './auth.js';
import publicRoutes from './public.js';
import bookingsRoutes from './bookings.js';
import roomsRoutes from './rooms.js';
import frontdeskRoutes from './frontdesk.js';
import guestsRoutes from './guests.js';
import staffRoutes from './staff.js';
import inventoryRoutes from './inventory.js';
import purchasesRoutes from './purchases.js';
import restaurantRoutes from './restaurant.js';
import accountsRoutes from './accounts.js';
import reportsRoutes from './reports.js';
import dashboardRoutes from './dashboard.js';
import aiRoutes from './ai.js';
import miscRoutes from './misc.js';
import platformRoutes from './platform.js';

const r = Router();

r.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'HotelHub API', time: new Date().toISOString() });
});

r.use('/auth', authRoutes);
r.use('/public', publicRoutes);

// ---- platform (superadmin) ----
r.use('/superadmin', platformRoutes);

// ---- tenant-scoped modules ----
const t = Router();
t.use(authenticate);
t.use(hotelScope);

t.use('/dashboard', dashboardRoutes);
t.use('/bookings', bookingsRoutes);
t.use('/rooms', roomsRoutes);
t.use('/frontdesk', frontdeskRoutes);
t.use('/guests', guestsRoutes);
t.use('/staff', staffRoutes);
t.use('/inventory', inventoryRoutes);
t.use('/purchases', purchasesRoutes);
t.use('/restaurant', restaurantRoutes);
t.use('/accounts', accountsRoutes);
t.use('/reports', reportsRoutes);
t.use('/ai', aiRoutes);
t.use('/', miscRoutes);

r.use(t);

export default r;
