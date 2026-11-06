# progress.md: Where we are

Update this at the end of every session. If it disagrees with the real code, the code wins:
fix this file and tell the owner.

Last updated: **2026-11-06** (session 26: timetable PDF text preview A2a; backend **255/255**,
frontend **96/96**, production build green, CSP browser audit **7/7** page loads,
WebAuthn browser E2E passed).

## Status

- **Current layer:** Layer 1 is treated as **passed by owner assumption for build planning
  only**. It is **not measured-passed**. The 2026-10-25 sweep still fails at 5 m and 10 m;
  reverse direction and muted control are unmeasured.
- **Current slice:** security P0 and P1 are built and tested locally. P0 covers strict CSP,
  first-party cookies, session revocation, impersonation hardening, teacher-approved device
  binding, encrypted backup scripts and supply-chain scanning. P1 adds WebAuthn/passkey
  step-up for destructive admin actions, an audit hash chain with verification, export auditing
  and rate limits, `/health/ready`, JWT rotation and the settings-patch fix. The document
  phase has started: **A1 roster PDF text extraction → editable preview** and **A2a timetable
  PDF text extraction → read-only preview** are built and tested with generated fixtures.
  Neither slice writes data: A1 fills the roster textarea for the existing preview/save, and
  A2a never parses rows, matches classes, creates a class or writes a slot. Structured
  timetable import (A2b), local OCR (A3) and consent-gated Gemini extraction (A4) are not
  built. Scoring, automatic attendance decisions and the ID round are not built.
- **Production super-admin access is built:** `SUPER_ADMIN_EMAILS` grants the exact owner
  address the `superadmin` role in production as well as development. A verified Gmail
  identity is accepted for this grant; the Google button no longer forces the college hosted
  domain by default. The grant is re-checked on every request, admin sessions default to 12
  hours (`SUPER_ADMIN_SESSION_HOURS`, max 72), and promotion/creation writes an
  `auth.superadmin.granted` audit entry.
- **Admin console:** production features are users, classes, sessions, attendance
  override/delete, queries, audit with chain verification, passkey security, settings and
  impersonation. Demo controls are hidden in production and every `/api/v1/admin/demo/*`
  route returns 404.
- **Hardening:** HS256 JWT pinning, 200 kB JSON limit, `trust proxy=1`, strict
  Content-Security-Policy with no inline scripts, `HttpOnly; Secure; SameSite=Lax` cookies in
  production, per-account `tokenVersion` revocation, impersonation without a JSON token echo,
  JWK sanitisation, super-admin rows protected from demotion/disable, disabled accounts cannot
  reactivate through Google sign-in, and a startup warning when no account can open `/admin`.
- **P1 admin hardening:** destructive console actions require a fresh WebAuthn assertion.
  A successful assertion sets a five-minute, `HttpOnly`, admin-path-scoped `admin_step_up`
  cookie; missing approval returns **428** with `code: "step_up_required"`. The first passkey
  is trust-on-first-use; adding another passkey requires an existing approval. New audit rows
  carry `seq`, `prevHash` and a canonical SHA-256 `hash`, and `GET /admin/audit/verify`
  recomputes the chain and reports the first break plus a legacy count. Every export writes an
  audit entry and is limited to 30 downloads per 10 minutes per account/IP. `/health/ready`
  returns 503 until MongoDB is connected. `JWT_SECRET_PREVIOUS` is verification-only during a
  rotation window; signing always uses `JWT_SECRET`. The settings patch filters `$setOnInsert`
  defaults against `$set` keys, fixing the Mongo path-conflict 500.
- **Device binding:** a student's first browser and every changed browser now enter the
  teacher device-review queue; only dev/test personas auto-approve. Replacing an approved
  device bumps `tokenVersion`, so the old session cannot submit proofs.
- **Repository state:** local `HEAD`, `origin/main` and `origin/HEAD` are all **`32a2078`**.
  The A1 roster PDF slice, P0/P1 security, PWA and dark-mode work are committed and pushed.
  The A2a timetable-preview changes are **uncommitted** in the working tree pending owner
  review. The live Render deployment version was not verified; do not assume it matches
  `32a2078`. No push, tag, merge or deploy was performed in this session.
- **Next action:** obtain representative timetable (and ideally roster) PDFs. Then build
  **A2b structured timetable parsing** only when samples exist: match rows to existing owned
  classes, show a slot preview, require teacher confirmation and flag unmatched rows for
  manual class creation. Do not invent timetable layouts. Local OCR (A3) follows. In
  parallel, the owner can review and publish A2a, configure Render and deploy, then run a
  real Google/phone multi-wave rehearsal. Production needs
  `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com`,
  `SUPER_ADMIN_SESSION_HOURS=12`, an HTTPS `WEBAUTHN_ORIGINS` (or `RENDER_EXTERNAL_URL`), and
  an empty/unset `REACT_APP_GOOGLE_HOSTED_DOMAIN`. The address must not appear in
  `TEACHER_EMAILS` or any `TEST_*` list. After the first deploy, sign in as the super-admin,
  open **Admin → Security** and register a passkey before changing settings or roles.

## What is built

| Area | State |
| --- | --- |
| Google sign-in, allowlists, device binding and review | ✅ built and tested |
| Rooms, classes, CSV/paste rosters and enrollment | ✅ built and tested |
| Roster PDF text extraction → editable preview | ✅ built and tested with generated PDF fixtures; no auto-save; scanned OCR and real-college layouts unvalidated |
| Timetable PDF text extraction → read-only preview | ✅ built and tested with generated PDF fixtures; never parses rows, creates classes or writes slots; real timetable layouts unvalidated |
| Structured timetable import, local OCR, Gemini extraction | ⛔ not built / gated |
| Check-in sessions, wave keys, teacher check-in screen | ✅ built and tested |
| Signed proof transport, student discovery, student check-in shell | ✅ built and tested; evidence only |
| Evidence-gated wave advancement and bounded key history | ✅ built and tested |
| Teacher evidence view and session history | ✅ built and tested |
| Teacher-confirmed register, finalisation, edits and audit | ✅ built and browser-smoke-tested |
| 24-hour student queries with optional location evidence | ✅ built and browser-smoke-tested |
| Analytics, trend/term totals and query counts | ✅ built and browser-smoke-tested |
| PDF/Excel exports for registers, queries, sessions, users, audit | ✅ built and browser-smoke-tested |
| Notifications, timetable, profile and help | ✅ built and browser-smoke-tested |
| Super-admin console, settings, impersonation and audit | ✅ built and browser-smoke-tested |
| Admin passkey step-up, audit hash chain, export limits and readiness | ✅ built and browser-E2E-tested |
| Demo seed/reset (`@demo.invalid`) | ✅ development only; 404 in production |
| PWA manifest, service worker, offline shell, dark theme and overflow-aware navigation | ✅ production build verified |
| Student cascade, automatic scoring, ID round, mobile app | ⛔ not built / gated |
| Real Google + physical-phone multi-wave rehearsal | ⏳ pending |

## Tests

| Gate | Result |
| --- | --- |
| Backend (`npm test`) | **255/255** |
| Backend (`npm test -- --test-isolation=none`) | **255/255** |
| Proof transport | **15/15** |
| Acoustic (codec, lab, worklets, TX/RX link) | **51/51** |
| Teacher check-in view | **7/7** |
| Student check-in view | **9/9** |
| Auth routing | **2/2** |
| Roster PDF import helpers | **6/6** |
| Timetable PDF import helpers | **6/6** |
| Frontend total | **96/96** |
| Production build | ✅ compiles successfully (`CI=true REACT_APP_API_URL=/api/v1 npm run build`) |
| Browser smoke (dev) | **65/65** |
| CSP production-build audit | **7/7 page loads**, zero CSP violations, Google button rendered, service worker active, dark theme applied |
| WebAuthn browser E2E (Chrome virtual authenticator) | ✅ 428 before enrollment, passkey registration, five-minute step-up cookie, settings retry, audit chain **3/3** verified, zero console errors |
| Dark-mode, More-menu and mobile audit | **95/95** |
| Desktop More visibility sweep | **21/21** (1101–1920 px; super-admin, teacher, student) |
| Production-mode Gmail-admin smoke | **13/13** |
| Mobile/dark smoke | **27/27** |
| Production PWA/offline smoke | **16/16** |
| Backend production audit | **0 high / 0 critical**, 2 moderate (`uuid` via `exceljs`, no non-breaking fix) |
| Frontend audit | **4 critical / 36 high**, mostly CRA 5 build-chain debt; CI keeps this report-only until a Vite migration |
| Backup encryption pipeline | ✅ stub-tool test: encrypt, decrypt, gzip check, scratch-database namespace mapping, wrong passphrase rejected; **real Atlas drill pending** |

The browser smokes used temporary browser harnesses outside the repo's npm test commands.
The backend suite covers auth policy, controllers, middleware, startup, env guards, origin
guard, cookies, rate limits, rosters, roster/timetable PDF text reconstruction and upload
previews, device binding, session core, wave advancement, proof transport, teacher evidence,
student discovery, rehearsal enrollment, super-admin access, WebAuthn step-up, audit-chain
integrity, export auditing, readiness and JWT rotation.

## Layer 1 measurements

The final distance sweep is archived in `measurements/2026-10-25/`:

| Date | Distance | Sent | Decoded | Rate | RX margins | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-25 | 1 m | 10 | 10 | 100% | 22.8–34.6 dB | key 67685752, run KNLTDK |
| 2026-10-25 | 2 m | 10 | 9 | 90% | 20.4–32.8 dB | key 112601243, run JXSW5P |
| 2026-10-25 | 3 m | 10 | 9 | 90% | 24.7–34.5 dB | key 168524840, run ZNUZRT |
| 2026-10-25 | 5 m | 10 | 4 | **40%** | 11.1–12.9 dB | key 127494959, run 4Y32LT; 45% amplitude |
| 2026-10-25 | 10 m | 10 | 1 | **10%** | 10.2 dB | key 159574813, run 6RHC9R |

Overall: **33/50 (66%)**. Phone models, media volume and TX/RX roles were not recorded.
The 2026-10-24 runs are archived separately; the old 5 m result is not a true 5 m measurement
because its RX report still said `distance: "1 m"`. The M32 lab run measured 19.5 kHz at only
0.7 dB, so the speaker/mic roll-off is a known risk. Synthetic codec tests remain green
(1000/1000 random keys at 48 kHz, 200/200 at 44.1 kHz, 0 false positives on noise), but
synthetic results do not substitute for the physical gate.

**Layer 1 gate:** ≥95% frames at 1 m, 5 m and 10 m, both directions, on real student phones,
plus a muted control. **Not met.** The owner's 2026-10-29 direction treats it as passed for
build planning only; never call the physical gate measured-passed.

## Accounts

| Account | Role | Configured in |
| --- | --- | --- |
| `2023ugcs059@nitjsr.ac.in` | teacher | `TEACHER_EMAILS` |
| `testforshivansh059@gmail.com` | test student (rehearsal) | `TEST_STUDENT_EMAILS` |
| `12shivanshsingha@gmail.com` | super-admin (`/admin`) | `SUPER_ADMIN_EMAILS`; 12-hour session |
| `teacher@dev.invalid` | dev teacher | built-in persona |
| `student1@dev.invalid`, `student2@dev.invalid`, `student3@dev.invalid` | dev students | built-in personas |

- Dev personas work only with `npm run dev` and auto-approve devices; they never join a
  roster.
- Test students sign in without a roster, but a proof still needs an active enrollment. In
  development/test, `ALLOW_TEST_ROSTER_EMAILS=true` admits the exact `TEST_STUDENT_EMAILS`
  addresses to a roster; production refuses the flag.
- The super-admin address belongs only in `SUPER_ADMIN_EMAILS`; startup rejects overlap with
  `TEACHER_EMAILS` or a `TEST_*` list.
- For Gmail accounts, add the address to the Google OAuth consent screen's test users while
  the app is in Testing, and leave `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty.

## Open items and blockers

- **Physical range:** 5 m (40%) and 10 m (10%) fail. Diagnose a lower band and/or TX settings,
  then rerun 1 m/5 m/10 m, reverse direction and a muted control.
- **Real-device rehearsal:** the student shell and teacher flow were browser-smoke-tested
  with a JWT cookie and, for the student shell, fake audio. No real Google sign-in or physical
  phone has exercised the full multi-wave flow.
- **Student cascade:** not built. Waves advance only by explicit teacher action; phones do
  not receive or retransmit the next key.
- **Scoring and ID round:** not built and still gated.
- **Device-binding retention:** bindings persist indefinitely while proof evidence is TTL'd
  after about one day. Decide whether bindings should follow the same retention.
- **Device approval is human:** a stolen session cookie can create a pending request, but it
  cannot bind without a teacher approving it. Teacher decisions are the remaining trust
  boundary; audit both approval and rejection.
- **Split-hosting CSRF:** the exact frontend origin must be in `CLIENT_URLS`.
- **Startup fails closed:** duplicate data that prevents a unique index stops the service;
  clean it before deploying.
- **Shared-store rate limiter:** needed if the service scales past one Render instance.
- **Old MongoDB data directory:** `~/data/db` is partially root-owned; use
  `~/data/db-attendance-dev` instead.
- **Render free tier:** confirm behaviour during a live 5–6 minute check-in.
- **Backup drill not yet run:** scripts and runbook exist, but no real encrypted dump has been
  restored because the Atlas URI, passphrase and `mongodb-database-tools` are not available
  locally yet. Do this before a pilot deploy.
- **P1 limits:** the audit chain is serialised in-process, which is correct for one Render
  instance; a multi-instance deployment needs a transaction or distributed lock. Export and
  passkey limits are in-memory. First passkey enrollment is trust-on-first-use, so a stolen
  super-admin session could enroll one attacker passkey before the owner notices. There is no
  self-service passkey recovery: losing every passkey locks destructive actions until stale
  `adminpasskeys` rows are removed by an operator with database access. Register a second
  passkey on another device.
- **Document ingestion is partially built:** A1 roster PDF text extraction with an editable
  preview and A2a timetable PDF text extraction with a read-only preview are implemented and
  tested against generated PDFs. Both read only an embedded text layer, reject scanned pages
  and never save automatically. A2a never parses rows or creates slots/classes. A2b
  structured timetable import, local OCR and consent-gated Gemini extraction are still not
  built. No real sample PDFs have been supplied yet, so college-layout accuracy and
  structured timetable parsing remain blocked/unvalidated.
- **Gemini consent gate:** raw rosters may go to the free tier only after a student notice and
  a written risk acceptance in `plan.md`; that text must exist before the AI path is coded.

## Recent session history

| Date | What changed | Result |
| --- | --- | --- |
| 2026-11-06 | Document phase A2a: staff-only `POST /timetable/pdf/preview`, shared PDF preview limiter, deterministic text-layer extraction and read-only modal preview in Timetable. Generated-PDF fixtures cover extraction, multipart/auth, scanned-PDF rejection and error mapping. No row parsing, class matching, class creation or slot writes. | Backend **255/255** in both modes, frontend **96/96**, production build green. Real timetable PDFs and the browser modal were not validated; A2b is blocked on samples. |
| 2026-11-05 | Document phase A1: owner-scoped roster PDF upload, PDF.js text-layer extraction with visual line reconstruction, editable preview in Classes, stable PDF error codes, 10 MB/20-page/200k-character caps and a 20-per-10-minute limiter. No roster is saved by extraction. | Backend **245/245** in both modes, frontend **90/90**, production build green; generated-PDF fixtures validate extraction, multipart, auth, scanned-PDF rejection and error mapping. Real college PDFs and OCR remain unvalidated. |
| 2026-11-05 | P1 admin hardening: WebAuthn/passkey step-up for destructive super-admin actions, audit hash chain and `/admin/audit/verify`, `req.ip` audit fix, export auditing and 30/10-minute limits, `/health/ready`, verification-only `JWT_SECRET_PREVIOUS` rotation, Security tab and step-up retry client. Browser E2E exposed and fixed the Mongo `$set`/`$setOnInsert` settings conflict. | Backend **227/227** in both modes, frontend **84/84**, production build green, WebAuthn E2E passed with a 3-entry chain and zero console errors. |
| 2026-11-05 | Security P0: strict CSP with external theme bootstrap, first-party `SameSite=Lax` cookies, per-account `tokenVersion` revocation, impersonation hardening, teacher-approved first device binding, JWK sanitisation, encrypted backup/restore scripts, Dependabot and a GitHub security workflow. Removed the external Google Fonts import and allowed only the GIS stylesheet. | Backend **189/189**, frontend **84/84**, production build green, CSP browser audit **7/7** page loads with zero violations; backup drill still pending. |
| 2026-11-04 | Fixed dark-mode contrast across public, teacher, student, check-in, acoustic-lab, TX/RX, super-admin and error pages with semantic status/brand/bar tokens and a shared persisted `ThemeToggle` applied before first paint. Rebuilt the desktop **More** menu as a body portal with fixed positioning, scroll/resize clamping, Escape/click-outside handling and a sticky trigger, so every overflow link is visible at 1101–1920 px. | Frontend **84/84**, production build green, dark/More/mobile browser audit **95/95**, More widths **21/21**. |
| 2026-11-04 | Production Gmail super-admin grant, 12-hour admin sessions, live env revalidation, HS256 pinning, 200 kB JSON limit, `trust proxy=1`, extra headers, super-admin demotion/disable protection, disabled-account sign-in guard, startup admin warning. Reconciled docs. | Backend **160/160**, frontend **84/84**, production build green, production-mode Gmail-admin **13/13**, mobile/dark **27/27**, PWA/offline **16/16**. |
| 2026-11-04 | Full attendance product: teacher-confirmed registers, edits and audit, 24-hour queries with optional location, analytics, PDF/Excel exports, session history, notifications, timetable, profile/help, super-admin console, demo seed/reset, dark theme, mobile nav and PWA. | All local suites passed; dev browser smoke **65/65**, API smoke 60 checks. |
| 2026-10-31 | Wave advancement + bounded key history (2.4c), teacher evidence view (2.5), production caching/HSTS/graceful-shutdown hardening. | Backend suite passed; browser teacher smoke passed; diagrams re-rendered. |
| 2026-10-29 | Student check-in shell (2.4b): consent gate, local decode, signed evidence, evidence card, expired/no-session/device-review states. | Student helper tests **9/9**; fake-audio browser smoke stored one proof and handled retry/expiry/closed/review. |
| 2026-10-28 | Rehearsal enrollment (2.4b0) with `ALLOW_TEST_ROSTER_EMAILS`; production refuses the flag. | Backend suite passed; 7-checkpoint real Mongo/HTTP smoke. |
| 2026-10-25 | Final five-distance acoustic sweep archived; student active-session discovery (2.4a). | 33/50 decoded; gate fails at 5 m/10 m. |

Earlier sessions built the design system, class management, acoustic lab, FSK codec, TX/RX
pages, Google sign-in, device binding, session core and proof transport. The codec remains
**12/12** on its original suite and the full acoustic suite **51/51**.

## Local commands

```bash
# 1. MongoDB
mkdir -p ~/data/db-attendance-dev ~/data/log
mongod --dbpath ~/data/db-attendance-dev --logpath ~/data/log/mongod-attendance.log

# 2. Backend with dev personas and device auto-approval
cd attendance-backend && npm run dev                  # http://localhost:4000

# 3. Frontend
cd attendance-frontend && npm start                   # http://localhost:3000

# 4. Phone/testing tunnel (microphone needs HTTPS)
cd attendance-frontend && npm run start:shared
cloudflared tunnel --url http://localhost:3000

# Tests
cd attendance-backend && npm test
cd attendance-backend && npm test -- --test-isolation=none
cd attendance-frontend && npm run test:proof
cd attendance-frontend && npm run test:acoustic
cd attendance-frontend && npm run test:checkin
cd attendance-frontend && npm run test:studentcheckin
cd attendance-frontend && npm run test:auth
cd attendance-frontend && npm run test:rosterimport
cd attendance-frontend && npm run test:timetableimport
cd attendance-frontend && CI=true REACT_APP_API_URL=/api/v1 npm run build
```
