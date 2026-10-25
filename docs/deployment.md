# Deployment runbook — one service, one URL

This is the step-by-step guide for putting Bio Attend online. It is written for the
project owner to execute by hand: **all account-level setup (GitHub, Render, MongoDB
Atlas, Google Cloud) is done by you.** The code is ready; nothing below needs another
developer.

The recommended shape is deliberately simple:

```text
Browser ──HTTPS──> Render Web Service (Node 24)
                     ├── Express API under /api/v1
                     ├── React production build at /
                     └── MongoDB Atlas (managed database)
```

One origin means the frontend and API can never drift apart, cookies stay first-party,
and there is only one URL to register with Google. The Vercel + Render split is kept as
an alternative at the end, but it is not the recommended path.

Estimated time: 45–70 minutes the first time. Have the repo pushed **before** starting
Render, because Render deploys from GitHub.

---

## 0. What you need

| Account / tool | Why | Cost |
| --- | --- | --- |
| GitHub | Render builds from a repository | Free |
| Render | Hosts the Node service and the built React app | Free tier works; Starter avoids sleep |
| MongoDB Atlas | Managed MongoDB | M0 free tier |
| Google Cloud | OAuth Web client for college sign-in | Free |
| Node.js 22+ locally | Build and test before pushing | Free |
| Two Android phones with Chrome | The Layer 1 TX/RX test | — |

Commands below assume macOS/zsh and the repository root:

```bash
cd /Users/shivanshsingh/Workspace/projects/CAPSTONE/Attendance
```

---

## 1. Pre-flight checks (do not skip)

### 1.1 Confirm no secrets are tracked

```bash
git status --short
git check-ignore attendance-backend/config/config.env
git ls-files | grep -E '(^|/)config\.env$|(^|/)\.env$'
```

- `git check-ignore` must print `attendance-backend/config/config.env`.
- The last command must print **nothing** (only `*.example` files are allowed).

`config.env` contains the database URL and JWT secret. It must stay local.

### 1.2 Run the full local gate

```bash
# Backend: 72 tests (auth policy, controller, middleware, startup, dev gate, env guard, cookie, rate limit, rosters, binding, session core)
cd attendance-backend && npm test

# Acoustic: 51 tests (codec, lab, worklets, TX/RX link, PCM worklet, pairing)
cd ../attendance-frontend && npm run test:acoustic

# Check-in view: 7 tests (session view helpers and duration formatting)
npm run test:checkin

# Auth routing: 2 tests (signed-in dashboard target)
npm run test:auth

# Production build, same API path the deployed site will use
CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=YOUR-GOOGLE-CLIENT-ID.apps.googleusercontent.com \
  npm run build
```

All five must pass before you push. The build command mirrors Render's build step;
if it fails locally, fix it before deploying.

### 1.3 Commit and push

```bash
cd ..
git add -A
git commit -m "Layer 1 acoustic link, class management, dev auth, deploy readiness"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/bio-attend.git
git push -u origin main
```

Create the empty GitHub repository first (private is fine). If `origin` already exists,
use `git remote set-url origin …` instead of `git remote add`.

---

## 2. MongoDB Atlas

1. Sign in at <https://cloud.mongodb.com>.
2. **Create a project** named `Bio Attend`.
3. **Create a cluster**: M0 Free, provider AWS, region closest to the Render region
   (for India, Mumbai or Singapore; pick the same region family you will use on Render).
4. **Database Access → Add New Database User**
   - Username: `bioattend`
   - Password: generate a long random password and save it in your password manager.
   - Role: `Read and write to any database` (the app uses one database).
5. **Network Access → Add IP Address**
   - For the free Render tier, choose `Allow access from anywhere` (`0.0.0.0/0`).
   - Render's free instances do not have fixed outbound IPs, so an Atlas allowlist of
     Render IPs only works on a paid Render plan with static outbound IPs.
   - This is a normal prototype trade-off: the database still requires the username and
     password. Tighten it before a real pilot if you move to paid static IPs.
6. **Database → Connect → Drivers**, copy the `mongodb+srv://…` string.
7. Replace `<password>` with the real password. If the password contains `@`, `:`, `/`
   or `?`, URL-encode it first (for example `@` becomes `%40`).
8. Make sure the path is `/attendance` before the `?`:

```text
mongodb+srv://bioattend:PASSWORD@cluster0.xxxxx.mongodb.net/attendance?retryWrites=true&w=majority
```

That full string is your `DB_URI`.

> The M0 free tier has no automated backups. For the pilot, export the database
> occasionally with `mongodump --uri="…" --out=backups/$(date +%F)`.

---

## 3. Render service (get the URL first)

You need the public URL before creating the Google OAuth client, so create the service
with the Google values filled in later.

1. Sign in at <https://dashboard.render.com>.
2. **New + → Web Service** → connect the GitHub repo you pushed.
3. Settings:

| Field | Value |
| --- | --- |
| Name | `bio-attend` (this decides the URL) |
| Region | Singapore (or the region nearest your Atlas cluster) |
| Branch | `main` |
| Root Directory | leave **empty** (repo root) |
| Runtime | `Node` |
| Build Command | `cd attendance-frontend && npm ci && npm run build && cd ../attendance-backend && npm ci` |
| Start Command | `cd attendance-backend && npm start` |
| Health Check Path | `/api/v1/health` |
| Instance Type | Free to try; Starter for a real pilot |

4. Create the service. The first deploy may fail or show a Google configuration warning;
   that is expected until the environment variables are added.
5. Copy the service URL from the dashboard. It looks like:

```text
https://bio-attend-xxxx.onrender.com
```

Use that exact origin everywhere below (no trailing slash).

### 3.1 Environment variables

Open **Environment → Add Environment Variable** and add every row. Values are
case-sensitive.

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `DB_URI` | the full Atlas `mongodb+srv://…/attendance?…` string |
| `JWT_SECRET` | output of `openssl rand -base64 48` (64+ characters) |
| `JWT_EXPIRE` | `5d` |
| `COOKIE_EXPIRE` | `7` |
| `GOOGLE_CLIENT_ID` | the Web client ID from step 4 |
| `CLIENT_URL` | `https://YOUR-SERVICE.onrender.com` |
| `TEACHER_EMAILS` | comma-separated college emails provisioned as teachers on first sign-in, e.g. `2023ugcs059@nitjsr.ac.in` (college domain only; removing one does not demote an existing teacher) |
| `TEST_STUDENT_EMAILS` | empty unless you are deliberately testing Gmail student sign-in; non-college addresses only, at most 10 |
| `TEST_TEACHER_EMAILS` | empty unless an owner/test-teacher Gmail needs teacher access; non-college addresses only, at most 10 |
| `REACT_APP_API_URL` | `/api/v1` |
| `REACT_APP_GOOGLE_CLIENT_ID` | the same value as `GOOGLE_CLIENT_ID` |
| `REACT_APP_GOOGLE_HOSTED_DOMAIN` | `nitjsr.ac.in` for college-only builds; an **empty value** while Gmail test accounts are enabled (a chooser hint; deleting it falls back to the college domain) |
| `REACT_APP_VERSION` | `1.9.0` (optional; appears in report JSON) |

**Never set `DEV_AUTH_ENABLED` on Render.** If it is set to `true` with
`NODE_ENV=production`, the server refuses to start on purpose. The dev persona routes
are not mounted in production at all.

Notes:

- `PORT` is provided by Render. Do not set it.
- `REACT_APP_*` values are baked into the React bundle **at build time**. Changing one
  requires a redeploy, not just a restart.
- `JWT_SECRET` must stay stable across restarts and rollbacks. Changing it signs every
  user out. Rotate it if it leaks, or deliberately when you need to invalidate all
  sessions (see the test-account revocation note in section 4).
- The server also accepts `MONGODB_URI` as an alias for `DB_URI`, but use `DB_URI` so
  every document and script agrees.

### 3.2 Deploy

Click **Manual Deploy → Deploy latest commit**. Watch the log for:

```text
server is working at http://localhost:10000
mongodb connected with server:...
```

Render assigns the port through `PORT`, so the number in the log is not always 10000.

---

## 4. Google Cloud OAuth

1. Go to <https://console.cloud.google.com> and create/select a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - App name: `Bio Attend`; support email: your email.
   - Scopes: `openid`, `email`, `profile` (all non-sensitive).
   - While the app is in **Testing**, add every Google account that will sign in under
     **Test users**. Testing-mode refresh tokens expire after 7 days, but this app uses
     the ID-token flow, so a fresh sign-in still works.
   - Publish the app when you are ready for real users. The backend accepts only
     `nitjsr.ac.in` accounts (plus any addresses in `TEST_STUDENT_EMAILS` or
     `TEST_TEACHER_EMAILS`); the `hosted_domain` hint in the button is only a
     convenience, so server enforcement is what actually protects the app.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**.
   - Name: `Bio Attend web`.
   - **Authorized JavaScript origins** (exact, no trailing slash, no path):
     - `https://YOUR-SERVICE.onrender.com`
     - `http://localhost:3000` (keep for local development)
     - optional: `http://localhost:4100` if you rehearse the production server locally
   - **Authorized redirect URIs**: leave empty. Google Identity Services returns the
     credential to the page; this app does not use a redirect callback.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).
5. Go back to Render and set both `GOOGLE_CLIENT_ID` and
   `REACT_APP_GOOGLE_CLIENT_ID` to that value, then **Manual Deploy** again.
6. If you change the Render service name later, update the Google origin to the new
   URL and redeploy.

> The backend verifies the Google ID token audience with `GOOGLE_CLIENT_ID`. The
> frontend uses `REACT_APP_GOOGLE_CLIENT_ID` to render the button. They must be the
> same client, or sign-in fails with an audience/401 error.

### Test accounts without a college Workspace account

Use this to sign in as a teacher or student with an ordinary Gmail address before a
NIT Jamshedpur account is available. **Three gates — the first applies only while the
consent screen is in Testing:**

1. **Google Cloud → OAuth consent screen → Test users**: while the consent screen is in
   **Testing**, add each Gmail address. After the app is published, any Google account can
   authorize; the server allowlists below still decide who gets in.
2. **Render → Environment**: add one or both variables (exact addresses, comma separated,
   no wildcards). An address may appear in only one list, and both test lists accept
   non-college addresses only.
   - `TEST_STUDENT_EMAILS=student.tester@gmail.com` — student role, skips the roster gate.
   - `TEST_TEACHER_EMAILS=owner.tester@gmail.com` — teacher role; use this for the owner
     test login and to open `/teacher/check-in` on production. It is an ordinary teacher,
     not a separate admin role.
3. **Frontend build**: set `REACT_APP_GOOGLE_HOSTED_DOMAIN` to an **empty value** (not
   unset) and rebuild/redeploy. Unset falls back to `nitjsr.ac.in`, and the Google account
   chooser then offers only Workspace accounts, so the Gmail test account never appears.
   An empty string is the only value that omits the `hosted_domain` hint; the server still
   enforces the allowlists. On the Vercel layout this is the frontend variable, not the
   backend.

Then **Manual Deploy** (or let the auto-deploy from the commit run), and sign in normally
with the Google button. There is no separate password form and no separate admin role:
a `TEST_TEACHER_EMAILS` account is an ordinary teacher account; the allowlists are the
only control.

The server validates all three lists at startup. A malformed address, a duplicate, an
`@dev.invalid` address, an overlap between any two lists, more than 10 entries in a test
list, a non-college address in `TEACHER_EMAILS`, or a college address in a test list
stops the service with a clear error. Every test-account sign-in writes
`[auth] test <role> sign-in: <email> user=…` to the Render log after the account row is
saved; a promotion or demotion is marked in the same line.

To revoke test access, remove the address from whichever single test list contains it
(an address may not be in two lists; startup rejects that). The auth middleware re-checks
the lists on every request, so a live session for a removed Gmail test account is rejected
on its next call as well as at the next sign-in. The stored user row keeps its role; delete
it or set `role: "student"` if that matters. Rotating `JWT_SECRET` revokes every session,
including real college accounts, and is not needed for a single test account.

---

## 5. Verification after deploy

Run these from your laptop. Replace `BASE` with your Render URL.

```bash
BASE=https://YOUR-SERVICE.onrender.com
# No trailing slash. With one, "$BASE//api/v1/health" becomes a double-slash
# path that the SPA fallback answers with index.html and HTTP 200.

# 1. Health
curl -s "$BASE/api/v1/health"
# {"success":true,"status":"ok"}

# 2. Security headers and no framework banner
curl -sI "$BASE/" | grep -Ei 'x-content-type-options|x-frame-options|permissions-policy|x-powered-by'
# expect nosniff, DENY, microphone=(self), and NO x-powered-by line

# 3. Dev routes must not exist
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/auth/dev/accounts"
# 404

# 4. The new session route is mounted but still requires a teacher cookie
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/classes/000000000000000000000000/check-in-sessions"
# 401

# 5. The SPA is served for deep links
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/acoustic-tx"
# 200
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/teacher/check-in"
# 200 (the page itself still requires a teacher sign-in in the browser)
```

Then in a browser:

1. Open `BASE`. The login page shows the Google button and **no dev persona picker**
   (that picker only exists in a development build).
2. Sign in with a college teacher account listed in `TEACHER_EMAILS`. The teacher
   dashboard should load, not bounce back to `/login`.
3. Create a room, create a class, paste a roster, preview it, and save it. Refresh the
   page: the class and roster are still there.
4. Sign in on a second browser/profile as a student whose email is on that roster.
   The first device binding is approved automatically.
5. Sign in as the same student from a different browser/profile. That changed device
   should appear as **pending review**.
6. Sign back in as the teacher and approve it from the review queue, then refresh the
   student session; the dashboard should show an approved device.
7. Open `BASE/teacher/check-in`, choose the class, and start a check-in. Confirm the key
   and two-minute countdown appear. Click **Open transmitter**: the key field on
   `BASE/acoustic-tx` must match. Click **Back to check-in**, close the session, and confirm
   it moves into **Session history**. This is UI wiring only; no student proof or
   attendance is recorded yet.
8. Open `BASE/acoustic-tx` on one phone and `BASE/acoustic-rx` on the other and run the
   procedure in section 7. No sign-in is needed for the link test.
9. In browser devtools → Application → Cookies, confirm the `token` cookie is
   `HttpOnly`, `Secure`, and `SameSite=None` (the production setting; it still works on
   a single HTTPS origin).

If step 2 bounces back to login, see Troubleshooting.

---

## 6. Why the cookie settings look like that

Production cookies use:

```text
HttpOnly; Secure; SameSite=None
```

- `HttpOnly` keeps the JWT away from page scripts. The login response deliberately does
  **not** contain the token in its JSON body.
- `Secure` requires HTTPS. Render provides it.
- `SameSite=None` keeps the split Vercel + Render option working. For the recommended
  single-service deployment the cookie is first-party anyway, so this is harmless.

The API accepts credentialed requests only from origins listed in `CLIENT_URL` /
`CLIENT_URLS`; production no longer auto-allows localhost. State-changing endpoints
expect JSON, which browsers cannot send cross-site without a CORS preflight, so the
cookie is not usable from an arbitrary website. Sign-in endpoints are rate limited per
IP (30 Google attempts / 10 minutes per process).

---

## 7. Two-phone TX/RX test procedure

This measures the acoustic link only. It does **not** mark attendance and does not prove
classroom range.

### Setup

- Both phones on current Chrome, both pages served over HTTPS.
- Quiet room, phones 1 m apart, speaker facing the receiver's microphone.
- Transmitter media volume 50–70%. Start lower and raise it if nothing decodes.
- Keep both pages in the foreground; the pages request a screen wake lock where the
  browser supports it.

### Run

1. Phone A: open `/acoustic-tx`. Fill in distance, room and notes (phone models and
   media volume) first; keep the generated 6-character run ID.
2. Tap **Copy receiver link** and open it on phone B. The link carries the run ID and
   those conditions, so both reports agree. Typing the same run ID manually also works.
3. Phone B: confirm **Planned frames** matches the transmitter (default 10), tap
   **Start listening**, and allow the microphone.
4. Phone A: tap **Start transmitting**. Ten frames with 450 ms gaps take about 17 s.
5. Watch the receiver's **Decoded** counter and **Last margin**. Stop listening.
6. Record, for both phones: run ID, decoded/planned, decode rate, last margin, distance,
   room, phone models, Chrome versions, and volume.
7. Copy both reports with **Copy report** and download the JSON files. Keep the pair in
   `measurements/YYYY-MM-DD/`; the protocol and folder layout are in
   `measurements/README.md`.

### Matrix and controls

- Distances: 1 m, 2 m, 5 m and 10 m. The gate needs 1 m, 5 m and 10 m.
- **Test the reverse direction too** (swap TX/RX). The M32 speaker was weak at 19.5 kHz
  in the lab, so one direction passing does not prove the other.
- Use the same settings for every distance in a series (amplitude, repeats, gap, media
  volume), otherwise the numbers are not comparable.
- Three runs per distance, rotating which phone transmits.
- Control: repeat once with the transmitter muted (or in another room). Expected
  decoded count is **0**. A false decode in the control is a serious finding.
- Proposed Layer 1 gate: **≥95% decoded at 1 m, 5 m and 10 m**, both directions, on
  phones students actually use. The forward 1 m and 5 m runs passed 100% on 2026-10-24;
  the gate is not complete until the reverse, control and 10 m runs are recorded in
  `progress.md`.

The teacher's phone stays at the **front**; students are 1-10 m away. If one phone captures
poorly, the teacher may move the phone closer for that wave. Never pass the phone around.

Safety: the 18–19.8 kHz band is near ultrasound. Some people, especially children, may
hear it. Keep runs short, volume moderate, and stop if anyone reports discomfort. Do not
hold the speaker against an ear.

---

## 8. Local production rehearsal (optional but useful)

This runs the exact production server against the real build before Render:

```bash
# 1. Build with the deployed API path
cd attendance-frontend
CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=YOUR-CLIENT-ID.apps.googleusercontent.com \
  npm run build

# 2. Start the production server on a spare port
cd ../attendance-backend
NODE_ENV=production \
JWT_SECRET="$(openssl rand -base64 48)" \
DB_URI="mongodb://127.0.0.1:27017/attendance-prod-rehearsal" \
GOOGLE_CLIENT_ID="YOUR-CLIENT-ID.apps.googleusercontent.com" \
PORT=4100 npm start
```

Open `http://localhost:4100`. The static app and API are real production code, but the
`Secure` session cookie and Google OAuth are designed for HTTPS. Use a tunnel or the
deployed URL if you need to test sign-in end-to-end; dev personas will not appear because
this is a production build. Microphone access on plain `http://localhost` is allowed by
Chrome, so the acoustic pages can still be opened.

Checks:

```bash
curl -s http://localhost:4100/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4100/api/v1/auth/dev/accounts   # 404
```

Also verify the startup guards:

```bash
NODE_ENV=production JWT_SECRET=change-me DB_URI=mongodb://127.0.0.1/x PORT=4100 node index.js
# Refusing to start: JWT_SECRET is missing or still a placeholder.

NODE_ENV=production DEV_AUTH_ENABLED=true \
JWT_SECRET="$(openssl rand -base64 48)" DB_URI=mongodb://127.0.0.1/x PORT=4100 node index.js
# Refusing to start: DEV_AUTH_ENABLED=true is refused when NODE_ENV=production.
```

---

## 9. Operations

### Logs

Render → your service → **Logs**. Look for startup failures (`Refusing to start: …`),
MongoDB connection errors, and 5xx responses. Do not paste cookies or tokens into logs.

### Deploys and rollback

- Every push to `main` triggers a deploy (unless auto-deploy is off).
- **Rollback**: Render → **Deploys** → pick the last known-good deploy → **Redeploy**.
  Roll back the code first; change environment variables only if the failure is
  configuration-related.
- Keep `JWT_SECRET` and `DB_URI` unchanged during a code rollback, or sessions/data
  will appear to vanish.
- Atlas schema changes are not automatic. This prototype only adds collections and
  indexes through Mongoose on demand; there is no migration to run for a normal deploy.

### Free-tier behaviour

Render free services sleep after about 15 minutes of inactivity. The next request can
take 30–60 seconds. For a pilot or demo, use the Starter instance, or open the site a
minute before the session.

### Backups

M0 Atlas has no automatic backups. Before a pilot:

```bash
mongodump --uri="YOUR_ATLAS_URI" --out="backups/$(date +%F)"
```

Restore with `mongorestore`. Store backups outside the repo.

### Secret rotation

1. Generate a new `JWT_SECRET`.
2. Update it in Render.
3. Redeploy. Everyone is signed out; they sign in with Google again.
4. Rotate the Atlas password in Atlas, update `DB_URI`, and redeploy in the same window.

---

## 10. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Build fails with `[eslint] … no-unused-vars` | Render sets `CI=true`, so warnings are errors. Run `CI=true npm run build` locally and fix the warning. |
| `Refusing to start: JWT_SECRET …` | Missing, short or placeholder secret. Set 32+ random characters. |
| `Refusing to start: DEV_AUTH_ENABLED=true …` | Remove `DEV_AUTH_ENABLED` from Render. Dev login is local-only. |
| `Google sign-in is not configured for this build` | `REACT_APP_GOOGLE_CLIENT_ID` was missing at build time. Add it and redeploy (a restart is not enough). |
| `Google sign-in is not configured on the server` (503) | `GOOGLE_CLIENT_ID` is missing on the backend. Add it and redeploy. |
| Google popup: `origin_mismatch` | The page origin is not in the OAuth client's **Authorized JavaScript origins**. Add the exact `https://…onrender.com` origin (no trailing slash) and retry. |
| Login succeeds, then immediately returns to `/login` | Cookie not stored. Check HTTPS, that you are not mixing `http://` and `https://`, and that the frontend calls `/api/v1` on the same origin. Inspect the `token` cookie flags. |
| `401` on every API call after a Render redeploy | `JWT_SECRET` changed. Restore the previous value; users must sign in again. |
| MongoDB connection timeout | Atlas Network Access does not include Render, or the password is not URL-encoded, or the URI lacks `/attendance`. |
| `429 Too many … attempts` | Sign-in rate limit. Wait ten minutes; do not loop retries. |
| Teacher sees no classes | Classes are scoped to the signed-in teacher. Create them with that account. |
| Student is rejected at sign-in | Their email is not on an active roster and is not in `TEST_STUDENT_EMAILS`. Add a college account to the roster, or for a Gmail test account add it to `TEST_STUDENT_EMAILS`; for the chooser to show it, also set `REACT_APP_GOOGLE_HOSTED_DOMAIN` to an empty value and rebuild. |
| Google account chooser does not list the Gmail test account | `REACT_APP_GOOGLE_HOSTED_DOMAIN` is still `nitjsr.ac.in`, or it was deleted and the code fell back to that default. Set it to an **empty value** and redeploy; the value is baked in at build time. |
| Test teacher still gets student access | The address is in `TEST_STUDENT_EMAILS`, not `TEST_TEACHER_EMAILS`. Move it to the teacher list and redeploy; startup rejects an address that is in both lists. |
| Removed test account still has access | Removing it from `TEST_*_EMAILS` blocks new sign-ins and the middleware rejects the old session on its next request. If it still appears, delete/demote the user row or rotate `JWT_SECRET`. |
| Server refuses to start with a `*_EMAILS` error | A list has a malformed, duplicate or `@dev.invalid` address, an overlap, a college address in a test list, a Gmail in `TEACHER_EMAILS`, or more than 10 entries in a test list. Fix the Render variable and redeploy. |
| Microphone does not start | Needs HTTPS (or localhost), Chrome, and microphone permission. Close other audio apps; keep the tab visible. |
| Receiver decodes 0 frames at 1 m | Raise transmitter volume, check the run IDs match, confirm both pages are the same deployment, retry at 0.5 m. Use the lab to confirm the phone can hear 18–19.8 kHz. |
| Render free instance is slow on first load | Cold start after sleep. Use Starter for a session, or warm it up first. |

---

## 11. Alternative: Vercel frontend + Render backend

Only use this if you specifically need separate hosting. It is more fragile because the
session cookie becomes third-party, which Safari and some Chrome modes block.

1. **Render backend**
   - Root Directory: `attendance-backend`
   - Build: `npm ci`
   - Start: `npm start`
   - Env: `NODE_ENV=production`, `NODE_VERSION=24`, `DB_URI`, `JWT_SECRET`,
     `JWT_EXPIRE=5d`, `COOKIE_EXPIRE=7`, `GOOGLE_CLIENT_ID`,
     `CLIENT_URL=https://YOUR-APP.vercel.app`,
     `CLIENT_URLS=https://YOUR-APP.vercel.app`, `TEACHER_EMAILS`,
     `TEST_STUDENT_EMAILS`, `TEST_TEACHER_EMAILS`.
2. **Vercel frontend**
   - Root Directory: `attendance-frontend`
   - Framework preset: Create React App
   - Build: `npm run build`; output: `build`
   - Env: `REACT_APP_API_URL=https://YOUR-BACKEND.onrender.com/api/v1`,
     `REACT_APP_GOOGLE_CLIENT_ID`, `REACT_APP_GOOGLE_HOSTED_DOMAIN` (empty for Gmail
     test accounts; otherwise `nitjsr.ac.in`).
3. **Google origins**: add both `https://YOUR-APP.vercel.app` and
   `https://YOUR-BACKEND.onrender.com` (the second is only needed if you open the API
   origin directly).
4. **Cookies**: leave the production defaults (`SameSite=None; Secure`). If sign-in
   appears to succeed but the session does not persist, the browser is blocking
   third-party cookies; move to the single-service layout.
5. CORS: the Render backend only allows the exact `CLIENT_URL`/`CLIENT_URLS` origins,
   and production no longer auto-allows localhost.

---

## 12. Deployment checklist

Copy this into your notes and tick each line.

- [ ] `config.env` is ignored; no secrets in `git ls-files`
- [ ] Backend tests pass (72/72)
- [ ] Acoustic tests pass (51/51)
- [ ] `CI=true` production build passes locally
- [ ] Code pushed to GitHub `main`
- [ ] Atlas cluster, user and network access created
- [ ] Render Web Service created with build/start commands and health path
- [ ] All Render environment variables set; `DEV_AUTH_ENABLED` absent
- [ ] Rehearsal/testing only: `TEST_STUDENT_EMAILS` / `TEST_TEACHER_EMAILS` set, test users added
      while the consent screen is in Testing, and `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty
      in the rebuilt frontend
- [ ] When Gmail test access is no longer needed: restore
      `REACT_APP_GOOGLE_HOSTED_DOMAIN=nitjsr.ac.in`, empty both `TEST_*` lists, and
      rebuild/redeploy (keep `TEACHER_EMAILS` for real college teachers)
- [ ] Google OAuth Web client created with the Render origin
- [ ] `GOOGLE_CLIENT_ID` and `REACT_APP_GOOGLE_CLIENT_ID` match; redeployed
- [ ] `/api/v1/health` returns 200
- [ ] `/api/v1/auth/dev/accounts` returns 404
- [ ] Teacher Google sign-in works on the deployed URL
- [ ] Test teacher (if configured) signs in and opens `/teacher/check-in`
- [ ] Room, class, roster preview/save work and survive a refresh
- [ ] Student sign-in auto-approves the first device; a changed device appears as pending
      for teacher review
- [ ] TX/RX pages render over HTTPS and two phones complete a run
- [ ] Control run with the transmitter muted decodes 0 frames
- [ ] Results recorded in `progress.md` with real numbers
- [ ] Rollback deploy identified and noted
