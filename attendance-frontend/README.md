# Bio Attend — Frontend

React single-page app for **Bio Attend** — classroom attendance with near-ultrasonic
tones and a teacher-confirmed register. Project overview: [root README](../README.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm start` | Dev server at http://localhost:3000 (laptop only). |
| `npm run start:shared` | Dev server on the LAN with a same-origin `/api` proxy — for phone/tunnel testing. |
| `npm run build` | Production build into `build/`. |
| `npm run test:acoustic` | Tone codec, lab, worklets and TX/RX link tests (51). |
| `npm run test:proof` | Proof payload/signing/transport tests (15). |
| `npm run test:checkin` | Teacher check-in view helpers (7). |
| `npm run test:studentcheckin` | Student check-in view helpers (9). |
| `npm run test:auth` | Signed-in dashboard routing (2). |

## Where things live

| Path | What |
| --- | --- |
| `src/App.js` | All page routes. Full map: [docs/routes.md](../docs/routes.md). |
| `src/ui/` | Shared design system, app shell, navigation, charts, modals and toasts. |
| `src/components/` | Pages grouped by role: student, teacher, attendance, queries, exports, sessions, admin, notifications, timetable, profile, help and acoustic lab. |
| `src/hooks/useRoleSession.js` | Page-level session/role guard used by authenticated pages. |
| `src/acoustic/fsk.js` | The FSK tone codec (encode/decode). |
| `src/acoustic/proofTransport.js` | Proof payload, canonical message and device-signing helpers. |
| `src/acoustic/useCheckInAudio.js` | Microphone capture and local decode for `/student/check-in`. |
| `public/tone-detector-worklet.js` | AudioWorklet that listens for tones in real time. |
| `public/sw.js` | Service-worker shell; API responses are never cached. |
| `src/setupProxy.js` | Dev-only `/api` proxy used by `npm run start:shared`. |

Setup, accounts and phone testing: [docs/getting-started.md](../docs/getting-started.md).
