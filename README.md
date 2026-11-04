<div align="center">

# 🎧 Bio Attend

**Classroom attendance built to show who's actually in the room — using near-ultrasonic tones passed between student phones, then confirmed by a teacher.**

Capstone project · NIT Jamshedpur

![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?logo=mongodb&logoColor=white)
![Status](https://img.shields.io/badge/status-prototype-orange)

</div>

**Live prototype:** [https://bio-attend.onrender.com](https://bio-attend.onrender.com) — the public deployment is an older acoustic pilot (`b7fd8b1`). The current tree adds the full attendance product: teacher-confirmed registers, student queries, analytics, PDF/Excel exports, a production-capable super-admin console, demo mode, notifications, timetable, profile/help and an installable web shell. It is **built and tested locally but not committed or deployed**. The owner controls every push and deploy.

> **Layer 1 gate status:** the owner has directed that Layer 1 be treated as **passed for build planning only**. This is an assumption, not a measurement. The 2026-10-25 sweep still fails at 5 m (4/10) and 10 m (1/10), and the reverse direction and muted control are unmeasured. Do not read this build as proof that the physical gate passed.

## Why

Roll calls and QR codes are easy to fake — a friend answers "present", or a QR code is photographed and shared. Bio Attend aims to prove *physical presence*: students' own phones hear a one-time key carried by sound, and each phone signs the evidence with a key bound to that browser. Attendance is still confirmed by a teacher; a decoded tone is never an automatic verdict.

## How it works

1. **Teacher starts a check-in** — the server mints a one-time key for that class and wave.
2. **Phones listen** — a student taps Join, accepts the retention notice and lets the browser listen for the current near-ultrasonic wave. Nothing to install.
3. **The server records signed evidence** — the phone decodes the wave locally, signs session/wave/key with its bound P-256 device key, and submits the proof. The server stores evidence; it does not mark attendance.
4. **The teacher confirms the register** — the teacher closes the session, marks present/absent/excused from the evidence and finalises the register; later corrections keep an audit trail. A student who was present but unmarked can raise a query for 24 hours after the session closes; an approved query counts as present.

The student cascade (phones retransmitting the next key), automatic scoring and the ID round remain future work.

## What is built

- **Accounts and access** — Google-only sign-in, college-domain and roster gates, environment-gated Gmail test accounts, exact-match `SUPER_ADMIN_EMAILS` grant, one bound device per student with a teacher review queue for changed devices.
- **Teacher tools** — rooms, classes, CSV/paste rosters, check-in sessions, live two-minute wave keys, evidence-gated wave advancement, session history, teacher-confirmed registers and audit.
- **Student flow** — live-session discovery, consent-gated `/student/check-in`, local decode, signed evidence, recorded-evidence card, attendance history and 24-hour queries.
- **Operations** — class/per-student analytics, session trends, branded PDF/Excel exports, notifications, timetable, profile/settings, help and a dark theme.
- **Super-admin console** — users, classes, sessions, attendance overrides/deletion, queries, audit, settings and time-limited impersonation. Demo seed/reset is development-only and returns 404 in production.
- **PWA and hardening** — installable shell, offline cache for static assets only, production HSTS, `no-store` API responses, immutable hashed assets, revalidated shell/deep links and graceful SIGTERM/SIGINT shutdown.

## Status

| Stage | State |
| --- | --- |
| Acoustic lab, FSK codec, two-phone TX/RX pages | ✅ built and deployed; link works at 1 m but degrades sharply at 5–10 m |
| Distance sweep (2026-10-25, final) | ⚠️ 1 m 10/10 · 2 m 9/10 · 3 m 9/10 · **5 m 4/10** · **10 m 1/10**; reverse/control pending; gate **not measured as passed** |
| Session core, teacher screen, signed proof transport, student discovery and shell, wave advancement, teacher evidence view | ✅ built and tested locally |
| Teacher-confirmed attendance, queries, analytics, exports, notifications, timetable, profile/help | ✅ built and browser-smoke-tested locally |
| Super-admin console, audit, settings, impersonation, demo data | ✅ built and locally verified, including a Gmail super-admin in a production-mode check |
| Production deployment of this tree | ⏳ not done — Render still runs `b7fd8b1`; the owner must configure and deploy |
| Real Google/phone multi-wave rehearsal | ⏳ pending |
| Student cascade, automatic scoring, ID round, mobile app | ⛔ not built / gated |

This is a demo-ready capstone prototype — not yet used for real attendance.

## Tech stack

| Layer | Uses |
| --- | --- |
| Frontend | React 19 (Create React App), React Router, Axios, react-icons, PWA service worker |
| Backend | Node.js ≥ 22, Express, MongoDB + Mongoose, Google Identity Services, PDFKit, ExcelJS |
| Attendance | Teacher-confirmed register, optional location evidence, 24-hour queries, append-only audit |
| Audio | Web Audio API + AudioWorklet, custom FSK codec (no audio libraries) |
| Tests | Node's built-in test runner, production build, browser smoke tests |

## Repository layout

```text
attendance-frontend/   React app — pages, tone codec, sound lab, PWA
attendance-backend/    Express API — auth, classes, sessions, attendance, queries, exports, admin
docs/                  Plain-English docs, route reference and diagrams
plan.md                Engineering plan (signal design, gates, roadmap)
progress.md            Current status, measurements and recent build log
```

## Quick start

```bash
# 1. MongoDB (any local instance works)
mongod --dbpath ~/data/db-attendance-dev

# 2. Backend — needs config/config.env (gitignored; ask the owner)
cd attendance-backend && npm install
npm run dev          # http://localhost:4000, dev personas enabled

# 3. Frontend
cd attendance-frontend && npm install && npm start   # http://localhost:3000
```

Open **http://localhost:3000**. In development the login page also shows one-click
personas (`teacher`, `student1`…). Google sign-in is registered for
`http://localhost:3000` only. The full walkthrough — config, demo data, super-admin,
phone testing and tests — is in **[docs/getting-started.md](docs/getting-started.md)**.

The super-admin console is an environment grant, not a demo-only feature. Put the owner
address in `SUPER_ADMIN_EMAILS` before starting the backend — for this project that is
`12shivanshsingha@gmail.com`. It works in production when the address is verified by
Google, is not also in `TEACHER_EMAILS`/`TEST_*`, and the frontend is built without a
college-only hosted-domain hint. Admin sessions default to 12 hours
(`SUPER_ADMIN_SESSION_HOURS`).

In development, that account can seed a full demo class from **Admin → Demo data**.
Demo accounts use `@demo.invalid` addresses, are excluded from real exports and are never
available in production. Resetting demo data preserves the signed-in admin account.

## Tests

```bash
cd attendance-backend && npm test                     # 160 tests
cd attendance-backend && npm test -- --test-isolation=none
cd attendance-frontend && npm run test:proof          # 15 tests
cd attendance-frontend && npm run test:acoustic       # 51 tests
cd attendance-frontend && npm run test:checkin        # 7 tests
cd attendance-frontend && npm run test:studentcheckin # 9 tests
cd attendance-frontend && npm run test:auth           # 2 tests
cd attendance-frontend && CI=true REACT_APP_API_URL=/api/v1 npm run build
```

The working tree also passed a 65-check browser smoke across the super-admin, teacher,
student and query flows, a 13-check production-mode Gmail-admin check, mobile/dark checks
and production PWA/offline checks. Those temporary Playwright scripts are not part of the
repo's npm test commands.

## Documentation

- 🚀 **[Getting started](docs/getting-started.md)** — run the whole stack.
- 🗺️ **[Route reference](docs/routes.md)** — every page and API endpoint, with access rules and purpose.
- 🧠 **[How it works](docs/how-it-works.md)** — the architecture and flows in plain words.
- 🚢 **[Deployment](docs/deployment.md)** — one Render service + Atlas + Google OAuth.
- 🛠️ **[Troubleshooting](docs/troubleshooting.md)** — setup, auth, microphone and deploy fixes.
- 📐 **[Architecture diagrams](docs/diagrams/)** — PlantUML component map, check-in flow and proof sequence.
- 🧭 [`plan.md`](plan.md) — signal design and staged engineering plan.
- 📈 [`progress.md`](progress.md) — what is built, measured and next.

## Notes

- The tone band is under active tuning. The 2026-10-25 sweep decoded 100% at 1 m but only 40% at 5 m and 10% at 10 m, with margins close to the 9 dB threshold. A lower band and matched TX settings must be tested before the reverse-direction and muted-control runs.
- Location is evidence, not a gate: session-start and check-in/query locations are shown with timestamps and distance, but a denied permission never blocks the action.
- Attendance queries expire 24 hours after a session closes. Expired queries stay reviewable and can be reopened with an audit entry; approving a query marks the student present.
- Demo data is available only outside production and is clearly marked `@demo.invalid`; it never replaces the signed-in admin account.
- The production layout is one service so cookies stay first-party. The older split Vercel/Render option is documented only as an alternative.
