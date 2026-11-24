// Administration for clients and users. Run from the server folder:
//
//   npm run admin -- create-client "<client name>" <client phone>
//   npm run admin -- list-clients
//   npm run admin -- list-users
//   npm run admin -- set-role <email> <nurse|client>
//
// Nurses create their own accounts in the app, and can also create clients there. Clients are
// not tied to a nurse: any logged-in nurse opens a client by its phone number.
import { authDb, clientsDb, closePools } from '../src/db.js';
import { normalizePhone } from '../src/validation.js';

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
      console.log(`${email} is now a ${role} account. They must log in again, choosing "${role === 'client' ? 'Client' : 'Nurse'}".`);
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
      console.log('Commands: create-client "<name>" <phone> | list-clients | list-users | set-role <email> <nurse|client>');
  }
} catch (err) {
  console.error(`Error: ${err.code === 'ER_DUP_ENTRY' ? 'A client with that phone number already exists.' : err.message}`);
  process.exitCode = 1;
} finally {
  await closePools();
}
