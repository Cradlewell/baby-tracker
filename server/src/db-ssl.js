import fs from 'node:fs';

// TLS for the Supabase connection. Supabase signs its certificates with its own authority: with
// DATABASE_CA_CERT pointing to Supabase's CA file (Dashboard -> Database -> SSL), the server's
// identity is verified. Without it the connection is still encrypted, but not verified.
export function dbSsl() {
  const ca = process.env.DATABASE_CA_CERT;
  return ca ? { ca: fs.readFileSync(ca, 'utf8') } : { rejectUnauthorized: false };
}
