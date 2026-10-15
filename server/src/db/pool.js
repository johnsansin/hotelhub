import 'dotenv/config';
import pg from 'pg';

// keep DATE columns as 'YYYY-MM-DD' strings (avoids timezone-shift bugs)
pg.types.setTypeParser(1082, (v) => v);
// keep NUMERIC as string? -> convert to number for JSON friendliness
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// bigint
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));


const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '5433',
  DB_NAME = 'hms',
  DB_USER = 'hms',
  DB_PASSWORD = 'hms_secret',
} = process.env;

export const pool = new pg.Pool({
  host: DB_HOST,
  port: Number(DB_PORT),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function sql(text, params = []) {
  return pool.query(text, params);
}

export async function one(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

export async function many(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows;
}

/** Run fn inside a dedicated client transaction */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function tsql(client, text, params = []) {
  return client.query(text, params);
}
