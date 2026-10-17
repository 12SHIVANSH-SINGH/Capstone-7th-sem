# progress.md: Where we are

Update this at the end of every session. If it disagrees with the real code, the code wins: fix this file and tell the owner.

Last updated: 2026-10-17 (session 5: Phase 2 redesign done — Indigo kit + rebuilt Home/Login/dashboards/404; docs/ rewritten short & plain-English; READMEs updated GitHub-style)

## Status

- Current layer: **Layer 1, Physical layer** (web app sends and hears tones)
- Current slice: **1.6 + 1.7 — FSK frame encoder + decoder: passed** (synthetic Node tests only; results below). **Phase 2 redesign done** (Indigo kit + Home/Login/dashboards). Next: **Phase 3 — class management + acoustic lab restyle** (then slice 1.8).
- Last gate passed: none (Layer 1 gate = frames decode at 1 m, 6 m and the far corner on real phones)
- Setup done: teacher sign-in (`2023ugcs059@nitjsr.ac.in`) verified in the browser on 2026-10-17; backend runs with plain `npm start` on any Node ≥22 (including the default Node 26). **Phase 1 legacy cleanup done and verified**; **Phase 2 design system + core screens done and verified** (see "Approved plan").
- Next action: build **Phase 3** (class management + lab restyle + the three lab gap fixes). Owner side whenever convenient: review the redesigned UI in the browser, run the lab on the **M01**, and sign in once with each test Gmail — all independent of the next phase.

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
| Google sign-in + device binding (Layer 2 shape, built early) | backend `controllers/googleAuthController.js`, `models/deviceBindingRequestModels.js`, `utils/deviceBinding.js`, `routes/googleAuthRoute.js`; frontend `GoogleSignInButton.jsx`, `Login.jsx`, `utils/deviceKey.js`, `classManagement.jsx` review queue | Server verifies nitjsr.ac.in Google ID token, roster-gates accounts; student browser makes a P-256 key pair (IndexedDB) bound to the account; key changes go to a teacher review queue (approve/reject) | Device-binding unit tests pass (2 tests); the sign-in policy is now unit-tested too (5 tests) — backend suite 10/10. It was doubly broken until 2026-10-17: `config.env` had no `GOOGLE_CLIENT_ID` (503), and `classRoute`'s blanket `router.use` swallowed `/auth/google` so the handler never ran. Both fixed; verified by curl up to the token-verification step (garbage token → 401 "could not be verified"). Test accounts now exist for browser testing (see "Test accounts"). Teacher sign-in (`2023ugcs059@nitjsr.ac.in`) was verified for real on 2026-10-17 in Chrome on localhost; the two student test accounts still to be tried. Never tested on a phone |
| Legacy attendance app (pre-plan scaffold, 2026-08-26) | `Mark.jsx`, `takeAttendance.jsx`, `addRoom.jsx`, location/code/passkey routes and controllers, dashboards, the seniors' handover docs | Original GPS-rectangle + 6-digit-code + WebAuthn attendance and its docs (this is the seniors' hand-over base we are adapting; its coordinate precision is why we are moving to acoustics). Not part of the Layer 1 gate | Not retested this session |
| Deployment | `attendance-frontend/build/` (rebuilt 2026-10-17 evening; a rebuild after this session's changes passes) | Local production build. The live Vercel URL (`attendance-frontend-sage.vercel.app`) is the seniors' deploy — we do **not** have access to it, so we will host our own copy. Added `vercel.json` + `public/_redirects` so deep links (e.g. `/acoustic-lab`) work on our own Vercel/Netlify deploy | n/a |

Instruction for the next session: verify slices in order; mark a slice `passed` only after its test is actually run.

## Test accounts (2026-10-17, for login/roster testing)

| Account | Role | Configured in |
| --- | --- | --- |
| `2023ugcs059@nitjsr.ac.in` | teacher (provisioned on first Google sign-in) | `TEACHER_EMAILS` in `attendance-backend/config/config.env` |
| `testforshivansh059@gmail.com` | test student (skips the class-roster gate) | `TEST_STUDENT_EMAILS` in `config.env` |
| `12shivanshsingha@gmail.com` | test student (skips the class-roster gate) | `TEST_STUDENT_EMAILS` in `config.env` |

- Test students are a test-only feature: any address in `TEST_STUDENT_EMAILS` may sign in with Google even though it is not `@nitjsr.ac.in`, and it skips the "must be on an active roster" gate. Remove the line (or empty it) before the real pilot.
- Their device-binding review requests are visible to any teacher, because test accounts can never appear on a college roster.
- Roster upload still accepts `@nitjsr.ac.in` only (unchanged): test students will not show up inside class rosters.
- Still to check in Google Cloud Console (owner): `http://localhost:3000` in the OAuth client's Authorized JavaScript origins; and if the OAuth consent screen is in "Testing" status, add all three accounts as test users.

## Codec evidence (FSK, synthetic — 2026-10-17)

`npm run test:acoustic` in `attendance-frontend` — **12/12 tests pass, exit 0** (seeded PRNG, numbers reproducible):

| Test | Result |
| --- | --- |
| Clean frames, 48 kHz, 1000 random keys | 1000/1000 decoded |
| Clean frames, 44.1 kHz, 200 keys | 200/200 decoded |
| Frame found behind 0–500 ms leading silence (search mode) | 100/100 |
| Full-band SNR 30 / 20 / 10 / 0 dB (100 keys each) | 100/100 each |
| Echo (single tap, gain 0.5) at 30 / 60 / 90 ms | 50/50 each |
| Echo 60 ms + 10 dB noise | 50/50 |
| False positives: white noise only / random tone sequences | 0/100 and 0/30 |
| Check symbols: single tone flips rejected | 0/200 accepted |
| Check symbols: two tone flips | 2/200 accepted (checksum collisions, ~1 in 225 expected) |

Codec facts as built: 17 tones at 110 Hz spacing from 18.0 kHz; 120 ms symbols; frame = 2 marker + 7 data + 2 check symbols (1.32 s); data digits base 15; consecutive data/check tones can never repeat (carried by construction, inverted by the decoder); check digits = weighted sum mod 225; 6 ms raised-cosine fade per symbol; detection = ≥9 dB above the median of the 17 tones. Caveat: this is synthetic audio — real speaker/mic behaviour is still untested (that is what the lab run and slice 1.8 are for).

## Layer 1: slice list

Status key: `todo`, `built, needs test`, `partial (built with gaps, needs test)`, `passed`, `failed`

| # | Slice | Pass/fail test | Status |
| --- | --- | --- | --- |
| 1.1 | Static page with a Join button, served over HTTPS (free host) | Page opens on an Android Chrome phone from the hosted URL | **passed (2026-10-17, interim)** — the lab page opened over HTTPS in Chrome on an Android phone via a cloudflared quick tunnel; our own permanent host still to come (own Vercel/Netlify later; `vercel.json` + `_redirects` ready) |
| 1.2 | Join starts AudioContext and mic; app logs real sample rate and the mic settings the browser applied; refuses below 44.1 kHz | Log shows sample rate and applied settings on a real phone | **partial** — on a real phone (2026-10-17): 48 kHz, echo/noise/AGC disabled "Yes", 1 mic channel; **no below-44.1-kHz refusal in code**; the second phone (44.1 kHz case) still pending |
| 1.3 | Play one tone at a chosen frequency with ~6 ms fade; frequency sweep page | A second phone's spectrum view shows the tone; no audible clicks | **partial** — plays 5 fixed tones (15.5–19.5 kHz), no chosen frequency, **no 6 ms fade in the lab** (the fade now exists in the codec), no second-phone spectrum view; tones are measured on the same phone's mic |
| 1.4 | Single-tone detector (Goertzel) with live level display and noise-floor estimate | Detects a tone from the other phone at 1 m; quiet room shows no detection | **partial** — self-detection verified on a real phone 2026-10-17 (margins 46–53 dB); ambient baseline + 12/6 dB verdicts exist (not the plan's ~9 dB-above-median rule); **no live level display**; the second-phone test is still pending |
| 1.5 | Band sweep across 15–20 kHz on each available phone model; record which frequencies play and record well | Table of phone model vs usable frequencies saved in this file | **partial (started)** — 2026-10-17: Samsung M32 measured (see Measurements log): 15.5 / 16.5 / 17.5 / 18.5 kHz clearly usable, **19.5 kHz not detected**; M01 pending |
| 1.6 | FSK frame encoder (start marker, 7 data symbols, 2 check symbols, no repeated adjacent tone) | Node test: encode then decode a synthetic buffer, 1000 random keys, all correct | **passed (2026-10-17)** — `src/acoustic/fsk.js` + `src/acoustic/fsk.node-tests.js`; 1000/1000 keys at 48 kHz, 200/200 at 44.1 kHz, 1000/1000 tone-level. Files: `attendance-frontend/src/acoustic/fsk.js`, tests `fsk.node-tests.js`, script `npm run test:acoustic` |
| 1.7 | Frame decoder tested on synthetic audio with added noise and echo | Node test: decode rate and false-positive rate reported at several noise levels | **passed (2026-10-17)** — noise 100/100 at 30/20/10/0 dB; echo (30/60/90 ms, gain 0.5) 50/50 each; echo+noise 50/50; false positives 0/100 + 0/30; single tone flips rejected 200/200; double flips 2/200 (checksum collisions ~1/225). Full numbers in "Codec evidence" |
| 1.8 | Live send and receive between two phones at 1 m | Frames sent vs decoded recorded; at least 95% | todo — next slice proposed |
| 1.9 | Range test at 6 m and at the far corner (about 20 m) | Same record at each distance; at least 95% (proposed target) | todo |
| 1.10 | Choose the band (18–20 kHz or lower) from the measurements; decide whether Layer 1 gate passes | Decision written here with the numbers behind it | todo |

Layer 1 gate (from `plan.md`): frames decode at 1 m, 6 m and the far corner, proposed target 95% of frames on phones students actually use.

## Approved plan: cleanup + redesign before 1.8 (owner, 2026-10-17)

Owner decisions: **Indigo modern SaaS** palette · **light theme only** for now · **full legacy removal** · order **cleanup → redesign → 1.8**.

**Phase 1 — legacy cleanup (no visual change).** Delete frontend pages/routes `Register`, `Mark` (`/markAttendance`), `AddRoom`, `TakeAttendance` + their CSS and now-dead files (`App.css`, `Loader/loding.jsx`), including the links from Home/Navbar/dashboards. Backend: replace GPS `Location` rooms with a simple **Room** (`roomNo`) model and keep `GET /rooms`, add teacher `POST /rooms`; remove `/init-register`, `/verify-register`, `/init-auth`, `/verify-auth` (WebAuthn), `/register`, `/login` (password), `/admin/addRoom`, `/getRoom` (GPS), `/genCode`, `/deleteCode`, `/getCode` (6-digit). Remove deps: `@simplewebauthn/server`, `@simplewebauthn/browser`, `geoip-lite`, `node-cron`, `validator`, `crypto` (npm), `bcryptjs`, `framer-motion`, `react-intersection-observer`. Hygiene: `sendToken` no longer leaks `passKey`; `/api/v1/` joke string → `/health`; backend package renamed `attendance-backend`. Verify: backend tests 10/10, frontend build, curl smoke, no links to removed routes. **→ DONE and verified 2026-10-17**: rooms migrated to the new `Room` model via `scripts/migrate-rooms.js` (B-204 carried over; 0 classes to repoint), teacher `POST /rooms` added (its UI arrives in Phase 3), backend tests 10/10, acoustic tests 12/12, production build passes (main bundle −4.9 kB gz), smoke curls clean (`/health` 200 JSON; `/islogin` + `/rooms` 401; every removed endpoint 404; Google garbage 401), backend `npm audit` 0 vulnerabilities, dev server + tunnel re-verified.

**Phase 2 — design system + core screens.** Tokens in `index.css` + new `src/ui/` kit (AppShell with role chip/user menu, Button, Card, StatCard, Badge, Field, EmptyState, Spinner, Toast); mobile-first. Rebuild Home (honest copy, no dead links), Login (Google-only, split brand panel), Student dashboard (device-status hero card, "Test phone audio"), Teacher dashboard (real stats: classes / active students / pending device reviews — no fake demo rows). Extras: toasts, empty/loading states, 404 page. **→ DONE and verified 2026-10-17:** tokens (indigo/slate scales, semantic colors, radii, shadows) + `src/ui/` kit (ui.css, Brand, AppShell with role chip/avatar/user area/logout, Button, Card, StatCard, Badge, Field, Spinner/PageLoader, EmptyState, Toast provider); Home (hero, animated equalizer wave, 3-step how-it-works, features, CTA, footer — fake stats removed), Login (split indigo brand panel + Google-only card), Student dashboard (device-status hero: approved/review/unbound + check-in explainer; fake classes/attendance removed; role redirect added), Teacher dashboard (real stats from `/classes` + `/device-reviews`, recent classes, quick actions; fake demo data removed), Navbar, 404 page + route, new `manifest.json`/`index.html` head, Inter + `ui-` prefix so the two not-yet-restyled pages keep their own CSS. Production build passes (CSS +1.15 kB, JS +2.77 kB gz); `/`, `/login`, `/acoustic-lab` serve 200 locally and through the tunnel; no change to the sign-in/device-claim logic.

**Phase 3 — teacher tools + lab polish.** Class management: class cards, inline "+ Add room" (no GPS), roster paste with highlighted preview errors + sample helper, review queue polish. Acoustic lab: restyle + fold in the three gaps (below-44.1 kHz refusal, 6 ms fades, live level meter). Verify: lab re-run on M32 (no audio regression) + owner click-through.

**Phase 4 — slice 1.8** built in the new design (TX loop page + RX decode page), then the M01 ⇄ M32 at 1 m test. `fsk.js` codec and its tests are untouched by all phases.

## Next slice (owner approved; after cleanup + redesign)

- **1.8 — live send and receive between two phones at 1 m.** TX page plays frames from `src/acoustic/fsk.js` in a loop (with the 6 ms fade, screen wake lock, repeated key played N times); RX page runs the 17-tone Goertzel bank over the audio worklet and decodes on the known symbol schedule; both pages show counters (frames played / heard / decoded). Owner runs M01 ⇄ M32 at 1 m and records the numbers in the measurements log. Pass = ≥95% decoded (proposed).
- **In parallel, owner runs the existing lab (1.1–1.5 checks) on M01 + M32** over HTTPS and shares: sample rate, applied mic settings, the five tone margins, and the recommendation line. This closes 1.1/1.2 and fills the 1.5 table.
- If either fails, fix before starting 1.9 (range tests).

## Later layers (not started; do not begin before the previous gate passes)

- Layer 2: Cascade. Server mints keys, waves, domain-restricted Google sign-in, roster upload, free-host check. Gate: small rehearsal reaches every phone; waves and time per wave measured.
- Layer 3: ID round and scoring. Time slots, neighbour reports, review queue, same-day override, 1-day expiry job and attendance lock. Gate: outside phones rejected; inside phones accepted or queued.
- Layer 4: Class pilot with 70–120 students. Gate: attendance matches manual roll call; false accepts and rejects counted.
- Layer 5: Mobile app, decided after Layer 4.

Each of these must be broken into slices like Layer 1 before work starts.

**Note (2026-10-17):** two Layer 2-shaped pieces were already built early (roster/classes; Google sign-in/device binding — see audit table). They are untested end-to-end, do not count toward any gate, and must be re-sliced and tested when Layer 2 starts. No **new** Layer 2 work until the Layer 1 gate passes.

## Measurements log

Record real results here (phone model, Android version, Chrome version, band, distance, frames sent, frames decoded, notes).

First test phones (owner, 2026-10-17): **Samsung M01** and **Samsung M32** (more phones later).

| Date | Phone | Android / Chrome | Band | Distance | Sent | Decoded | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-17 | Samsung M32 | Android (version to add) / latest Chrome | 15.5 / 16.5 / 17.5 / 18.5 / 19.5 kHz | 0 m (self-test) | 5 tones | 4 clear | 48 kHz; AudioWorklet available; echo/noise/AGC disabled ("Yes"); 1 mic channel; baseline −98…−101 dB; margins 51.5 / 48.1 / 46.5 / 53.0 dB, **19.5 kHz = 0.7 dB (no reliable detection)**; via cloudflared tunnel → `/acoustic-lab` |

## Session log

| Date | Slice | What was done | Test result | Next |
| --- | --- | --- | --- | --- |
| 2026-10-17 | n/a | Planning and these four markdown files | n/a | Owner lists what is already built; verify it |
| 2026-10-17 | audit (no code changes) | Read the real codebase; mapped built code to Layer 1 slices; checked the live Vercel bundle (older, no lab); checked env/config; ran existing backend tests | `npm test` in `attendance-backend`: **5/5 pass** (roster + device-binding utils). Backend `npm start` is blocked on this machine: installed Node 26.11.1, project requires <26 | Owner picks slice A or B |
| 2026-10-17 | 1.6 + 1.7 (+ login/setup fixes) | Built `attendance-frontend/src/acoustic/fsk.js` (frame codec) + `fsk.node-tests.js` (`npm run test:acoustic`). Fixed login chain: CORS allowlist now configurable (`CLIENT_URLS`) + 127.0.0.1 + `*.trycloudflare.com`; removed `classRoute`'s blanket guard that shadowed `/auth/google` (guards now per route); filled local `config.env` (`DB_URI` → local Mongo, fresh `JWT_SECRET`, `GOOGLE_CLIENT_ID`); documented `CLIENT_URLS` in `config.env.example`; set up local Mongo (`~/data/db-attendance-dev`) | Codec: **12/12 tests pass** (numbers in the 1.6/1.7 rows and "Codec evidence"). Backend `npm test` 5/5. Frontend production build passes. CORS preflights verified by curl for localhost/127.0.0.1/trycloudflare (denied origin gets no headers). `/auth/google` reachable again (garbage token → 401 verify error). Backend runs on Node 22 + local Mongo | Owner: run lab on M01 + M32; then build 1.8 |
| 2026-10-17 | setup (test accounts + Node fix) | Extracted the sign-in policy into `utils/signInPolicy.js` (+ 5 unit tests); `googleAuthController` now accepts `TEST_STUDENT_EMAILS` Gmails as roster-exempt students and shows their device reviews to teachers; frontend Google button's `hosted_domain` is now configurable (`REACT_APP_GOOGLE_HOSTED_DOMAIN`, locally set empty for testing); `config.env` gained `TEACHER_EMAILS=2023ugcs059@nitjsr.ac.in` + `TEST_STUDENT_EMAILS=testforshivansh059@gmail.com,12shivanshsingha@gmail.com`; removed the unused, broken native `bcrypt` dependency; widened the Node guard/engines to `>=22` | Backend `npm test`: **10/10 pass on Node 26** (roster 3, device binding 2, sign-in policy 5). Full auth flow (register → login → islogin → logout) verified on Node 26.11.1 against local Mongo; plain `npm start` now works. Post-restart curl battery green (`/` 200, google garbage 401, classes without cookie 401, CORS header for localhost:3000). Policy sanity check: teacher + both Gmails allowed, random Gmail blocked | Owner: browser sign-in test with the 3 accounts; then lab on M01 + M32; then build 1.8 |
| 2026-10-17 | setup (phone-test enablement) | Hardened `start:shared` with `DANGEROUSLY_DISABLE_HOST_CHECK=true` (tunnel host headers); seeded test room `B-204` in the local dev DB (Add New Room needs 4 GPS captures and class creation needs a room); verified the cloudflared quick-tunnel chain live | Tunnel tested: `/` 200 ("Bio Attend"), `/acoustic-lab` 200 deep link, `/api/v1/islogin` 401 JSON through the same-origin proxy. Live URL shared with the owner (random, changes per run) | Owner: run the acoustic lab on M01 + M32 and share both reports |
| 2026-10-17 | lab run 1 (interim) | Owner: signed in with the teacher account for real (worked end-to-end); opened the lab on an Android phone through the live tunnel and ran the tone sweep | Phone: 48 kHz, AudioWorklet available, echo/noise/AGC disabled, 1 mic channel; margins 51.5 / 48.1 / 46.5 / 53.0 dB at 15.5–18.5 kHz; **19.5 kHz = 0.7 dB (not detected)**; baseline ≈ −100 dB. Phone: Samsung M32, latest Chrome | Owner: same lab on the M01; one sign-in per student Gmail on localhost; then build 1.8 (after the cleanup + redesign the owner asked for) |
| 2026-10-17 | Phase 1: legacy cleanup (approved plan) | Deleted the legacy GPS, WebAuthn/passkey, password-auth and 6-digit-code flows. Backend: removed `locationRoute`/`codeRoute`/`locationController`/`codeController`/`locationModels`/`uniqueCodeModels`; new simple **Room** model (`roomModels.js`) + teacher `POST /rooms`; `userModels` lost password/passKey; `userController` is now only logout + islogin; `userRoute` is `/health`, `/logout`, `/islogin`; `sendToken` simplified; `classModels.defaultRoom` refs `Room`; dev-DB rooms migrated via `scripts/migrate-rooms.js`. Frontend: deleted Register/Mark/AddRoom/TakeAttendance pages, Loader, App.css, dead assets (logo.svg, fingerprint.png); routes pruned + catch-all to Home; Login is Google-only; Home/Navbar/dashboards cleaned of legacy links and passkey/GPS claims. Deps pruned (`@simplewebauthn/*`, `geoip-lite`, `node-cron`, `validator`, `crypto`, `bcryptjs`, `framer-motion`, `react-intersection-observer`, `web-vitals`, `cra-template`); packages renamed `attendance-backend`/`attendance-frontend`. | Backend `npm test` **10/10**; acoustic **12/12**; production build passes (main −4.9 kB gz); smoke: `/health` 200 JSON, `/islogin` + `/rooms` 401, removed endpoints 404, Google garbage 401; `npm audit` 0 vulnerabilities; dev server + tunnel re-verified (`/`, `/login`, `/acoustic-lab` 200; tunnel `/api/v1/health` OK). | Phase 2: design system + core screens (Indigo, light). Owner items still open: M01 lab run, test-Gmail sign-ins |
| 2026-10-17 | Phase 2: design system + core screens | Made the Indigo design system: rewritten `index.css` tokens (indigo + slate scales, semantic colors, radii, shadows; light theme, dark-ready names) and a new `src/ui/` kit — `ui.css`, `Brand`, `AppShell` (sticky bar, role chip, avatar/user area, logout), `Button`, `Card`, `StatCard`, `Badge`, `Field`, `Spinner`/`PageLoader`, `EmptyState`, `Toast` (`ToastProvider` + `useToast`). Rebuilt pages on the kit: **Home** (hero with animated equalizer wave, 3-step how-it-works, features, CTA, footer; fake stats removed), **Login** (split indigo brand panel + Google-only card; same sign-in/device-claim logic), **Student dashboard** (device-status hero: approved/review/unbound + check-in explainer; fake classes/attendance removed; role redirect), **Teacher dashboard** (real stats from `/classes` + `/device-reviews`, recent-classes list, quick actions; fake demo data removed), **Navbar**, new **404** page + route. New `manifest.json` + `index.html` head (theme #4F46E5). Removed CRA logo192/512. | Production build passes (CSS +1.15 kB, JS +2.77 kB gz); dev server + tunnel serve `/`, `/login`, `/acoustic-lab` 200 (SPA 404 renders client-side); no functional changes to sign-in/device binding; `classManagement` + `acousticLab` intentionally keep their own CSS until Phase 3. | Phase 3: class management + acoustic lab restyle + lab gap fixes (`<44.1 kHz` refusal, 6 ms fades, live level meter). Owner: review the redesign; M01 lab run + test-Gmail sign-ins still open |
| 2026-10-17 | Docs + READMEs simplified | Deleted the seniors' handover docs (`docs/codebase/`, 17 files describing the removed legacy flows) and wrote five short plain-English pages: `docs/README.md` (index), `what-is-this.md` (problem, idea, status), `getting-started.md` (verified local commands, test accounts, phone testing), `how-it-works.md` (sign-in, rosters, device binding, tones, code map), `troubleshooting.md`. Rewrote the root `README.md` as a GitHub-style readme (badges, how-it-works, what works today, status table, stack, layout, quick start, tests, docs links) and replaced the stock Create-React-App readme in `attendance-frontend/`. | Facts checked against this file and the current package scripts (React 19, Node ≥22, test counts); no code changed. | — |

## Open items (from `plan.md`)

- Can the teacher's phone sit in the centre, or must it stay at the front?
- Confirm the college Google domain sign-in setup.
- Pick the free host for Layer 2 after checking idle sleep and connection limits.
- Confirm the assumptions in `plan.md` section 3.
- Check the Google OAuth client (in Google Cloud Console) allows `http://localhost:3000` as an authorized JavaScript origin, and later add any deployed frontend origin. If the consent screen is in "Testing" status, add the accounts in "Test accounts" as test users.
- `bcrypt` (native) was removed from `package.json`; if anything later genuinely needs native bcrypt, use `bcryptjs` (already present) or re-add and rebuild it.

## Blockers

- **Second phone + cross-phone testing still pending:** the first real-phone lab run is recorded (2026-10-17, see Measurements log); the lab needs no sign-in, and the tunnel URL changes on every run.
- **Student test-account sign-in pending:** teacher sign-in with `2023ugcs059@nitjsr.ac.in` verified end-to-end on 2026-10-17 (Chrome on localhost). The two Gmail test accounts still need one sign-in each (separate Chrome profiles recommended, because one device key is stored per browser).
- **Old MongoDB data dir `~/data/db` is partially root-owned (13 files):** cannot be opened by the current user. A fresh dev dir is in use instead. Only relevant if the old data matters — `sudo chown shivanshsingh:staff ~/data/db/*` would reclaim it.
- **Resolved 2026-10-17 — Node version:** the old `>=22 <26` restriction came from an unused, broken native `bcrypt` dependency (nothing required it; both models use pure-JS `bcryptjs`). It was removed, the guard and `engines` widened to `>=22`, and the whole auth flow verified on Node 26.11.1. Plain `npm start` works now.

## Local commands (verified 2026-10-17)

```bash
# 1. MongoDB (fresh dev data dir; keep running in its own terminal)
~/mongodb-macos-aarch64--8.3.11/bin/mongod --dbpath ~/data/db-attendance-dev --logpath ~/data/log/mongod-attendance.log

# 2. Backend (any Node >=22, including your default Node 26)
cd attendance-backend && npm start                                      # http://localhost:4000

# 3. Frontend (desktop)
cd attendance-frontend && npm start                                     # http://localhost:3000

# 4. Phone tests over HTTPS (cloudflared installed; chain verified 2026-10-17)
cd attendance-frontend && npm run start:shared                          # binds 0.0.0.0 + same-origin API proxy
cloudflared tunnel --url http://localhost:3000                          # new URL each run; open it on the phones

# Tests
cd attendance-backend && npm test                                       # 10/10 (roster + device binding + sign-in policy)
cd attendance-frontend && npm run test:acoustic                         # FSK codec, 12 tests
```
