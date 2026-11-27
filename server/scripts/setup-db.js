// Creates the Cradlewell tables in Supabase (PostgreSQL) from sql/schema.sql: in the schema "app"
// for the app (DB_SCHEMA) and in "app_test" for the tests. Uses DATABASE_URL. Safe to run again.
import 'dotenv/config';
import fs from 'node:fs/promises';
import pg from 'pg';
import { dbSsl } from '../src/db-ssl.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Missing DATABASE_URL in server/.env');
const schemas = [...new Set([process.env.DB_SCHEMA || 'app', 'app_test'])];
const sql = await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');

const db = new pg.Client({ connectionString: url, ssl: dbSsl() });
await db.connect();
try {
  for (const schema of schemas) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid schema name: ${schema}`);
    await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    // Only the server's own login may use it; Supabase's API roles get nothing.
    await db.query(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`);
    for (const role of ['anon', 'authenticated']) {
      const { rowCount } = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      if (rowCount) await db.query(`REVOKE ALL ON SCHEMA ${schema} FROM ${role}; REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`);
    }
    await db.query(`SET search_path TO ${schema}`);
    await db.query(sql);
    console.log(`✓ ${schema}: tables ready (RLS on, no public access)`);
  }
} finally {
  await db.end();
}
console.log('Database setup complete.');
