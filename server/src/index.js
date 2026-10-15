import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 5000);
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:3200').split(',');

app.set('trust proxy', 1);
app.use(cors({ origin: ORIGINS, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), { maxAge: '7d' }));

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  if (process.env.AUTO_MIGRATE !== 'false') {
    try {
      await runMigrations();
    } catch (e) {
      console.error('Migration failed:', e.message);
    }
  }
  app.listen(PORT, () => {
    console.log(`HotelHub API listening on http://localhost:${PORT}`);
  });
}

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
start();

export default app;
