<div align="center">

# 🎧 Bio Attend

**Classroom attendance built to show who's actually in the room — using inaudible near-ultrasonic tones passed between student phones.**

Capstone project · NIT Jamshedpur

![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?logo=mongodb&logoColor=white)
![Status](https://img.shields.io/badge/status-prototype-orange)

</div>

**Live prototype:** [https://bio-attend.onrender.com](https://bio-attend.onrender.com) — teacher sign-in, class/roster management and the check-in session screen work; the two-phone acoustic link is under test. The Layer 2.3 proof transport is built and tested locally but is **not deployed**.

## Why

Roll calls and QR codes are easy to fake — a friend answers "present", or a QR code gets photographed and shared. Bio Attend aims to prove *physical presence*: students' own phones play and listen for short near-ultrasonic tone sequences, and the server records which phones heard the room's one-time key.

## How it works

1. **Teacher starts a check-in** — the server mints a one-time key for that class.
2. **Phones play and listen** — student phones emit and listen for near-ultrasonic tones (inaudible to most people). No app to install.
3. **The server records evidence** — a phone submits the wave and key it decoded, signed by its bound device key. The server stores that as evidence; the full check-in flow will decide attendance. A forwarded key alone does not prove presence, which is why the ID round is still planned.

The full check-in loop is the next milestone; today the building blocks are in place and tested.

## What works today

- 🔐 **Google-only sign-in** with a college-domain gate (plus env-gated test accounts during rehearsal)
- 🏫 **Classes, rooms and rosters** — teacher creates a class, sets its room, imports the student roster from CSV
- 📱 **One device per student** — each browser binds to a private key; the first binding auto-approves, and a changed device waits in a teacher **review queue**
- 🔊 **Phone sound lab** — measures a phone's audio path (sample rate, tone margins) before real check-ins
- 📡 **Two-phone TX/RX link test** — one phone plays FSK frames, the other decodes them and both export a paired report
- 🎛️ **Custom FSK tone codec** — 17 tones in the ~18–19.8 kHz band, 120 ms symbols, with automated tests; no audio libraries
- 🗝️ **Teacher check-in screen** — pick a class, start/close a server-minted 15^7 wave-0 key, see its two-minute lifetime, open the tested transmitter with the key pre-filled, and review session history
- 🧾 **Cascade proof transport (Layer 2.3)** — a bound student can submit the session/wave/key it decoded with a signed P-256 device proof; the server stores idempotent evidence with a 1-day TTL and **does not score attendance**. No student UI yet
- 🎨 **Modern responsive UI** — a light indigo design system shared across both roles
- 🧪 **Dev-only one-click sign-in** — passwordless test personas for two-phone work; impossible in production

## Status

| Stage | State |
| --- | --- |
| Remove legacy flows (GPS rooms, passkeys, codes) and rebuild the foundations | ✅ done |
| New UI — design system + Home, Login, both dashboards, 404 | ✅ done |
| Class management and sound lab get the new design, plus lab safety fixes | ✅ done |
| Two-phone TX/RX link pages and reports | ✅ deployed; physical link passes 1 m and 5 m |
| Phone-to-phone tone test at 1 m (first real acoustic link result) | ✅ 10/10 at 1 m, 20/20 at 5 m (2026-10-24); reverse/control/10 m pending |
| Server check-in session core (Layer 2.1) | ✅ built and tested |
| Teacher check-in screen (Layer 2.2) | ✅ built and tested; starts/closes sessions and hands the key to the transmitter |
| Cascade proof transport (Layer 2.3) | ✅ built and tested locally; **no student UI or scoring** and not deployed yet |
| Full check-in flow for a live class | ⏳ — the proof transport exists; student check-in shell, wave advancement and scoring are next |

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
cd attendance-backend && npm test               # 124 tests — auth policy, controller, middleware, startup, env guard, origin guard, rosters, binding, session core, proof transport, test allowlists
cd attendance-frontend && npm run test:proof    # 15 tests — proof payload, canonical message, signing and transport helpers
cd attendance-frontend && npm run test:acoustic # 51 tests — codec, lab, worklets, TX/RX link, key handoff
cd attendance-frontend && npm run test:checkin  # 7 tests — active-session view, key countdown, history durations
cd attendance-frontend && npm run test:auth     # 2 tests — signed-in dashboard routing
```

## Documentation

- 📄 **[docs/](docs/)** — what the project is, how to run it, how it works, troubleshooting
- 🗺️ **[Architecture diagrams](docs/diagrams/)** — PlantUML component map, check-in flow and proof sequence
- 🚀 **[docs/deployment.md](docs/deployment.md)** — Render + Atlas + Google OAuth runbook
- 🧭 [`plan.md`](plan.md) — signal design and staged engineering plan
- 📈 [`progress.md`](progress.md) — what's built, measured results, what's next

## Notes

- The tone band is under active tuning — the top tones measured weak on the oldest test phone, so the band may move lower before the remaining 10 m and reverse-direction runs.
- Google sign-in is configured for `http://localhost:3000` during development; temporary Cloudflare tunnels are used for the *sound lab* and TX/RX pages on phones (no sign-in needed there).
- The single-service production layout is documented in [docs/deployment.md](docs/deployment.md); the older standalone Vercel build is not part of this repo's workflow.
