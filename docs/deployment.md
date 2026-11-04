# Deployment runbook — one service, one URL

This is the production guide for Bio Attend. All account-level setup (GitHub, Render,
MongoDB Atlas, Google Cloud) is done by the project owner. The current tree is built and
tested locally but **not deployed**; production still runs `b7fd8b1`.

Recommended shape:

```text
Browser ──HTTPS──> Render Web Service (Node 24)
                     ├── Express API under /api/v1
                     ├── React production build at /
                     └── MongoDB Atlas (managed database)
```

One origin keeps cookies first-party and prevents frontend/API drift. A split
Vercel + Render layout is possible but is not the recommended path.

Estimated time: 45–70 minutes the first time. Push the repository before starting Render,
because Render deploys from GitHub.

> **Scope:** this deploys a teacher-confirmed attendance product with acoustic evidence.
> Layer 1 is treated as passed by the owner **for build planning only**; the measured
> 5 m/10 m sweep still fails and reverse/muted control remain unmeasured. Do not describe
> the physical gate as measured-passed.

## 0. What you need

| Account / tool | Why | Cost |
| --- | --- | --- |
| GitHub | Render builds from a repository | Free |
| Render | Hosts the Node service and the built React app | Free tier works; Starter avoids sleep |
| MongoDB Atlas | Managed MongoDB | M0 free tier |
| Google Cloud | OAuth Web client for sign-in | Free |
| Node.js 22+ locally | Build and test before pushing | Free |
| Chrome on Android phones | Acoustic testing | — |

## 1. Pre-flight checks

### 1.1 No secrets are tracked

```bash
git status --short
git check-ignore attendance-backend/config/config.env
git ls-files | grep -E '(^|/)config\.env$|(^|/)\.env$'
```

`git check-ignore` must print `attendance-backend/config/config.env`. The last command must
print **nothing**. `config.env` holds the database URL and JWT secret and must stay local.

### 1.2 Run the local gate

```bash
cd attendance-backend
npm test
npm test -- --test-isolation=none         # 160/160 both modes

cd ../attendance-frontend
npm run test:proof                        # 15
npm run test:acoustic                     # 51
npm run test:checkin                      # 7
npm run test:studentcheckin               # 9
npm run test:auth                         # 2

CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=YOUR-GOOGLE-CLIENT-ID.apps.googleusercontent.com \
  REACT_APP_GOOGLE_HOSTED_DOMAIN= \
  npm run build
```

Expected frontend total: **84/84** across the five suites. The build must pass; Render sets
`CI=true`, so warnings are errors.

### 1.3 Commit and push

The owner controls this step. The agent must never push, tag, merge or deploy on its own.

```bash
git add -A
git commit -m "Attendance product and production admin console"
git push origin main
```

## 2. MongoDB Atlas

1. Sign in at <https://cloud.mongodb.com> and create a project.
2. Create an **M0 Free** cluster in the region closest to Render (Mumbai or Singapore for
   India).
3. **Database Access → Add New Database User**
   - Username: `bioattend`
   - Password: long random value saved in a password manager.
   - Role: `Read and write to any database`.
4. **Network Access → Add IP Address**
   - Free Render instances have no fixed outbound IPs. Use
     `Allow access from anywhere` (`0.0.0.0/0`) for the pilot. Tighten this if you move to
     paid static IPs.
5. **Database → Connect → Drivers**, copy the `mongodb+srv://…` string.
6. Replace `<password>`, URL-encode special characters, and keep the database path
   `/attendance`:

```text
mongodb+srv://bioattend:PASSWORD@cluster0.xxxxx.mongodb.net/attendance?retryWrites=true&w=majority
```

That is `DB_URI`. The M0 tier has no automated backups; export occasionally with
`mongodump --uri="…" --out="backups/$(date +%F)"`.

## 3. Render service

1. Sign in at <https://dashboard.render.com>.
2. **New + → Web Service** and connect the GitHub repository.
3. Settings:

| Field | Value |
| --- | --- |
| Name | `bio-attend` (this decides the URL) |
| Region | Singapore (or nearest to Atlas) |
| Branch | `main` |
| Root Directory | empty (repo root) |
| Runtime | `Node` |
| Build Command | `cd attendance-frontend && npm ci && npm run build && cd ../attendance-backend && npm ci` |
| Start Command | `cd attendance-backend && npm start` |
| Health Check Path | `/api/v1/health` |
| Instance Type | Free to try; Starter for a real pilot |

4. Create the service. The first deploy may fail until the environment variables and Google
   client exist.
5. Copy the service URL (`https://….onrender.com`, no trailing slash) and use that exact
   origin below.

### 3.1 Environment variables

Add these under **Environment**:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `DB_URI` | the full Atlas `mongodb+srv://…/attendance?…` string |
| `JWT_SECRET` | output of `openssl rand -base64 48` (32+ characters) |
| `JWT_EXPIRE` | `5d` |
| `COOKIE_EXPIRE` | `7` |
| `GOOGLE_CLIENT_ID` | the OAuth Web client ID |
| `CLIENT_URL` | `https://YOUR-SERVICE.onrender.com` |
| `TEACHER_EMAILS` | comma-separated college teacher addresses, e.g. `2023ugcs059@nitjsr.ac.in`. Removing one does not demote an existing teacher |
| `SUPER_ADMIN_EMAILS` | exact addresses that receive `superadmin`, e.g. `12shivanshsingha@gmail.com`. Must not overlap `TEACHER_EMAILS` or a `TEST_*` list |
| `SUPER_ADMIN_SESSION_HOURS` | `12` (allowed `1`–`72`) |
| `TEST_STUDENT_EMAILS` | empty for a real class; non-college addresses only, max 10 |
| `TEST_TEACHER_EMAILS` | empty for a real class; non-college addresses only, max 10 |
| `REACT_APP_API_URL` | `/api/v1` |
| `REACT_APP_GOOGLE_CLIENT_ID` | same value as `GOOGLE_CLIENT_ID` |
| `REACT_APP_GOOGLE_HOSTED_DOMAIN` | **unset or empty** so the chooser can show approved Gmail accounts. `nitjsr.ac.in` only for a college-only deployment |
| `REACT_APP_VERSION` | `1.9.0` (optional; appears in report JSON) |

Do **not** set `DEV_AUTH_ENABLED` or `ALLOW_TEST_ROSTER_EMAILS=true`. Production startup
refuses both. `ALLOW_TEST_ROSTER_EMAILS` must be absent or `false`.

Notes:

- `PORT` is provided by Render; do not set it.
- `REACT_APP_*` values are baked into the bundle at build time. Changing one requires a
  redeploy, not a restart.
- Export files are generated by PDFKit and ExcelJS; no extra service is needed.
- `JWT_SECRET` must stay stable across restarts and rollbacks. Changing it signs everyone
  out.
- `MONGODB_URI` is accepted as an alias for `DB_URI`; prefer `DB_URI`.
- Split hosting only: list each exact frontend origin in `CLIENT_URLS` (comma separated, no
  trailing slash). The CSRF origin guard rejects unsafe requests from other origins with
  403. Same-origin hosting works automatically; `curl` requests without an `Origin` header
  still work.
- The server sends HSTS in production, `no-store` on every API response, immutable caching
  for hashed `static/` assets, and `no-cache` for `index.html`/deep links.

### 3.2 Deploy

Click **Manual Deploy → Deploy latest commit**. The log must show, in order:

```text
mongodb connected with server:...
MongoDB indexes are ready for N model(s): ...
server is working at http://localhost:...
```

Render assigns the port through `PORT`. If an index cannot build, startup refuses to listen.

## 4. Google Cloud OAuth

1. Go to <https://console.cloud.google.com> and create/select a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - App name: `Bio Attend`; support email: yours.
   - Scopes: `openid`, `email`, `profile`.
   - While the app is in **Testing**, add every Google account that will sign in under
     **Test users**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**.
   - Name: `Bio Attend web`.
   - **Authorized JavaScript origins** (exact, no trailing slash):
     - `https://YOUR-SERVICE.onrender.com`
     - `http://localhost:3000` (local development)
     - optional: `http://localhost:4100` for a local production rehearsal
   - **Authorized redirect URIs**: leave empty. This app uses the Google Identity Services
     credential flow, not a redirect callback.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Set both `GOOGLE_CLIENT_ID` and `REACT_APP_GOOGLE_CLIENT_ID` on Render, then redeploy.

The backend verifies the ID token audience against `GOOGLE_CLIENT_ID`; the frontend renders
the button with `REACT_APP_GOOGLE_CLIENT_ID`. They must be the same client.

## 5. Accounts and access

### Production super-admin

The admin console is **not demo-only**. This project's production owner is a Gmail
account, granted by the environment:

1. On Render:
   - `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com`
   - `SUPER_ADMIN_SESSION_HOURS=12`
   - Keep the address out of `TEACHER_EMAILS`, `TEST_STUDENT_EMAILS` and
     `TEST_TEACHER_EMAILS`; startup rejects overlap.
2. In Google Cloud, while the consent screen is in Testing, add the Gmail as a test user.
3. Leave `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty or unset, then rebuild/redeploy.
4. Sign in with Google. `/api/v1/islogin` should report `role: "superadmin"`, the landing
   target is `/admin`, and the header shows the **production** badge. Demo controls are
   hidden and `/api/v1/admin/demo/*` returns 404.

The grant is re-checked on every authenticated request. Removing the address blocks new
sign-ins and rejects an existing admin session on its next request. Super-admin rows cannot
be demoted or disabled from the admin UI. An empty list logs a warning but does not crash
the service.

### Test accounts (optional, rehearsal only)

Test accounts need three gates:

1. Google Cloud **Test users** while the consent screen is in Testing.
2. `TEST_STUDENT_EMAILS` or `TEST_TEACHER_EMAILS` on Render (exact addresses, non-college
   only, max 10 each, disjoint from every other list).
3. A frontend build with `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty.

A test teacher is an ordinary teacher, not an admin. A test student can sign in and bind a
device, but cannot submit a proof on production unless the teacher can add that Gmail to a
real roster — production refuses `ALLOW_TEST_ROSTER_EMAILS`. Rehearse proof submission
locally with the flag on, or use a real college student account.

The server validates every allowlist at startup. A malformed address, duplicate, overlap,
`@dev.invalid` address, Gmail in `TEACHER_EMAILS`, college address in a test list, or more
than 10 entries in a test list stops the service with a clear error. Test sign-ins and
promotions are logged after the user row is saved.

## 6. Verify the deployment

Replace `BASE` with the Render URL (no trailing slash):

```bash
BASE=https://YOUR-SERVICE.onrender.com

# Health
curl -s "$BASE/api/v1/health"
# {"success":true,"status":"ok"}

# Security headers and no framework banner
curl -sI "$BASE/" | grep -Ei 'x-content-type-options|x-frame-options|permissions-policy|strict-transport-security|x-powered-by'
# nosniff, DENY, microphone=(self), HSTS; no x-powered-by

# API no-store, shell revalidated, hashed asset immutable
curl -sI "$BASE/api/v1/health" | grep -i '^cache-control:'
curl -sI "$BASE/teacher/check-in" | grep -i '^cache-control:'
ASSET=$(curl -s "$BASE/" | grep -o '/static/js/main\.[a-f0-9]*\.js' | head -1)
curl -sI "$BASE$ASSET" | grep -i '^cache-control:'

# Dev routes absent; protected routes still closed
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/auth/dev/accounts"          # 404
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/classes/000000000000000000000000/check-in-sessions" # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' \
  "$BASE/api/v1/check-in-sessions/000000000000000000000000/proofs"                 # 401

# SPA deep links and POST-only logout
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/teacher/check-in"                  # 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/logout"                     # 405
```

Optionally confirm the indexes after first startup:

```bash
mongosh "YOUR_ATLAS_URI" --eval '
  db.checkinproofs.getIndexes().map(i => i.name);
  db.checkinsessions.getIndexes().map(i => i.name);
'
# must include one_proof_per_student_wave, proof_retention_1_day and
# one_active_check_in_per_class
```

Browser walkthrough:

1. Open `BASE`. The login page shows Google and **no dev persona picker**.
2. Sign in as a college teacher in `TEACHER_EMAILS`. Create a room, class and roster; save
   and refresh.
3. Sign in on a second profile as a rostered student. The first device auto-approves; a
   different browser becomes a pending device. Approve it as the teacher.
4. Open `/teacher/check-in`, start a session, confirm the key/countdown, open the
   transmitter and verify the key matches.
5. Have the student open `/student/check-in`, accept consent, join, and record evidence.
   Advance the wave, confirm the key changes and the evidence survives without an
   attendance label. Close the session.
6. Open the register, mark the student present and finalise. Sign back in as the student and
   confirm the result; raise a query and approve it as the teacher if testing that flow.
7. Sign in as the super-admin. Confirm `/admin` opens with the production badge and demo
   controls are hidden.
8. In devtools → Application → Cookies, confirm `token` is `HttpOnly`, `Secure` and
   `SameSite=None`.

For the physical two-phone TX/RX procedure and measurement archive, see
[`measurements/README.md`](../measurements/README.md). Do not use that procedure as proof
of classroom range.

## 7. Operations

### Logs

Render → service → **Logs**. Look for `Refusing to start: …`, MongoDB/index errors and 5xx
responses. Never paste cookies or tokens into logs.

### Deploys and rollback

- Every push to `main` deploys unless auto-deploy is off.
- **Rollback:** Render → **Deploys** → choose the last known-good deploy → **Redeploy**.
  Roll back code first; change environment variables only if the failure is configuration.
- Keep `JWT_SECRET` and `DB_URI` unchanged during a code rollback, or sessions/data appear
  to vanish.
- Mongoose creates collections/indexes on demand; there is no separate migration for a
  normal deploy.

### Free tier

Render free services sleep after about 15 minutes of inactivity; the next request can take
30–60 seconds. Warm the site up a minute before a session, or use Starter.

### Backups

M0 Atlas has no automated backups. Before a pilot:

```bash
mongodump --uri="YOUR_ATLAS_URI" --out="backups/$(date +%F)"
```

Restore with `mongorestore`; keep backups outside the repository.

### Secret rotation

1. Generate a new `JWT_SECRET`.
2. Update it on Render and redeploy. Everyone is signed out and signs in again.
3. To rotate Atlas credentials, change the password in Atlas, update `DB_URI`, and redeploy
   in the same window.

## 8. Split hosting (alternative only)

Use this only if you specifically need a separate frontend host. Cookies become
third-party, which Safari and some Chrome modes block.

1. **Render backend:** root directory `attendance-backend`, build `npm ci`, start
   `npm start`, health `/api/v1/health`. Set `CLIENT_URL` and `CLIENT_URLS` to the exact
   Vercel origin(s), plus the same variables as the single-service setup.
2. **Vercel frontend:** root directory `attendance-frontend`, build `npm run build`, output
   `build`. Set `REACT_APP_API_URL=https://YOUR-BACKEND.onrender.com/api/v1`,
   `REACT_APP_GOOGLE_CLIENT_ID`, and leave `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty for a
   Gmail owner.
3. Add both origins to the Google OAuth client.
4. Leave production cookies as `SameSite=None; Secure`. If sign-in appears to succeed but
   the session does not persist, the browser is blocking third-party cookies; move back to
   the single-service layout.

## 9. Deployment checklist

- [ ] `config.env` is ignored; no secrets in `git ls-files`
- [ ] Backend **160/160** (`npm test` and `--test-isolation=none`)
- [ ] Frontend **84/84** (proof 15, acoustic 51, check-in 7, student check-in 9, auth 2)
- [ ] `CI=true` production build passes locally
- [ ] Code pushed to GitHub `main`
- [ ] Atlas cluster, user and network access created; `DB_URI` includes `/attendance`
- [ ] Render service created with the build/start commands and health path
- [ ] All environment variables set; `DEV_AUTH_ENABLED` and `ALLOW_TEST_ROSTER_EMAILS` absent
- [ ] `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com` on the production backend
- [ ] `SUPER_ADMIN_SESSION_HOURS=12` (or another value in `1`–`72`)
- [ ] The super-admin address is absent from `TEACHER_EMAILS` and both `TEST_*` lists
- [ ] Split hosting only: exact frontend origin in `CLIENT_URLS`
- [ ] Google OAuth Web client created with the Render origin; no redirect URI needed
- [ ] `GOOGLE_CLIENT_ID` and `REACT_APP_GOOGLE_CLIENT_ID` match; redeployed
- [ ] `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty/unset for the Gmail owner
- [ ] `/api/v1/health` returns 200 and `/api/v1/auth/dev/accounts` returns 404
- [ ] Anonymous proof POST returns 401; SPA deep links return 200; GET logout returns 405
- [ ] Startup log shows indexes ready; proof/session indexes exist
- [ ] Teacher sign-in, room/class/roster save survive a refresh
- [ ] Student first device auto-approves; a changed device waits for review
- [ ] Gmail super-admin signs in, `/islogin` reports `superadmin`, `/admin` shows the
      production badge, and demo endpoints return 404
- [ ] TX/RX pages render over HTTPS and two phones complete a run
- [ ] Muted-transmitter control decodes 0 frames
- [ ] Results recorded in `progress.md` with real numbers
- [ ] Rollback deploy identified and noted
