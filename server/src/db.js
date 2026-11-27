import pg from 'pg';
import { config } from './config.js';
import { dbSsl } from './db-ssl.js';

// One Supabase (PostgreSQL) database, in the schema config.dbSchema ("app"; the tests use
// "app_test"). The queries keep the style they were first written in (for MySQL):
//   `?` placeholders; an array value expands to a list (`IN (?)`), an array of arrays to rows
//   (`VALUES ?`); query() resolves to [rows] for a SELECT, or [{ affectedRows, insertId }] for a
//   write (insertId comes from `RETURNING id`).

pg.types.setTypeParser(20, (v) => Number(v)); // bigint ids and COUNT(*) as numbers (all far below 2^53)
pg.types.setTypeParser(1082, (v) => v);       // DATE as 'YYYY-MM-DD', never shifted by the time zone

function toPg(sql, params = []) {
  const values = [];
  const one = (v) => { values.push(v); return `$${values.length}`; };
  let i = 0;
  const text = sql.replace(/\?/g, () => {
    const v = params[i++];
    if (!Array.isArray(v)) return one(v);
    if (Array.isArray(v[0])) return v.map((row) => `(${row.map(one).join(', ')})`).join(', ');
    return v.map(one).join(', ');
  });
  return { text, values };
}

function runner(target) {
  return {
    async query(sql, params) {
      const { text, values } = toPg(sql, params);
      const r = await target.query(text, values);
      if (r.command === 'SELECT') return [r.rows];
      return [{ affectedRows: r.rowCount, insertId: r.rows[0]?.id, rows: r.rows }];
    },
  };
}

if (!/^[a-z_][a-z0-9_]*$/.test(config.dbSchema)) throw new Error('DB_SCHEMA may only contain a-z, 0-9 and _');
// Every connection starts in the app's schema.
const pool = new pg.Pool({
  connectionString: config.databaseUrl, ssl: dbSsl(), max: 10, options: `-c search_path=${config.dbSchema}`,
});

export const db = runner(pool);
// Two names from when there were two databases; both are now this one database.
export const authDb = db;
export const clientsDb = db;

export async function withTransaction(_db, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(runner(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePools() {
  await pool.end();
}
