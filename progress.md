# progress.md: Where we are

Update this at the end of every session. If it disagrees with the real code, the code wins: fix this file and tell the owner.

Last updated: 2026-10-17 (audit session: real code inspected, backend unit tests run; statuses below now match the code, no code was changed)

## Status

- Current layer: **Layer 1, Physical layer** (web app sends and hears tones)
- Current slice: **none running.** Audit done. Slices 1.1–1.5 are partly built by earlier AI sessions (the "Acoustic capability check" lab — see the audit table) and are **not tested**. Slices 1.6–1.10 (FSK frames) are not built at all.
- Last gate passed: none
- Next action: owner picks the next slice (see "Next slice options"). Proposed: verify 1.1 + 1.2 on a real Android phone over HTTPS.

## Done: planning (no code)

- [x] Requirements gathered and decisions confirmed (see `plan.md` section 3)
- [x] Design written: signal, cascade, ID round, roster, identity, retention, hosting, risks
- [x] Layered plan with gates
- [x] Planning doc exists as a Claude doc ("Acoustic Presence Check-in: Plan") and is now mirrored in `plan.md`
- [x] `plan.md`, `agent.md`, `progress.md`, `resume-prompt.md` created

## Already built (audit 2026-10-17: checked against the real code)

Earlier sessions (git commits say "Iteration-1/2/3 ... via Codex Terra 5.6") built the items below **before** these progress notes existed. Statuses were checked file-by-file today. None of these items has been tested on a real phone or run end-to-end.

| Item | Where it lives | What it does | Tested? |
| --- | --- | --- | --- |
| Acoustic capability lab (Layer 1) | `attendance-frontend/src/components/acousticLab/AcousticLab.jsx`, `attendance-frontend/public/tone-detector-worklet.js`, route `/acoustic-lab` (needs no sign-in; linked from both dashboards as "Test phone audio") | Mic + AudioContext setup; shows sample rate, applied mic settings (echo/noise/AGC), constraint support; plays 5 fixed tones 15.5–19.5 kHz from the phone speaker and measures them on the phone's own mic with a Goertzel AudioWorklet; shows ambient baseline and per-tone margin with 12/6 dB verdicts; stores nothing | **No** — never run on a real phone |
| Roster + class management (Layer 2 shape, built early) | backend `utils/roster.js`, `controllers/classController.js`, `models/classModels.js`, `models/enrollmentModels.js`, `routes/classRoute.js`; frontend `components/teacher/classManagement.jsx` | Parse CSV/paste roster (lowercase, dedupe, `@nitjsr.ac.in` only, derive batch/branch/roll); create class; preview/save/read roster; enrollment active/inactive | Unit tests pass (3 roster tests via `npm test`). No end-to-end run (needs MongoDB + teacher session) |
| Google sign-in + device binding (Layer 2 shape, built early) | backend `controllers/googleAuthController.js`, `models/deviceBindingRequestModels.js`, `utils/deviceBinding.js`, `routes/googleAuthRoute.js`; frontend `GoogleSignInButton.jsx`, `Login.jsx`, `utils/deviceKey.js`, `classManagement.jsx` review queue | Server verifies nitjsr.ac.in Google ID token, roster-gates accounts; student browser makes a P-256 key pair (IndexedDB) bound to the account; key changes go to a teacher review queue (approve/reject) | Device-binding unit tests pass (2 tests). Not runnable end-to-end: `attendance-backend/config/config.env` has no `GOOGLE_CLIENT_ID`/`TEACHER_EMAILS`, server answers 503. Never tested on a phone |
| Legacy attendance app (pre-plan scaffold, 2026-08-26) | `Mark.jsx`, `takeAttendance.jsx`, `addRoom.jsx`, location/code/passkey routes and controllers, dashboards, `docs/codebase/*` | Original GPS-rectangle + 6-digit-code + WebAuthn attendance and its docs. Predates `plan.md`; not part of the Layer 1 gate | Not retested this session |
| Deployment | `attendance-frontend/build/` (built 10:14 today, includes the lab) | Local production build exists. The live Vercel URL (`attendance-frontend-sage.vercel.app`) serves an **older bundle without the lab or Google sign-in** | n/a |

Instruction for the next session: verify slices in order; mark a slice `passed` only after its test is actually run.

## Layer 1: slice list

Status key: `todo`, `built, needs test`, `partial (built with gaps, needs test)`, `passed`, `failed`

| # | Slice | Pass/fail test | Status |
| --- | --- | --- | --- |
| 1.1 | Static page with a Join button, served over HTTPS (free host) | Page opens on an Android Chrome phone from the hosted URL | **built, needs test** — page + button exist and need no sign-in; not deployed (README quick-tunnel instructions only; live Vercel build lacks the lab) |
| 1.2 | Join starts AudioContext and mic; app logs real sample rate and the mic settings the browser applied; refuses below 44.1 kHz | Log shows sample rate and applied settings on a real phone | **partial** — shows sample rate + applied settings + constraint support; **no below-44.1-kHz refusal in code**; not run on a phone |
| 1.3 | Play one tone at a chosen frequency with ~6 ms fade; frequency sweep page | A second phone's spectrum view shows the tone; no audible clicks | **partial** — plays 5 fixed tones (15.5–19.5 kHz), no chosen frequency, **no 6 ms fade**, no second-phone spectrum view; tones are measured on the same phone's mic |
| 1.4 | Single-tone detector (Goertzel) with live level display and noise-floor estimate | Detects a tone from the other phone at 1 m; quiet room shows no detection | **partial** — Goertzel worklet, ambient baseline, margin verdicts exist (12/6 dB, not the plan's ~9 dB-above-median rule); **no live level display**; never tested from a second phone |
| 1.5 | Band sweep across 15–20 kHz on each available phone model; record which frequencies play and record well | Table of phone model vs usable frequencies saved in this file | **partial** — sweep tool exists (5 frequencies); **no measurements recorded**, no model table |
| 1.6 | FSK frame encoder (start marker, 7 data symbols, 2 check symbols, no repeated adjacent tone) | Node test: encode then decode a synthetic buffer, 1000 random keys, all correct | todo — **no frame encoder exists anywhere in the code** |
| 1.7 | Frame decoder tested on synthetic audio with added noise and echo | Node test: decode rate and false-positive rate reported at several noise levels | todo — no frame decoder exists |
| 1.8 | Live send and receive between two phones at 1 m | Frames sent vs decoded recorded; at least 95% | todo |
| 1.9 | Range test at 6 m and at the far corner (about 20 m) | Same record at each distance; at least 95% (proposed target) | todo |
| 1.10 | Choose the band (18–20 kHz or lower) from the measurements; decide whether Layer 1 gate passes | Decision written here with the numbers behind it | todo |

Layer 1 gate (from `plan.md`): frames decode at 1 m, 6 m and the far corner, proposed target 95% of frames on phones students actually use.

## Next slice options (owner decides; go-ahead pending)

- **A (proposed, needs a real Android phone):** verify **1.1 + 1.2** together — expose the lab over HTTPS (quick tunnel or redeploy the current build to Vercel), open it on a real phone, record sample rate and applied mic settings; first add the small "refuse below 44.1 kHz" check that 1.2 requires. Pass = page opens over HTTPS on Android Chrome; report shows sample rate + applied settings; app refuses to run when the rate is below 44.1 kHz.
- **B (no hardware needed):** build **1.6 + 1.7** — FSK frame encoder + decoder with Node synthetic-audio tests (noise, echo). Can be built and fully tested in one session.
- **C:** something else the owner wants.

## Later layers (not started; do not begin before the previous gate passes)

- Layer 2: Cascade. Server mints keys, waves, domain-restricted Google sign-in, roster upload, free-host check. Gate: small rehearsal reaches every phone; waves and time per wave measured.
- Layer 3: ID round and scoring. Time slots, neighbour reports, review queue, same-day override, 1-day expiry job and attendance lock. Gate: outside phones rejected; inside phones accepted or queued.
- Layer 4: Class pilot with 70–120 students. Gate: attendance matches manual roll call; false accepts and rejects counted.
- Layer 5: Mobile app, decided after Layer 4.

Each of these must be broken into slices like Layer 1 before work starts.

**Note (2026-10-17):** two Layer 2-shaped pieces were already built early (roster/classes; Google sign-in/device binding — see audit table). They are untested end-to-end, do not count toward any gate, and must be re-sliced and tested when Layer 2 starts. No **new** Layer 2 work until the Layer 1 gate passes.

## Measurements log

Record real results here (phone model, Android version, Chrome version, band, distance, frames sent, frames decoded, notes).

| Date | Phone | Android / Chrome | Band | Distance | Sent | Decoded | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## Session log

| Date | Slice | What was done | Test result | Next |
| --- | --- | --- | --- | --- |
| 2026-10-17 | n/a | Planning and these four markdown files | n/a | Owner lists what is already built; verify it |
| 2026-10-17 | audit (no code changes) | Read the real codebase; mapped built code to Layer 1 slices; checked the live Vercel bundle (older, no lab); checked env/config; ran existing backend tests | `npm test` in `attendance-backend`: **5/5 pass** (roster + device-binding utils). Backend `npm start` is blocked on this machine: installed Node 26.11.1, project requires <26 (`.nvmrc` = 24) | Owner picks slice A or B above |

## Open items (from `plan.md`)

- Can the teacher's phone sit in the centre, or must it stay at the front?
- Confirm the college Google domain sign-in setup.
- Pick the free host for Layer 2 after checking idle sleep and connection limits.
- Confirm the assumptions in `plan.md` section 3.

## Blockers

- **Real-device testing not done:** no acoustic-lab run on a real phone has been recorded. Needs an Android phone (2020+) with Chrome, plus the owner.
- **Deployed frontend is stale:** `attendance-frontend-sage.vercel.app` serves an old bundle without the lab. Redeploy `attendance-frontend/build` or use the README's `cloudflared` quick tunnel for phone tests.
- **Backend cannot start on this machine as-is:** Node v26.11.1 installed; `engines` wants >=22 <26 and `scripts/verify-node-version.js` exits 1. Use `nvm use` (Node 24) before backend work.
- **Google sign-in server side unconfigured:** `config.env` lacks `GOOGLE_CLIENT_ID` and `TEACHER_EMAILS`; `/auth/google` answers 503 until set. (Not needed for Layer 1.)
- **MongoDB not verified:** backend expects a local DB (`DB_URI` is set in `config.env`); not checked this session. (Not needed for Layer 1.)
