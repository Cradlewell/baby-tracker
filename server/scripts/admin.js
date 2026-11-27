// Administration for clients and users. Run from the server folder:
//
//   npm run admin -- create-client "<client name>" <client phone>
//   npm run admin -- list-clients
//   npm run admin -- set-family-email <client phone> <parent email>   (after checking with the parent)
//   npm run admin -- list-users
//   npm run admin -- set-role <email> <nurse|client>
//   npm run admin -- list-access [<client phone>]
//   npm run admin -- revoke-access <nurse email> <client phone>
//   npm run admin -- revoke-access all <client phone>
//   npm run admin -- list-crashes [<how many>]
//   npm run admin -- create-admin <email> ["<name>"]   (prints a new password once)
//   npm run admin -- reset-admin-password <email>       (prints a new password once)
//
// Nurses create their own accounts in the app, and can also create clients there. Clients are
// not tied to a nurse: any logged-in nurse opens a client by its phone number.
import { authDb, clientsDb, closePools } from '../src/db.js';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '../src/validation.js';
import { config } from '../src/config.js';

// A strong password that is easy to type: 4 groups of 4 letters and digits.
function newPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => Array.from({ length: 4 }, () => abc[crypto.randomInt(abc.length)]).join('');
  return `${pick()}-${pick()}-${pick()}-${pick()}`;
}

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'create-client': {
      const [name, rawPhone] = args;
      const phone = normalizePhone(rawPhone || '');
      if (!name || !phone) throw new Error('Usage: create-client "<client name>" <client phone>');
      const [res] = await clientsDb.query('INSERT INTO clients (name, phone) VALUES (?, ?)', [name.trim(), phone]);
      console.log(`Created client #${res.insertId}: ${name.trim()} (${phone})`);
      break;
    }
    case 'list-clients': {
      const [rows] = await clientsDb.query(
        `SELECT c.id, c.name, c.phone,
                (SELECT COUNT(*) FROM babies b WHERE b.client_id = c.id) AS babies,
                c.created_at
           FROM clients c ORDER BY c.id`
      );
      console.table(rows);
      break;
    }
    case 'set-family-email': {
      // The admin confirmed with the parent: Google sign-in with this email may now claim the family.
      const phone = normalizePhone(args[0] || '');
      const email = (args[1] || '').trim().toLowerCase();
      if (!phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Usage: set-family-email <client phone> <parent email>');
      const [res] = await clientsDb.query('UPDATE clients SET email = ?, email_trusted = 1 WHERE phone = ?', [email, phone]);
      if (!res.affectedRows) throw new Error(`No client with phone ${phone}`);
      console.log(`Family ${phone}: email set to ${email}. The parent can now tap "Continue with Google" with it.`);
      break;
    }
    case 'set-role': {
      const [rawEmail, role] = args;
      const email = (rawEmail || '').trim().toLowerCase();
      if (!email || !['nurse', 'client'].includes(role)) throw new Error('Usage: set-role <email> <nurse|client>');
      const [res] = await authDb.query('UPDATE users SET role = ? WHERE email = ?', [role, email]);
      if (!res.affectedRows) throw new Error(`No user with email ${email}`);
      // Their open sessions belong to the old role: end them so the next login uses the new one.
      await authDb.query(
        'UPDATE sessions s JOIN users u ON u.id = s.user_id SET s.revoked_at = UTC_TIMESTAMP() WHERE u.email = ? AND s.revoked_at IS NULL',
        [email]
      );
      console.log(`${email} is now a ${role} account. They must log in again, choosing "${role === 'client' ? 'Parent' : 'Nurse'}".`);
      break;
    }
    case 'list-access': {
      // Which nurses can open which families without a new code.
      const phone = args[0] ? normalizePhone(args[0]) : null;
      if (args[0] && !phone) throw new Error('Usage: list-access [<client phone>]');
      const [rows] = await clientsDb.query(
        `SELECT a.user_id, c.name AS client, c.phone, a.granted_at, a.expires_at, a.revoked_at,
                (a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > UTC_TIMESTAMP())) AS active, a.opened_at
           FROM client_access a JOIN clients c ON c.id = a.client_id
          ${phone ? 'WHERE c.phone = ?' : ''} ORDER BY c.id, a.granted_at`,
        phone ? [phone] : []
      );
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const [users] = ids.length ? await authDb.query('SELECT id, email FROM users WHERE id IN (?)', [ids]) : [[]];
      const email = new Map(users.map((u) => [u.id, u.email]));
      console.table(rows.map(({ user_id, ...r }) => ({ nurse: email.get(user_id) || `#${user_id}`, ...r, active: !!r.active })));
      break;
    }
    case 'revoke-access': {
      // The nurse needs the parent's code again next time; an open session loses the family at once.
      const [who, rawPhone] = args;
      const phone = normalizePhone(rawPhone || '');
      if (!who || !phone) throw new Error('Usage: revoke-access <nurse email | all> <client phone>');
      const [clients] = await clientsDb.query('SELECT id FROM clients WHERE phone = ?', [phone]);
      if (!clients[0]) throw new Error(`No client with phone ${phone}`);
      let sql = 'UPDATE client_access SET revoked_at = UTC_TIMESTAMP() WHERE client_id = ? AND revoked_at IS NULL';
      const params = [clients[0].id];
      if (who !== 'all') {
        const [u] = await authDb.query('SELECT id FROM users WHERE email = ?', [who.trim().toLowerCase()]);
        if (!u[0]) throw new Error(`No user with email ${who}`);
        sql += ' AND user_id = ?';
        params.push(u[0].id);
      }
      const [res] = await clientsDb.query(sql, params);
      console.log(`Revoked ${res.affectedRows} access${res.affectedRows === 1 ? '' : 'es'} to ${phone}.`);
      break;
    }
    case 'list-crashes': {
      // The newest app errors sent by phones (kept 90 days).
      const n = Math.min(Math.max(Number(args[0]) || 20, 1), 500);
      const [rows] = await authDb.query(
        `SELECT id, created_at, is_fatal AS fatal, app_version, platform, screen, LEFT(message, 120) AS message
           FROM crash_reports ORDER BY id DESC LIMIT ?`, [n]
      );
      console.table(rows);
      const [[agg]] = await authDb.query('SELECT COUNT(*) AS last7 FROM crash_reports WHERE created_at > UTC_TIMESTAMP() - INTERVAL 7 DAY');
      console.log(`${agg.last7} error report(s) in the last 7 days. Full details: SELECT * FROM crash_reports WHERE id = <id>;`);
      break;
    }
    case 'create-admin':
    case 'reset-admin-password': {
      const email = (args[0] || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Usage: ${command} <email>${command === 'create-admin' ? ' ["<name>"]' : ''}`);
      const password = newPassword();
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      if (command === 'create-admin') {
        const name = (args[1] || 'Cradlewell Admin').trim();
        // Admins have no phone of their own; a unique placeholder keeps the column's rule.
        const placeholder = `admin:${crypto.randomBytes(6).toString('hex')}`;
        await authDb.query(
          `INSERT INTO users (full_name, phone, email, password_hash, verification_status, verified_at, role)
           VALUES (?, ?, ?, ?, 'verified', UTC_TIMESTAMP(), 'admin')`,
          [name, placeholder, email, hash]
        );
      } else {
        const [res] = await authDb.query("UPDATE users SET password_hash = ? WHERE email = ? AND role = 'admin'", [hash, email]);
        if (!res.affectedRows) throw new Error(`No admin account with email ${email}`);
        await authDb.query('UPDATE sessions s JOIN users u ON u.id = s.user_id SET s.revoked_at = UTC_TIMESTAMP() WHERE u.email = ? AND s.revoked_at IS NULL', [email]);
      }
      console.log(`Admin dashboard login\n  Email:    ${email}\n  Password: ${password}\nKeep this password safe: it is shown only now. Open /admin on the server to log in.`);
      break;
    }
    case 'list-users': {
      const [rows] = await authDb.query(
        'SELECT id, full_name, email, phone, role, verification_status, created_at FROM users ORDER BY id'
      );
      console.table(rows);
      break;
    }
    default:
      console.log('Commands: create-client "<name>" <phone> | list-clients | set-family-email <phone> <email> | list-users | set-role <email> <nurse|client> | list-access [<phone>] | revoke-access <nurse email|all> <phone> | list-crashes [<n>] | create-admin <email> ["<name>"] | reset-admin-password <email>');
  }
} catch (err) {
  console.error(`Error: ${err.code === 'ER_DUP_ENTRY' ? 'A client with that phone number already exists.' : err.message}`);
  process.exitCode = 1;
} finally {
  await closePools();
}
