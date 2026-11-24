import mysql from 'mysql2/promise';
import { config } from './config.js';

function createPool(dbConfig) {
  const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
  // Store and compare every timestamp in UTC, whatever the server's local time zone is.
  pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  return pool;
}

// Two separate databases, each reached with its own least-privilege MySQL user.
export const authDb = createPool(config.authDb);
export const clientsDb = createPool(config.clientsDb);

export async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export async function closePools() {
  await Promise.all([authDb.end(), clientsDb.end()]);
}
