# Getting started

Run the whole stack on one laptop: MongoDB, the Express API and the React app. This is
the canonical local guide; production setup is in [deployment.md](deployment.md), and
every page/API path is in [routes.md](routes.md).

## 1. Prerequisites

| Tool | Why |
| --- | --- |
| **Node.js 22 or newer** | Backend and frontend. Check with `node -v`. |
| **MongoDB** | Local database for development. Any recent community edition works. |
| **Chrome** | The supported browser for the acoustic and check-in flows. |
| **cloudflared** | Optional: HTTPS tunnel for testing microphone pages on real phones. |

Install dependencies once:

```bash
cd attendance-backend && npm install
cd ../attendance-frontend && npm install
```

## 2. Create the backend configuration

The backend reads `attendance-backend/config/config.env`. It is **gitignored and must
never be committed**. Ask the project owner for the real file, or copy the example:

```bash
cd attendance-backend
cp config/config.env.example config/config.env
```

Minimum local values:

```dotenv
PORT=4000
DB_URI=mongodb://127.0.0.1:27017/attendance
JWT_SECRET=replace-with-a-long-random-local-secret
JWT_EXPIRE=5d
COOKIE_EXPIRE=2
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
CLIENT_URL=http://localhost:3000
TEACHER_EMAILS=2023ugcs059@nitjsr.ac.in
SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com
SUPER_ADMIN_SESSION_HOURS=12
```

The relevant allowlists are exact-match, server-side environment grants:

| Variable | Purpose |
| --- | --- |
| `TEACHER_EMAILS` | College (`@nitjsr.ac.in`) addresses that may create a teacher account on first sign-in. |
| `TEST_STUDENT_EMAILS` | Optional non-college Gmail addresses that may sign in as students without a roster. Rehearsal only. |
| `TEST_TEACHER_EMAILS` | Optional non-college Gmail addresses that may sign in as ordinary teachers. Rehearsal only. |
| `SUPER_ADMIN_EMAILS` | Exact addresses that receive `role: "superadmin"` and can open `/admin`. Gmail is allowed. |
| `SUPER_ADMIN_SESSION_HOURS` | Admin session lifetime, `1`–`72`, default `12`. |

Rules enforced at startup:

- An address may appear in only **one** allowlist. Overlap, malformed addresses, more than
  10 entries in a test list, a Gmail in `TEACHER_EMAILS`, or a college address in a test
  list stops the server.
- `SUPER_ADMIN_EMAILS` must not overlap `TEACHER_EMAILS`, `TEST_STUDENT_EMAILS` or
  `TEST_TEACHER_EMAILS`.
- `ALLOW_TEST_ROSTER_EMAILS=true` is accepted only outside production and requires at
  least one `TEST_STUDENT_EMAILS` entry. Production startup refuses it.
- `DEV_AUTH_ENABLED=true` is refused when `NODE_ENV=production`.

For this project's local setup the owner address is
`12shivanshsingha@gmail.com`, and the college teacher is
`2023ugcs059@nitjsr.ac.in`. The Gmail address belongs only in `SUPER_ADMIN_EMAILS`.

## 3. Start MongoDB

Use any local data directory. The command below is what this project's dev laptop uses;
your MongoDB install path may differ.

```bash
mkdir -p ~/data/db-attendance-dev ~/data/log
mongod --dbpath ~/data/db-attendance-dev \
  --logpath ~/data/log/mongod-attendance.log
```

Leave it running in its own terminal. If `mongod` is already a service on your machine,
just confirm it is listening on `127.0.0.1:27017`.

## 4. Start the backend

```bash
cd attendance-backend
npm run dev        # http://localhost:4000
```

`npm run dev` sets `NODE_ENV=development DEV_AUTH_ENABLED=true`, which enables the
one-click dev personas. `npm start` is the normal/production entry point and does **not**
enable those routes.

Check it:

```bash
curl http://localhost:4000/api/v1/health
# {"success":true,"status":"ok"}
```

Startup must log the MongoDB connection and `MongoDB indexes are ready` before
`server is working`. If an index cannot build, the process refuses to start.

## 5. Start the frontend

```bash
cd attendance-frontend
npm start          # http://localhost:3000
```

Open **http://localhost:3000**. The frontend calls `http://localhost:4000/api/v1` in
normal development; CORS allows `localhost:3000` and `127.0.0.1:3000`.

## 6. Walk through the product

### As a teacher

1. Sign in with Google, or choose the **Demo Teacher** persona in development.
2. Open **Classes** (`/teacher/classes`): create a room, create a class, paste a roster and
   save it. The roster is the list of students allowed to submit evidence.
3. Open **Check-in** (`/teacher/check-in`): choose the class and start a session. The
   screen shows wave 0, a two-minute key and a countdown.
4. Open the transmitter with **Open transmitter**, or inspect live evidence in the
   **Evidence** card. **Advance wave** is enabled only after the current wave has at least
   one accepted proof.
5. When the class is done, **confirm close** on the check-in screen. Then open the
   **Register**, mark students present/absent/excused and **finalise**. Finalising publishes
   the register; the 24-hour query window started when the session closed.

### As a student

1. Sign in with Google, or choose a **Demo Student** persona.
2. The first browser becomes the bound device automatically. A changed browser becomes a
   pending review that a teacher must approve.
3. While a session is live, open **Check-in** (`/student/check-in`), read the retention
   notice, tick consent and tap **Join**. The phone listens for the current wave, decodes
   it locally, signs the proof and shows a recorded-evidence card.
4. Evidence is not attendance. The query window opens when the teacher closes the session
   and lasts 24 hours; the published result appears after the teacher finalises the
   register.

### As a super-admin

1. Put the owner address in `SUPER_ADMIN_EMAILS` and restart the backend.
2. Sign in with that Google account. The server grants `superadmin`; the landing page is
   `/admin`.
3. Use **Admin** for users, classes, sessions, attendance overrides/deletion, queries,
   audit, settings and impersonation.
4. In development the **Demo data** tab can seed a showcase class; **Reset demo data**
   removes demo users and their records but keeps the signed-in admin.

The role is not a UI toggle. Removing the address from `SUPER_ADMIN_EMAILS` blocks new
sign-ins and rejects the existing admin session on its next request.

## 7. Demo data

Demo data is available only when the backend is **not** production and the admin console
is enabled:

- Seed creates a demo teacher, eight students, a room, a class, a timetable and closed
  sessions with attendance and queries.
- Demo accounts use `@demo.invalid`.
- Demo data is excluded from real exports and never replaces the signed-in admin.
- In production the demo tab/metric are hidden and every `/api/v1/admin/demo/*` route
  returns **404**.

## 8. Test accounts and Google sign-in

Development personas (no Google, no password):

- `teacher@dev.invalid`
- `student1@dev.invalid`, `student2@dev.invalid`, `student3@dev.invalid`

They exist only while the backend runs `npm run dev`. They auto-approve devices and never
appear in a production build or API.

Real Google accounts:

- **Teacher:** `2023ugcs059@nitjsr.ac.in` (must be in `TEACHER_EMAILS`).
- **Test student:** the exact Gmail addresses in `TEST_STUDENT_EMAILS`.
- **Test teacher:** the exact Gmail address in `TEST_TEACHER_EMAILS`, if configured.
- **Super-admin:** `12shivanshsingha@gmail.com` in `SUPER_ADMIN_EMAILS`.

A Gmail address has two gates: the server allowlist **and**, while the Google OAuth
consent screen is in **Testing**, the Google Cloud **Test users** list. Leave
`REACT_APP_GOOGLE_HOSTED_DOMAIN` empty so the account chooser can show Gmail; setting it
to `nitjsr.ac.in` filters the chooser to the college domain. The server still decides
who is allowed after Google returns the identity.

With this project's OAuth client, Google sign-in is registered for
`http://localhost:3000` only. It will not work from a LAN IP or a temporary tunnel URL
unless that exact origin is added to the OAuth client. For real-phone signed-in testing,
use the deployed site or register the tunnel origin.

## 9. Test on real phones (audio needs HTTPS)

Microphone access requires HTTPS (or localhost). A temporary Cloudflare tunnel provides
it for the acoustic pages:

```bash
# terminal 1 — React dev server plus same-origin API proxy
cd attendance-frontend && npm run start:shared

# terminal 2
cloudflared tunnel --url http://localhost:3000
```

Open the printed `https://….trycloudflare.com` link on the phones:

- `/acoustic-lab` — speaker/microphone lab, seven probe tones, sample-rate gate.
- `/acoustic-tx` — transmitter. Fill in distance/room/notes **before** transmitting.
- `/acoustic-rx` — receiver. Use **Copy receiver link** on the transmitter so the run ID
  and conditions match on both phones.

The acoustic pages need no sign-in. The signed-in check-in pages do, and Google sign-in will
not work through a quick tunnel unless its origin is registered with Google. For every
phone run, record model, Android/Chrome version, sample rate, distance, frames sent,
frames decoded, margins, room and media volume in `measurements/YYYY-MM-DD/`.

Keep the teacher's phone at the front, 1–10 m from student phones. Do not pass it around.
The 18–19.8 kHz band is near ultrasound: keep runs short, volume moderate, and stop if
anyone reports discomfort.

## 10. Run the tests

```bash
cd attendance-backend
npm test
npm test -- --test-isolation=none        # also run without file isolation

cd ../attendance-frontend
npm run test:proof                       # 15
npm run test:acoustic                    # 51
npm run test:checkin                     # 7
npm run test:studentcheckin              # 9
npm run test:auth                        # 2
CI=true REACT_APP_API_URL=/api/v1 npm run build
```

The current expected counts are **backend 160/160** and **frontend 84/84** across the five
frontend suites. The production build writes `attendance-frontend/build/`; the backend
serves it automatically when that folder exists.

## 11. Next steps

- Every page and API path: [routes.md](routes.md).
- Architecture and flows: [how-it-works.md](how-it-works.md).
- Production deployment: [deployment.md](deployment.md).
- Common failures: [troubleshooting.md](troubleshooting.md).
- Current status and physical measurements: [`progress.md`](../progress.md).
