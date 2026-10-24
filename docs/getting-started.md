# Getting started

Run the whole thing on your own laptop. You need:

- **Node.js 22 or newer** — check with `node -v`
- **MongoDB** — the free community edition is fine
- **cloudflared** — only needed to test on real phones

## 1. Start the database

Point MongoDB at a data folder of your choice:

```bash
~/mongodb-macos-aarch64--8.3.11/bin/mongod --dbpath ~/data/db-attendance-dev --logpath ~/data/log/mongod-attendance.log
```

(Any local MongoDB works — the path above is just what this project's dev laptop uses.)

## 2. Start the backend

```bash
cd attendance-backend
npm install
npm run dev        # http://localhost:4000, dev personas enabled
```

`npm start` also works, but it does not enable the one-click dev sign-in; it is the
production entry point. `npm run dev` sets `NODE_ENV=development DEV_AUTH_ENABLED=true`.

The backend needs a secret file, `attendance-backend/config/config.env` — it is **not in git**. Ask the project owner for it. It holds the database URL, JWT secret, Google client ID, and the teacher/test-account lists.

Quick check that it is up:

```bash
curl http://localhost:4000/api/v1/health
```

## 3. Start the frontend

```bash
cd attendance-frontend
npm install
npm start          # http://localhost:3000
```

Open http://localhost:3000 in Chrome. After creating a class and roster, the teacher flow
continues at http://localhost:3000/teacher/check-in: choose the class, start a session, and
open the transmitter from the live key.

Heads-up: with this project's local OAuth client, **Google sign-in only works from http://localhost:3000** — that is the address registered with Google. It won't work from a LAN IP or a tunnel URL. The deployed site uses its own authorized origin.

## 4. Test on real phones (audio needs HTTPS)

Phones only allow microphone access over HTTPS. A temporary Cloudflare tunnel provides that:

```bash
# terminal 1
cd attendance-frontend && npm run start:shared

# terminal 2
cloudflared tunnel --url http://localhost:3000
```

Open the printed `https://….trycloudflare.com/acoustic-lab` link on each phone. Keep the laptop awake while testing — the tunnel dies with it. The two-phone pages are `/acoustic-tx` and `/acoustic-rx` on the same tunnel origin.

For every phone, note down: model, Android version, Chrome version, reported sample rate, and the seven signal margins shown on the lab page (five coarse plus two codec-edge).

## Test accounts

In development, the login page has a **dev-only** section with one-click personas:
`Demo Teacher`, `Demo Student One`, `Demo Student Two`, `Demo Student Three`. They use
`@dev.invalid` addresses, need no password, and only exist while the backend runs with
`npm run dev`. A production build never shows them and the API returns 404.

Real Google accounts:

- Teacher: `2023ugcs059@nitjsr.ac.in` (in `TEACHER_EMAILS`)
- Test students: the Gmail addresses in the backend's `TEST_STUDENT_EMAILS` setting
  (rehearsal only — they are never part of a real roster).
- Test teacher: the Gmail address in `TEST_TEACHER_EMAILS`, if one is configured. It signs
  in with the teacher role and can open `/teacher/check-in`; there is no separate admin
  role.

For a Gmail test account, the server allowlist is only one of three gates: the address must
also be on the Google OAuth consent screen's **Test users** list while the app is in
Testing, and the frontend must be built with `REACT_APP_GOOGLE_HOSTED_DOMAIN` set to an
**empty value** (unset falls back to `nitjsr.ac.in`, which hides Gmail accounts in the
chooser). Rebuild after changing it.

## Run the tests

```bash
cd attendance-backend && npm test               # 72 tests
cd attendance-frontend && npm run test:acoustic # 51 tests
cd attendance-frontend && npm run test:checkin  # 7 tests
```
