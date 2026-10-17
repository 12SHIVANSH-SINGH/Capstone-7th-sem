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
npm start          # http://localhost:4000
```

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

Open http://localhost:3000 in Chrome.

Heads-up: **Google sign-in only works from http://localhost:3000** — that is the address registered with Google. It won't work from a LAN IP or a tunnel URL.

## 4. Test on real phones (audio needs HTTPS)

Phones only allow microphone access over HTTPS. A temporary Cloudflare tunnel provides that:

```bash
# terminal 1
cd attendance-frontend && npm run start:shared

# terminal 2
cloudflared tunnel --url http://localhost:3000
```

Open the printed `https://….trycloudflare.com/acoustic-lab` link on each phone. Keep the laptop awake while testing — the tunnel dies with it.

For every phone, note down: model, Android version, Chrome version, reported sample rate, and the five signal margins shown on the lab page.

## Test accounts

- Teacher: `2023ugcs059@nitjsr.ac.in`
- Test students: the two Gmail addresses in the backend's `TEST_STUDENT_EMAILS` setting (development only — they are never part of a real roster).

## Run the tests

```bash
cd attendance-backend && npm test               # 10 tests — sign-in policy, rosters, device binding
cd attendance-frontend && npm run test:acoustic # 12 tests — the tone codec
```
