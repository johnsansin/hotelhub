import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, sql } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'migrations');

export async function runMigrations({ fresh = false } = {}) {
  if (fresh) {
    console.log('Dropping all tables...');
    await sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await sql('GRANT ALL ON SCHEMA public TO public;');
  }

  await sql(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await sql('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rows.length) continue;
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(body);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      await client.query('COMMIT');
      console.log(`  applied ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`  FAILED ${file}: ${e.message}`);
      throw e;
    } finally {
      client.release();
    }
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMigrations({ fresh: process.argv.includes('--fresh') })
    .then(() => { console.log('Migrations complete.'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
