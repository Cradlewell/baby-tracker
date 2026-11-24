# Cradlewell Bloom API

Backend for login, client verification and the baby monitoring records. The mobile app talks only to this API; it never connects to MySQL.

```
Registration → OTP to own phone → Login (email + password)
  → client's phone number → OTP to client's phone → monitoring dashboard
```

## Requirements

- Node.js 22.13 or newer
- MySQL 8.0 or newer
- For real SMS: a Twilio account (in development, codes are printed in the terminal instead)

## Set up

```bash
cd server
npm install
cp .env.example .env        # then edit .env
npm run db:setup            # creates both databases, their users and tables
npm start                   # http://localhost:4000
```

In `.env`, set at least:

| Variable | What to put |
|---|---|
| `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | Your MySQL root (or admin) login. Used only by `npm run db:setup`. |
| `AUTH_DB_PASSWORD`, `CLIENTS_DB_PASSWORD` | Two new, different, strong passwords. `db:setup` creates the users with them. |
| `OTP_SECRET` | A long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SMS_PROVIDER` | `console` for development, `twilio` for real SMS (required in production). |
| `TWILIO_*` | Your Twilio Account SID, Auth Token and sending number. |

`.env` is git-ignored. Never commit it.

## The two databases

**`cradlewell_auth`** (Database 1: authentication)

| Table | Contents |
|---|---|
| `users` | User ID, full name, phone, email, bcrypt password hash, verification status, created/updated at |
| `otp_codes` | Keyed hashes of one-time codes, expiry, attempts, when used |
| `sessions` | SHA-256 hashes of login tokens, the verified client, expiry, logout time |

**`cradlewell_clients`** (Database 2: clients and baby monitoring)

| Table | Contents |
|---|---|
| `clients` | Client ID, client name, client phone, created/updated at |
| `babies` | Baby ID, client ID, name and full baby details |
| `monitoring_records` | Every feeding, sleep, diaper, medicine, growth and vaccination record |

Each database has its own MySQL user with data access (`SELECT/INSERT/UPDATE/DELETE`) to that database only.

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
