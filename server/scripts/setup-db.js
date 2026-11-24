// Creates both databases, a separate least-privilege MySQL user for each, and all tables.
// Uses the MySQL admin account (DB_ADMIN_USER / DB_ADMIN_PASSWORD) only for this one-time setup;
// the API itself never uses the admin account. Safe to run again.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing ${name} in server/.env`);
  return v;
};

const admin = await mysql.createConnection({
  host: env('DB_ADMIN_HOST', process.env.AUTH_DB_HOST || '127.0.0.1'),
  port: Number(env('DB_ADMIN_PORT', process.env.AUTH_DB_PORT || 3306)),
  user: env('DB_ADMIN_USER'),
  password: process.env.DB_ADMIN_PASSWORD ?? '',
  multipleStatements: true,
});

// Host the app users may connect from. '%' allows any host; keep 'localhost' when the API
// runs on the same machine as MySQL.
const appHost = process.env.DB_APP_USER_HOST || 'localhost';

// Columns added after the first release. MySQL has no ADD COLUMN IF NOT EXISTS, so check first.
const MIGRATIONS = {
  '01_auth.sql': [
    { table: 'users', column: 'role', ddl: "ADD COLUMN role ENUM('nurse', 'client') NOT NULL DEFAULT 'nurse' AFTER verification_status" },
  ],
  '02_clients.sql': [
    { table: 'clients', column: 'user_id', ddl: 'ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER phone, ADD KEY idx_clients_user (user_id)' },
  ],
};

async function addColumnIfMissing(database, { table, column, ddl }) {
  const [rows] = await admin.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [database, table, column]
  );
  if (!rows.length) {
    await admin.query(`ALTER TABLE \`${table}\` ${ddl}`);
    console.log(`  added ${table}.${column}`);
  }
}

const databases = [
  { name: env('AUTH_DB_NAME', 'cradlewell_auth'), user: env('AUTH_DB_USER'), password: env('AUTH_DB_PASSWORD'), schema: '01_auth.sql' },
  { name: env('CLIENTS_DB_NAME', 'cradlewell_clients'), user: env('CLIENTS_DB_USER'), password: env('CLIENTS_DB_PASSWORD'), schema: '02_clients.sql' },
];

for (const db of databases) {
  if (!/^[A-Za-z0-9_]+$/.test(db.name) || !/^[A-Za-z0-9_]+$/.test(db.user)) {
    throw new Error('Database and user names may only contain letters, digits and underscores');
  }
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await admin.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [db.user, appHost, db.password]);
  await admin.query('ALTER USER ?@? IDENTIFIED BY ?', [db.user, appHost, db.password]);
  // Data access only on its own database: no DDL, no access to the other database.
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${db.name}\`.* TO ?@?`, [db.user, appHost]);

  const sql = await fs.readFile(path.join(here, '..', 'sql', db.schema), 'utf8');
  await admin.changeUser({ database: db.name });
  await admin.query(sql);
  for (const m of MIGRATIONS[db.schema] || []) await addColumnIfMissing(db.name, m);
  console.log(`✓ ${db.name}: tables ready, user ${db.user}@${appHost} has data access`);
}

await admin.end();
console.log('Database setup complete.');
