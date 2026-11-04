# progress.md: Where we are

Update this at the end of every session. If it disagrees with the real code, the code wins:
fix this file and tell the owner.

Last updated: **2026-11-04** (session 21: production-capable super-admin, attendance product
and admin hardening; backend **160/160**, frontend **84/84**).

## Status

- **Current layer:** Layer 1 is treated as **passed by owner assumption for build planning
  only**. It is **not measured-passed**. The 2026-10-25 sweep still fails at 5 m and 10 m;
  reverse direction and muted control are unmeasured.
- **Current slice:** the attendance product and production super-admin console are built and
  tested locally. The next slice is a real Google/phone multi-wave rehearsal (2.6). Scoring,
  automatic attendance decisions and the ID round are not built.
- **Production super-admin access is built:** `SUPER_ADMIN_EMAILS` grants the exact owner
  address the `superadmin` role in production as well as development. A verified Gmail
  identity is accepted for this grant; the Google button no longer forces the college hosted
  domain by default. The grant is re-checked on every request, admin sessions default to 12
  hours (`SUPER_ADMIN_SESSION_HOURS`, max 72), and promotion/creation writes an
  `auth.superadmin.granted` audit entry.
- **Admin console:** production features are users, classes, sessions, attendance
  override/delete, queries, audit, settings and impersonation. Demo controls are hidden in
  production and every `/api/v1/admin/demo/*` route returns 404.
- **Hardening:** HS256 JWT pinning, 200 kB JSON limit, `trust proxy=1`, extra security
  headers, super-admin rows protected from demotion/disable, disabled accounts cannot
  reactivate through Google sign-in, and a startup warning when no account can open `/admin`.
- **Production state:** Render runs **`b7fd8b1`** at
  <https://bio-attend.onrender.com> and does not include this product layer. Local `HEAD` and
  `origin/main` are **`35ad5a2`**; the attendance/admin work is **uncommitted** in the
  working tree. No push, tag, merge or deploy was performed.
- **Next action:** configure Render and deploy, then run a real Google/phone multi-wave
  rehearsal. Production needs
  `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com`,
  `SUPER_ADMIN_SESSION_HOURS=12`, and an empty/unset
  `REACT_APP_GOOGLE_HOSTED_DOMAIN`. The address must not appear in `TEACHER_EMAILS` or any
  `TEST_*` list.

## What is built

| Area | State |
| --- | --- |
| Google sign-in, allowlists, device binding and review | ✅ built and tested |
| Rooms, classes, CSV/paste rosters and enrollment | ✅ built and tested |
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
| Demo seed/reset (`@demo.invalid`) | ✅ development only; 404 in production |
| PWA manifest, service worker, offline shell and dark theme | ✅ production build verified |
| Student cascade, automatic scoring, ID round, mobile app | ⛔ not built / gated |
| Real Google + physical-phone multi-wave rehearsal | ⏳ pending |

## Tests

| Gate | Result |
| --- | --- |
| Backend (`npm test`) | **160/160** |
| Backend (`npm test -- --test-isolation=none`) | **160/160** |
| Proof transport | **15/15** |
| Acoustic (codec, lab, worklets, TX/RX link) | **51/51** |
| Teacher check-in view | **7/7** |
| Student check-in view | **9/9** |
| Auth routing | **2/2** |
| Frontend total | **84/84** |
| Production build | ✅ compiles successfully (`CI=true`, same-origin API, empty hosted-domain hint) |
| Browser smoke (dev) | **65/65** |
| Production-mode Gmail-admin smoke | **13/13** |
| Mobile/dark smoke | **27/27** |
| Production PWA/offline smoke | **16/16** |

The browser smokes used a temporary Playwright setup outside the repo's npm test commands.
The backend suite covers auth policy, controllers, middleware, startup, env guards, origin
guard, cookies, rate limits, rosters, device binding, session core, wave advancement, proof
transport, teacher evidence, student discovery, rehearsal enrollment and super-admin access.

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
- **First-binding boundary:** a never-bound account auto-approves its first device, so a
  stolen session cookie can bind a device. Account/device theft is out of current scope.
- **Split-hosting CSRF:** the exact frontend origin must be in `CLIENT_URLS`.
- **Startup fails closed:** duplicate data that prevents a unique index stops the service;
  clean it before deploying.
- **Shared-store rate limiter:** needed if the service scales past one Render instance.
- **Old MongoDB data directory:** `~/data/db` is partially root-owned; use
  `~/data/db-attendance-dev` instead.
- **Render free tier:** confirm behaviour during a live 5–6 minute check-in.

## Recent session history

| Date | What changed | Result |
| --- | --- | --- |
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
cd attendance-frontend && CI=true REACT_APP_API_URL=/api/v1 npm run build
```
