# Start here — the reading order

Bio Attend has a short set of guides and one very long complete guide. Do not read them
alphabetically, and do not start with the book or the deployed test plan. Read in the order
below: first the problem and the honest status, then run it, then the product map, then the
tests, then the code.

This page is for four kinds of reader:

- someone who wants the idea in plain words;
- someone who wants to run the project on one laptop;
- someone who wants to test the deployed setup with phones and laptops;
- someone who wants to understand the whole codebase.

## The short answer

| If you have… | Read this, in this order |
| --- | --- |
| **15 minutes** | [`README.md`](../README.md) → [`what-is-this.md`](what-is-this.md) |
| **1 hour** | The 15-minute path → [`how-it-works.md`](how-it-works.md) |
| **Half a day** | The 1-hour path → [`getting-started.md`](getting-started.md) → [`routes.md`](routes.md) |
| **A full day, with a team** | The half-day path → [`testing-plan.md`](testing-plan.md), read in the three passes below |
| **A few days** | Everything above → [`book/bio-attend-complete-guide.md`](book/bio-attend-complete-guide.md) → the code order in §6 |

## 1. Understand the idea (15–20 minutes)

Read these in order. Do not open the code yet.

1. [`README.md`](../README.md) — the **Why**, **How it works**, **What is built** and **Status**
   sections. This is the one-page pitch.
2. [`what-is-this.md`](what-is-this.md) — the problem, the idea, why a recorded sound is hard
   to fake, and a plain status table.
3. [`how-it-works.md`](how-it-works.md) — the two apps, sign-in, device binding, classes,
   check-in sessions, the register, queries and the tone trick.

**Checkpoint:** you can explain the project in one sentence without jargon. For example:
“A teacher plays a short near-ultrasonic code; a student's phone hears it, signs what it heard
with a browser-bound key, and the server stores that as evidence; the teacher still decides
the attendance register.”

## 2. Understand the limits (15 minutes)

This step matters more than the feature list. Read the status sections before you trust a demo.

1. [`README.md`](../README.md) — the **Status** table.
2. [`progress.md`](../progress.md) — **Status**, **Layer 1 measurements** and **Open items and
   blockers**.
3. [`measurements/README.md`](../measurements/README.md) — how acoustic runs are recorded and
   the current Layer 1 gate.
4. [`plan.md`](../plan.md) — §8 **Layers and gates** and §9 **Risks and honest limits**.

**What you must know before testing:**

- The acoustic result is **evidence**, not an automatic attendance decision. A decoded tone
  never marks a student present by itself.
- Layer 1 is treated as passed **for build planning only**, not measured-passed. The last
  sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at 3 m, **4/10 at 5 m** and **1/10 at 10 m**.
  Reverse direction and the muted control are unmeasured.
- Structured timetable parsing (A2b), OCR (A3) and Gemini extraction (A4) are **not built**.
- The live Render commit still needs the owner's dashboard check (gate **G2**), and the
  restore drill depends on credentials and tools the owner must confirm (gate **G5**).

## 3. Run it locally (1–2 hours)

Follow [`getting-started.md`](getting-started.md) from §1 to §8 in order. Do not skip the
configuration step; the backend reads a gitignored `attendance-backend/config/config.env`.

The minimum shape is:

```bash
# From the repository root — install once
cd attendance-backend && npm install
cd ../attendance-frontend && npm install
cd ..

# Configure the backend
cd attendance-backend
cp config/config.env.example config/config.env
# edit config.env: PORT, DB_URI, JWT_SECRET, GOOGLE_CLIENT_ID, CLIENT_URL, allowlists
cd ..

# Terminal 1 — MongoDB (leave running)
mongod --dbpath ~/data/db-attendance-dev

# Terminal 2 — API (leave running)
cd attendance-backend && npm run dev        # http://localhost:4000

# Terminal 3 — React app
cd attendance-frontend && npm start         # http://localhost:3000
```

Then use the dev personas on the login page (`teacher@dev.invalid`,
`student1@dev.invalid` …). They exist only while `npm run dev` is running and never appear
in production.

If a step fails, read **Setup** in [`troubleshooting.md`](troubleshooting.md) before changing
code. Common causes are a missing `config.env`, MongoDB not running, or the wrong Node version.

**Checkpoint:** `/api/v1/health` returns ok, `/api/v1/health/ready` reports the database as
ready, and you can open the teacher and student pages.

## 4. Learn the product map (45 minutes)

Now learn what exists, without reading every implementation detail.

1. [`routes.md`](routes.md) — read the **Access labels** and **Frontend pages** first, then
   skim the API groups by name. You do not need to memorise every endpoint.
2. [`how-it-works.md`](how-it-works.md) — read it fully this time. Pay attention to the
   check-in/evidence flow, the register and the query lifecycle.
3. [`diagrams/README.md`](diagrams/README.md) — open the three diagrams:
   `system-components`, `check-in-flow` and `proof-transport`.

**Checkpoint:** you can trace one path from “teacher starts a session” to “student submits
evidence” to “teacher finalises the register” to “student raises a query”.

## 5. Set up testing (2 hours local, or a full team day deployed)

There are two different testing jobs. Do not mix them up.

| Job | Where it runs | Guide | What it proves |
| --- | --- | --- | --- |
| **Automated local tests** | One laptop | [`getting-started.md`](getting-started.md) §10 | The backend helpers, frontend codec/import logic and production build work |
| **Acoustic phone test** | Local HTTPS tunnel or deployed site | [`getting-started.md`](getting-started.md) §9 and [`measurements/README.md`](../measurements/README.md) | One phone can play and another can decode the tone at a measured distance |
| **Deployed acceptance run** | Render + real phones/laptops | [`testing-plan.md`](testing-plan.md) | The real signed flow, admin security, PDF previews, deployment and restore |
| **Restore drill** | Local machine against a scratch Atlas database | [`backup-restore.md`](backup-restore.md) | The encrypted backup can actually be restored |

### 5.1 Local automated tests

Run these before any deployed session. They are the cheapest way to catch a broken tree.

```bash
cd attendance-backend
npm test                                  # last recorded: 262/262
npm test -- --test-isolation=none         # last recorded: 262/262

cd ../attendance-frontend
npm run test:proof                        # 15
npm run test:acoustic                     # 51
npm run test:checkin                      # 10
npm run test:studentcheckin               # 12
npm run test:auth                         # 2
npm run test:rosterimport                 # 6
npm run test:timetableimport              # 6
CI=true REACT_APP_API_URL=/api/v1 npm run build
```

Generate the synthetic PDF fixtures only when you need the manual preview tests:

```bash
cd attendance-backend
node scripts/generate-test-pdfs.js
```

The fixtures contain fake data. They prove extraction and rejection mechanics, not real
college timetable or roster accuracy.

### 5.2 Acoustic pair test

The microphone needs HTTPS (or `localhost`). For two real phones, use the deployed site or a
tunnel:

```bash
# terminal 1 — React dev server with the same-origin API proxy
cd attendance-frontend && npm run start:shared

# terminal 2 — HTTPS tunnel
cloudflared tunnel --url http://localhost:3000
```

Open `/acoustic-lab` on each phone first, then `/acoustic-tx` on the teacher phone and
`/acoustic-rx` on the student phone. Record the phone model, browser, sample rate, distance,
frames sent/decoded, margins, room and volume in `measurements/YYYY-MM-DD/`.

### 5.3 Deployed acceptance run

Read [`testing-plan.md`](testing-plan.md) in **three passes**, not one:

1. **Pass 1 — can we start?** §1 **Rules of engagement**, §2 **Team, accounts and devices**
   and §3 **Preflight gates G0–G7**. If a gate is not PASS, stop. G2 (Render dashboard commit)
   and G5 (restore prerequisites) are the two hard gates.
2. **Pass 2 — the core flow.** §4.1 **Suite AC** and §4.2 **Suite FL**. These are the acoustic
   range/controls and the signed attendance/query/export flow.
3. **Pass 3 — security and operations.** §4.3 **Suite AD**, §4.4 **Suite PDF**, §4.5
   **Suite DP**, §4.6 **Suite RS**, then the recording templates in §5.

Before Pass 1, collect the prerequisites from:

- [`deployment.md`](deployment.md) — the Render service, environment variables and the G2
  deployment check;
- [`backup-restore.md`](backup-restore.md) — the G5/RS restore drill;
- [`measurements/README.md`](../measurements/README.md) — the acoustic evidence format;
- [`troubleshooting.md`](troubleshooting.md) — what to check when a device, sign-in or deploy
  step fails.

The test plan assumes **3–4 real college students, one real college teacher, one owner
super-admin, 3–4 phones and 3–4 laptops**. The signed flow runs against the deployed Render
URL, not a local build.

## 6. Understand the codebase (1–2 days)

Read the orientation first, then follow one request through the stack. Do not open every file
at once.

1. [`agent.md`](../agent.md) — **Architecture and code map**, **Hard boundaries** and
   **Testing**. This is the shortest description of what must not be broken.
2. [`how-it-works.md`](how-it-works.md) — **Where things live in the code**.
3. [`book/bio-attend-complete-guide.md`](book/bio-attend-complete-guide.md) — read **How to
   read this book**, then Parts **I, III, V, VII, VIII and IX**. Use Parts IV, VI and X–XV as
   reference when you need the data model, every route, operations or the formula sheet.
4. [`plan.md`](../plan.md) — §2 **Core idea**, §5 **Signal design**, §6 **Cascade logic** and
   §8 **Layers and gates**. This explains why the code is shaped this way.

### 6.1 Backend reading order

| Step | Read | Why |
| --- | --- | --- |
| 1 | `attendance-backend/index.js`, `app.js` | Startup order (`connect → model init → listen`) and middleware |
| 2 | `routes/checkInSessionRoute.js`, `attendanceRoute.js`, `googleAuthRoute.js`, `adminRoute.js` | The URL surface and where the proof endpoint lives |
| 3 | `middleware/auth.js`, `originGuard.js`, `adminStepUp.js` | Session, CSRF/origin and passkey boundaries |
| 4 | `models/` — user, enrollment, class → check-in session → proof → attendance record/query → audit/passkey | The data relationships |
| 5 | `controllers/checkInSessionController.js` + `utils/checkInSession.js` | Round keys, the two-minute TTL, pending-key mint/promotion and the evidence-gated manual fallback |
| 6 | `controllers/checkInProofController.js` + `utils/checkInProof.js` | Current/pending acceptance, canonical message, signature check, duplicate handling, expiry and the returned next signal |
| 7 | `controllers/attendanceController.js` + `utils/attendance.js` | Register, close-before-finalise and auto-absent rows |
| 8 | `controllers/googleAuthController.js` + `utils/deviceBinding.js` + `utils/signInPolicy.js` | Device review, `tokenVersion` and account-level status |
| 9 | `controllers/adminController.js` + `utils/auditChain.js` + `utils/adminStepUp.js` | Step-up, audit chain and destructive actions |
| 10 | `controllers/exportController.js`, `timetableController.js`, `utils/pdfText.js`, `utils/roster.js` | Exports and the text-layer PDF previews |

### 6.2 Frontend reading order

| Step | Read | Why |
| --- | --- | --- |
| 1 | `src/index.js`, `src/App.js`, `src/hooks/useRoleSession.js` | Boot, routes and role/session handling |
| 2 | `src/components/login/` | Google sign-in and the development personas |
| 3 | `src/components/teacher/checkInSessions.jsx` + `checkInSessionView.js` | One-tap start, relay console, key/pending display, nudge and evidence cards |
| 4 | `src/components/student/studentCheckIn.jsx` + `studentCheckInView.js` + `src/acoustic/useCheckInAudio.js` + `useSignalTransmitter.js` | Student join, consent, listen, submit, relay the next signal and listen again |
| 5 | `src/acoustic/fsk.js` → `transmitPlan.js` → `receiver.js` → `proofTransport.js` | The tone codec and the signed proof payload |
| 6 | `src/components/teacher/SessionAttendanceModal.jsx` | Register, evidence and wave-timeline tabs |
| 7 | `src/components/admin/AdminPanel.jsx` | Users, sessions, audit, security and settings |
| 8 | `src/components/{attendance,queries,exports,sessions}/` | Analytics, queries, exports and session history |
| 9 | The `*.node-tests.js` files next to the modules you just read | The smallest executable examples of each rule |

**Checkpoint:** you can name the file that mints or promotes a pending round key, the file that
verifies a proof signature and returns the next signal, the file that finalises a register and
the file that decides whether a device is approved.

## 7. Go deeper only when you need it

- **Every page and endpoint:** [`routes.md`](routes.md).
- **Every formula and code path:** the complete guide, especially Parts II, IV, VI, X–XV.
- **Operations:** [`deployment.md`](deployment.md) and [`backup-restore.md`](backup-restore.md).
- **Current work and blockers:** [`progress.md`](../progress.md) and [`agent.md`](../agent.md).
- **Architecture pictures:** [`diagrams/`](diagrams/).

## 8. Seven rules for a new reader

1. Do not start with the very long complete guide. It is a reference, not the front door.
2. Do not start with the deployed test plan. Read the gates first, or you will test the wrong
   build with the wrong accounts.
3. A decoded tone is **evidence**, not attendance. The teacher decides the register.
4. Do not call Layer 1 measured-passed. The 5 m and 10 m results still fail the target, and
   the reverse and muted controls are unmeasured.
5. Do not use a real class or real student data for an experiment. The test plan requires a
   dedicated test class and consent.
6. Do not claim the live deployment matches the repository until the owner compares the
   Render dashboard commit with the recorded `HEAD` (G2).
7. The owner controls commits, pushes, tags, merges and deploys. A reader can run and test
   locally or against the deployed URL; a reader does not deploy.
