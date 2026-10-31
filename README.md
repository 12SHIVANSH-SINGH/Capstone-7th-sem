<div align="center">

# 🎧 Bio Attend

**Classroom attendance built to show who's actually in the room — using inaudible near-ultrasonic tones passed between student phones.**

Capstone project · NIT Jamshedpur

![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?logo=mongodb&logoColor=white)
![Status](https://img.shields.io/badge/status-prototype-orange)

</div>

**Live prototype:** [https://bio-attend.onrender.com](https://bio-attend.onrender.com) — teacher sign-in, class/roster management and the check-in session screen work; the two-phone acoustic link is under test. The current working tree adds the Layer 2.3 proof transport, student discovery/shell, wave advancement, the teacher evidence view and deployment hardening; all of it is **built and tested locally but not deployed**.

> **Layer 1 gate status:** the owner has directed that Layer 1 be treated as **passed for build planning only**. This is an assumption, not a measurement. The 2026-10-25 sweep still fails at 5 m (4/10) and 10 m (1/10), and reverse/muted control are unmeasured. Do not read this build as proof that the physical gate passed.

## Why

Roll calls and QR codes are easy to fake — a friend answers "present", or a QR code gets photographed and shared. Bio Attend aims to prove *physical presence*: students' own phones play and listen for short near-ultrasonic tone sequences, and the server records which phones heard the room's one-time key.

## How it works

1. **Teacher starts a check-in** — the server mints a one-time key for that class.
2. **Phones play and listen** — student phones emit and listen for near-ultrasonic tones (inaudible to most people). No app to install.
3. **The server records evidence** — a phone submits the wave and key it decoded, signed by its bound device key. The server stores that as evidence; the full check-in flow will decide attendance. A forwarded key alone does not prove presence, which is why the ID round is still planned.

The evidence-only pilot runs end to end: teacher start → student consent/download-free listening → signed evidence → teacher evidence view → evidence-gated wave advance. The student cascade (phones retransmitting the next key), scoring and the ID round are still future work.

## What works today

- 🔐 **Google-only sign-in** with a college-domain gate (plus env-gated test accounts during rehearsal)
- 🏫 **Classes, rooms and rosters** — teacher creates a class, sets its room, imports the student roster from CSV
- 📱 **One device per student** — each browser binds to a private key; the first binding auto-approves, and a changed device waits in a teacher **review queue**
- 🔊 **Phone sound lab** — measures a phone's audio path (sample rate, tone margins) before real check-ins
- 📡 **Two-phone TX/RX link test** — one phone plays FSK frames, the other decodes them and both export a paired report; the link works at 1 m but degrades sharply at 5 m/10 m
- 🎛️ **Custom FSK tone codec** — 17 tones in the ~18–19.8 kHz band, 120 ms symbols, with automated tests; no audio libraries
- 🗝️ **Teacher check-in screen** — pick a class, start/close a server-minted 15^7 wave key, see its two-minute lifetime, open the tested transmitter with the key pre-filled, advance the wave only after accepted evidence, and review session history
- 🧾 **Cascade proof transport (Layer 2.3)** — a bound student can submit the session/wave/key it decoded with a signed P-256 device proof; the server stores idempotent evidence with a 1-day TTL and **does not score attendance**
- 🔎 **Student active-session discovery (Layer 2.4a)** — a student can list the live sessions for their own active enrollments without ever seeing a key
- 📲 **Student check-in shell (Layer 2.4b)** — `/student/check-in` shows the retention/consent notice, listens for the current wave, signs the decoded evidence with the bound device key and shows the recorded proof; it never displays the key, stops listening if the teacher advances the wave, and does not decide attendance
- 🧪 **Rehearsal enrollment (Layer 2.4b0)** — a non-production-only switch lets a teacher add an exact `TEST_STUDENT_EMAILS` address to a roster so the full flow can be rehearsed; production startup refuses it
- ⏭️ **Wave advancement + key history (Layer 2.4c)** — a teacher can advance only after the current wave has accepted evidence; the old key is archived in a bounded server-side history of 20 and never returned, and each advance mints a fresh two-minute key
- 👀 **Teacher evidence view (Layer 2.5)** — read-only per-session evidence with student email, wave and recorded time plus per-wave counts; `attendanceDecided: false`, and no key, signature, protocol version or device fingerprint
- 🛡️ **Deployment hardening** — production HSTS, `no-store` API responses, immutable hashed-asset caching with revalidated `index.html`, and SIGTERM/SIGINT shutdown that closes the listener then MongoDB
- 🎨 **Modern responsive UI** — a light indigo design system shared across both roles
- 🧪 **Dev-only one-click sign-in** — passwordless test personas for two-phone work; impossible in production

## Status

| Stage | State |
| --- | --- |
| Remove legacy flows (GPS rooms, passkeys, codes) and rebuild the foundations | ✅ done |
| New UI — design system + Home, Login, both dashboards, 404 | ✅ done |
| Class management and sound lab get the new design, plus lab safety fixes | ✅ done |
| Two-phone TX/RX link pages and reports | ✅ deployed; page works, but the physical link degrades sharply past 3 m |
| Distance sweep (2026-10-25, final) | ⚠️ 1 m 10/10 · 2 m 9/10 · 3 m 9/10 · **5 m 4/10** · **10 m 1/10**; reverse/control pending; gate **not measured as passed** (Layer 1 is an owner assumption for build planning only) |
| Server check-in session core (Layer 2.1) | ✅ built and tested |
| Teacher check-in screen (Layer 2.2) | ✅ built and tested; starts/closes sessions, plays the current key |
| Cascade proof transport (Layer 2.3) | ✅ built and tested locally; **evidence only, no scoring**; committed but not deployed |
| Student active-session discovery (Layer 2.4a) | ✅ built and tested locally; returns live sessions for the student's own enrollments, never a key |
| Rehearsal enrollment (Layer 2.4b0) | ✅ built and tested locally; non-production only, and production startup refuses the flag |
| Student check-in shell (Layer 2.4b) | ✅ built and browser-smoke-tested locally: consent gate, mic capture, signed evidence and evidence card; expired/no-session/device-review states handled; no key shown |
| Wave advancement + key history (Layer 2.4c) | ✅ built and browser-smoke-tested locally: evidence-gated advance, fresh key, bounded key-free history, possible silent-browser concurrency conflict, student capture stops on wave change |
| Teacher evidence view (Layer 2.5) | ✅ built and browser-smoke-tested locally: read-only rows and per-wave counts, no attendance field, no key/signature/device data |
| Production hardening | ✅ HSTS, API `no-store`, hashed-asset caching, revalidated shell, graceful SIGTERM/SIGINT; production-mode local smoke passed |
| Full check-in flow for a live class | ⏳ — the evidence-only pilot works; a real-phone/Google multi-wave rehearsal is next; the student cascade, scoring and the ID round are not built |

This is a prototype — not yet used for real attendance.

## Tech stack

| Layer | Uses |
| --- | --- |
| Frontend | React 19 (Create React App), React Router, Axios, react-icons |
| Backend | Node.js ≥ 22, Express, MongoDB + Mongoose, Google Identity Services |
| Audio | Web Audio API + AudioWorklet, custom FSK codec (no libraries) |
| Tests | Node's built-in test runner (codec + backend) |

## Repository layout

```text
attendance-frontend/   React app — UI, tone codec, sound lab
attendance-backend/    Express API — auth, classes, rosters, device reviews
docs/                  Short plain-English docs — start here
plan.md                Engineering plan (signal design, gates, roadmap)
progress.md            Build log and current status
```

## Quick start

```bash
# 1. MongoDB (any local instance works)
mongod --dbpath ~/data/db-attendance-dev

# 2. Backend — needs config/config.env (ask the owner; it's gitignored)
cd attendance-backend && npm install
npm run dev                                              # :4000, dev personas on

# 3. Frontend
cd attendance-frontend && npm install && npm start       # :3000
```

Open **http://localhost:3000**. In development the login page also shows one-click test
personas (`teacher`, `student1`…). Google sign-in is registered for
`http://localhost:3000` only.

Deploying it (one Render service + Atlas + Google OAuth, with verification and rollback):
**[docs/deployment.md](docs/deployment.md)**.

Testing on real phones (microphone needs HTTPS) and the full walkthrough: **[docs/getting-started.md](docs/getting-started.md)**.

## Tests

```bash
cd attendance-backend && npm test               # 151 tests — auth policy, controller, middleware, startup, env guard, origin guard, rosters, binding, session core, wave advancement, proof transport, teacher evidence, student discovery, rehearsal enrollment, test allowlists
cd attendance-frontend && npm run test:proof    # 15 tests — proof payload, canonical message, signing and transport helpers
cd attendance-frontend && npm run test:acoustic # 51 tests — codec, lab, worklets, TX/RX link, key handoff
cd attendance-frontend && npm run test:checkin  # 7 tests — active-session view, key countdown, history durations
cd attendance-frontend && npm run test:studentcheckin # 9 tests — session selection, consent/expiry gate, evidence shape
cd attendance-frontend && npm run test:auth     # 2 tests — signed-in dashboard routing
```

## Documentation

- 📄 **[docs/](docs/)** — what the project is, how to run it, how it works, troubleshooting
- 🗺️ **[Architecture diagrams](docs/diagrams/)** — PlantUML component map, check-in flow and proof sequence
- 🚀 **[docs/deployment.md](docs/deployment.md)** — Render + Atlas + Google OAuth runbook
- 🧭 [`plan.md`](plan.md) — signal design and staged engineering plan
- 📈 [`progress.md`](progress.md) — what's built, measured results, what's next

## Notes

- The tone band is under active tuning. The final 2026-10-25 sweep decoded 100% at 1 m but only 40% at 5 m and 10% at 10 m, with margins close to the 9 dB threshold; the top tones also measured weak on the oldest test phone. A lower band and matched TX settings must be tested before the reverse-direction and muted-control runs.
- Google sign-in is configured for `http://localhost:3000` during development; temporary Cloudflare tunnels are used for the *sound lab* and TX/RX pages on phones (no sign-in needed there).
- The single-service production layout is documented in [docs/deployment.md](docs/deployment.md); the older standalone Vercel build is not part of this repo's workflow.
