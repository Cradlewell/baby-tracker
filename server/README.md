# Cradlewell Bloom API

Backend for login, client verification and the baby monitoring records. The mobile app talks only to this API; it never connects to the database (Supabase) directly.

```
Registration → OTP to own phone → Login (email + password)
  → client's phone number → OTP to client's phone → monitoring dashboard
```

## Requirements

- Node.js 22.13 or newer
- A Supabase project (PostgreSQL). Host the API in the same region as the database: every
  request makes several queries, so the distance between them is what makes the app fast or slow.
- Real email (SMTP) for access and password-reset codes; SMS (Twilio) only if you switch SMS codes on

## Set up

```bash
cd server
npm install
cp .env.example .env        # then edit .env
npm run db:setup            # creates the tables in Supabase (schema "app", and "app_test" for tests)
npm run admin -- create-admin you@example.com
npm start                   # http://localhost:4000
```

In `.env`, set at least:

| Variable | What to put |
|---|---|
| `DATABASE_URL` | Supabase -> Connect. "Direct connection" if the server has IPv6, otherwise the "Session pooler" URI. Write `@` in the password as `%40`. |
| `DATABASE_CA_CERT` | Optional: path to Supabase's CA certificate (Dashboard -> Database -> SSL) so the connection is verified, not only encrypted. |
| `OTP_SECRET` | A long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `EMAIL_PROVIDER`, `SMTP_*` | `smtp` and a real mailbox (required in production). |

`.env` is git-ignored. Never commit it.

## The database

One Supabase database; the tables are in the schema `app` (`sql/schema.sql`). The tests use the
schema `app_test`, so they never touch real data.

| Table | Contents |
|---|---|
| `users` | Name, phone, email, bcrypt password hash, role, verification and approval status |
| `otp_codes` | Keyed hashes of one-time codes, expiry, attempts, when used |
| `sessions` | SHA-256 hashes of login tokens, the family opened, expiry, logout time |
| `crash_reports` | App errors (no user or baby data), kept 90 days |
| `clients` | Families: name, phone, the parent's account, the email for access codes |
| `client_access` | Which nurse may open which family without a new code |
| `client_visits` | One row per nurse, family and day, for the admin dashboard |
| `babies` | Each baby's profile |
| `monitoring_records` | Every feeding, sleep, diaper, medicine, growth, vaccination and health entry |

Row-Level Security is on for every table with no policies, and the schema is not exposed through
Supabase's API, so the `anon` and `authenticated` keys can read nothing. Only this server, using
the database password, reads and writes data. Never put the database password or the
`service_role` key in the app.

## Managing clients

Clients are shared by all nurses, because one nurse serves many clients. After logging in, a nurse enters the client's phone number: an existing client opens, and a new number creates the client (phone number and name) so tracking can start. Clients can also be created and listed from the command line:

```bash
npm run admin -- create-client "Priya Sharma" +919876543210
npm run admin -- list-clients
npm run admin -- list-users
```

## Connecting the app

In development the app calls port 4000 on the computer running `npx expo start`, so a phone on the same Wi‑Fi works with no extra setup (allow Node through the Windows firewall if asked). For other setups, start Expo with the API address:

```bash
EXPO_PUBLIC_API_URL=https://api.example.com npx expo start
```

## Security

- Passwords: bcrypt (12 rounds). OTPs: HMAC-SHA256 with `OTP_SECRET`, bound to the phone number and purpose. Session tokens: only their SHA-256 is stored.
- OTPs expire after 5 minutes, work once, and are locked after 5 wrong attempts. A new code replaces the previous one. Resending waits 30 seconds.
- Rate limits per IP on login, code sending and code checking.
- Every data request is limited to the client opened in that session. Any logged-in nurse can open any client by its phone number, so only give accounts to staff.
- Logout revokes the session on the server; the app also deletes its token and cached client data.
- The app keeps the token in the iOS Keychain / Android Keystore.
- **Production:** serve the API over HTTPS only (for example behind nginx or a cloud load balancer, with `TRUST_PROXY=1`), set `NODE_ENV=production`, and use `SMS_PROVIDER=twilio`.

## Tests

```bash
npm test
```

Runs the whole flow against the databases in `.env`: registration, OTP checks (wrong, expired, reused, locked), login, unregistered and unauthorized client numbers, client OTP, adding/editing/deleting records, isolation between clients, access revocation and logout. SMS go to an in-memory outbox, and everything the test creates is deleted afterwards.
