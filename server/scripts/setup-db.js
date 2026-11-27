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
    { table: 'users', column: 'google_sub', ddl: 'ADD COLUMN google_sub VARCHAR(64) NULL AFTER role' },
    // Existing accounts become 'approved', so nobody already working is locked out.
    { table: 'users', column: 'approval_status', ddl: "ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' AFTER google_sub" },
  ],
  '02_clients.sql': [
    { table: 'clients', column: 'user_id', ddl: 'ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER phone, ADD KEY idx_clients_user (user_id)' },
    { table: 'clients', column: 'email', ddl: 'ADD COLUMN email VARCHAR(255) NULL AFTER user_id' },
    { table: 'clients', column: 'email_trusted', ddl: 'ADD COLUMN email_trusted TINYINT(1) NOT NULL DEFAULT 0 AFTER email' },
    { table: 'client_access', column: 'opened_at', ddl: 'ADD COLUMN opened_at DATETIME NULL AFTER revoked_at' },
  ],
};

// Changes that are safe to run every time (they set a column to its current definition).
const ALWAYS = {
  '02_clients.sql': [
    "ALTER TABLE client_access MODIFY COLUMN expires_at DATETIME NULL COMMENT 'NULL: never expires'",
  ],
  '01_auth.sql': [
    "ALTER TABLE otp_codes MODIFY COLUMN purpose ENUM('registration', 'client_access', 'password_reset') NOT NULL",
    "ALTER TABLE users MODIFY COLUMN role ENUM('nurse', 'client', 'admin') NOT NULL DEFAULT 'nurse'",
    // Password reset codes are sent to an email address, which is longer than a phone number.
    "ALTER TABLE otp_codes MODIFY COLUMN phone VARCHAR(255) NOT NULL COMMENT 'phone number or email address the code was sent to'",
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

// Older databases deleted a user's codes with the user, which reset the daily code limit.
async function keepCodesOfDeletedUsers(database) {
  const [idx] = await admin.query("SHOW INDEX FROM otp_codes WHERE Key_name = 'idx_otp_dest'");
  if (!idx.length) await admin.query('ALTER TABLE otp_codes ADD KEY idx_otp_dest (phone, purpose, created_at)');
  const [[fk]] = await admin.query(
    "SELECT DELETE_RULE AS rule FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = 'fk_otp_user'",
    [database]
  );
  if (fk?.rule === 'SET NULL') return;
  await admin.query('ALTER TABLE otp_codes DROP FOREIGN KEY fk_otp_user');
  await admin.query("ALTER TABLE otp_codes MODIFY COLUMN user_id BIGINT UNSIGNED NULL COMMENT 'user who requested the code; NULL once that account is deleted (kept for the daily limit)'");
  await admin.query('ALTER TABLE otp_codes ADD CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL');
  console.log('  otp_codes are now kept when a user is deleted');
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
  for (const ddl of ALWAYS[db.schema] || []) await admin.query(ddl);
  if (db.schema === '01_auth.sql') await keepCodesOfDeletedUsers(db.name);
  console.log(`✓ ${db.name}: tables ready, user ${db.user}@${appHost} has data access`);
}

await admin.end();
console.log('Database setup complete.');
