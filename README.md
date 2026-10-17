<div align="center">

# 🎧 Bio Attend

**Classroom attendance that proves who's actually in the room — using inaudible near-ultrasonic tones passed between student phones.**

Capstone project · NIT Jamshedpur

![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/react-19-61dafb?logo=react&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-8-47A248?logo=mongodb&logoColor=white)
![Status](https://img.shields.io/badge/status-prototype-orange)

</div>

## Why

Roll calls and QR codes are easy to fake — a friend answers "present", or a QR code gets photographed and shared. Bio Attend aims to prove *physical presence*: students' own phones play and listen for short near-ultrasonic tone sequences, and the server verifies who actually heard the room's one-time key.

## How it works

1. **Teacher starts a check-in** — the server mints a one-time key for that class.
2. **Phones play and listen** — student phones emit and listen for near-ultrasonic tones (inaudible to most people). No app to install.
3. **The server verifies** — phones that decoded the key are marked present. Playing the tone from outside the room doesn't help: the sound only carries inside.

The full check-in loop is the next milestone; today the building blocks are in place and tested.

## What works today

- 🔐 **Google-only sign-in** with a college-domain gate (plus test accounts for development)
- 🏫 **Classes, rooms and rosters** — teacher creates a class, sets its room, imports the student roster from CSV
- 📱 **One device per student** — each browser binds to a private key; new devices wait in a teacher **review queue**
- 🔊 **Phone sound lab** — measures a phone's audio path (sample rate, tone margins) before real check-ins
- 🎛️ **Custom FSK tone codec** — 17 tones in the ~18–19.8 kHz band, 120 ms symbols, with automated tests; no audio libraries
- 🎨 **Modern responsive UI** — a light indigo design system shared across both roles

## Status

| Stage | State |
| --- | --- |
| Remove legacy flows (GPS rooms, passkeys, codes) and rebuild the foundations | ✅ done |
| New UI — design system + Home, Login, both dashboards, 404 | ✅ done |
| Class management and sound lab get the new design, plus lab safety fixes | 🔜 next |
| Phone-to-phone tone test at 1 m (first real presence proof) | 🔜 |
| Full check-in flow for a live class | ⏳ |

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
cd attendance-backend && npm install && npm start        # :4000

# 3. Frontend
cd attendance-frontend && npm install && npm start       # :3000
```

Open **http://localhost:3000**. Google sign-in is registered for this address only.

Testing on real phones (microphone needs HTTPS) and the full walkthrough: **[docs/getting-started.md](docs/getting-started.md)**.

## Tests

```bash
cd attendance-backend && npm test               # 10 tests — sign-in policy, rosters, device binding
cd attendance-frontend && npm run test:acoustic # 12 tests — the tone codec
```

## Documentation

- 📄 **[docs/](docs/)** — what the project is, how to run it, how it works, troubleshooting
- 🗺️ [`plan.md`](plan.md) — signal design and staged engineering plan
- 📈 [`progress.md`](progress.md) — what's built, measured results, what's next

## Notes

- The tone band is under active tuning — the top tones measured weak on the oldest test phone, so the band may move lower before live testing.
- Google sign-in is configured for `http://localhost:3000` during development; temporary Cloudflare tunnels are used for the *sound lab* on phones (no sign-in needed there).
- The publicly deployed Vercel build is an older version, maintained separately from this repository.
