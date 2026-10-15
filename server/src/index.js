import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { securityHeaders, csrfProtection, rateLimit, uploadHeaders } from './middleware/security.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 5000);
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:3200').split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false);
app.use(securityHeaders);
app.use(cors({ origin: ORIGINS, credentials: true }));
app.use('/api', csrfProtection(ORIGINS));
app.use('/api/auth/login', rateLimit());
app.use('/api/auth/register', rateLimit({ limit: 5 }));
app.use('/api/public', rateLimit({ limit: 120 }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d', setHeaders: uploadHeaders }));


async function start() {
  if (process.env.AUTO_MIGRATE !== 'false') {
    try {
      await runMigrations();
    } catch (e) {
      console.error('Migration failed:', e.message);
      await pool.end();
      process.exitCode = 1;
      return;
    }
  }
  const { default: apiRouter } = await import('./routes/index.js');
  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  app.listen(PORT, () => {
    console.log(`HotelHub API listening on http://localhost:${PORT}`);
  });
}

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
start().catch(async (err) => {
  console.error('Startup failed:', err.message);
  await pool.end();
  process.exitCode = 1;
});

export default app;
