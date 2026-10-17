# Bio Attend — Frontend

React single-page app for **Bio Attend** — classroom attendance with near-ultrasonic tones. Project overview: [root README](../README.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm start` | Dev server at http://localhost:3000 (laptop only) |
| `npm run start:shared` | Dev server on the LAN with a same-origin API proxy — for phone/tunnel testing |
| `npm run build` | Production build into `build/` |
| `npm run test:acoustic` | Tone codec tests (Node's test runner) |

## Where things live

| Path | What |
| --- | --- |
| `src/ui/` | Shared design system (buttons, cards, badges, toasts, app shell) |
| `src/components/` | Pages — Home, Login, dashboards, class management, sound lab |
| `src/acoustic/fsk.js` | The FSK tone codec (encode/decode) |
| `public/tone-detector-worklet.js` | AudioWorklet that listens for tones in real time |

Setup, test accounts and phone testing: [docs/getting-started.md](../docs/getting-started.md).
