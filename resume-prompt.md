# Resume prompt

Paste everything between the lines into a new session. Keep `agent.md`, `plan.md`,
`progress.md`, `docs/routes.md`, `docs/how-it-works.md` and `docs/diagrams/` in the project
folder.

---

I am continuing **Bio Attend** (Acoustic Presence Check-in): a web app that produces evidence
students were physically inside a 20 m × 20 m classroom by passing short-lived keys between
phones as near-ultrasonic tones. The teacher's phone stays at the front; student phones are
**1–10 m** away. Use **TX/RX** terminology. A **teacher confirms attendance** from the
evidence; a decoded tone is never an automatic verdict.

Before doing anything:

1. Read `agent.md`, then `plan.md`, then `progress.md`. Follow the rules in `agent.md`.
2. Open `docs/routes.md` and the relevant PlantUML diagram in `docs/diagrams/`
   (`system-components.puml`, `check-in-flow.puml`, `proof-transport.puml`).
3. Inspect the actual project files. If `progress.md` disagrees with the code, trust the code,
   correct `progress.md`, and tell me.
4. Tell me in a few lines: the current layer, the single slice you will work on, and its
   pass/fail test.

Current state (2026-11-09, session 27; details in `progress.md`):

- **Layer 1 is assumed passed by owner direction (2026-10-29) for build planning only. This
  is not a measurement.** The 2026-10-25 sweep recorded **1 m 10/10, 2 m 9/10, 3 m 9/10,
  5 m 4/10, 10 m 1/10** (33/50, 66%). Reverse direction and muted control are unmeasured.
  The 2026-10-24 5 m result is not a valid 5 m measurement. Never call the physical gate
  measured-passed.
- **The product is built:** teacher-confirmed attendance registers, 24-hour student queries,
  analytics, PDF/Excel exports, session history, notifications, timetable, profile/help,
  PWA/dark theme, and a production-capable super-admin console with users, classes, sessions,
  attendance overrides, queries, audit, settings, impersonation and development-only demo
  data.
- **P0 security is built:** strict CSP with an external theme bootstrap, first-party
  `SameSite=Lax` cookies, per-account `tokenVersion` revocation, impersonation hardening,
  teacher approval for first and replacement student devices, JWK sanitisation, encrypted
  backup/restore scripts, Dependabot and a GitHub security workflow.
- **P1 admin hardening is built and tested:** WebAuthn/passkey step-up for destructive
  super-admin actions (settings, role/status changes, session revocation, attendance
  override/delete, impersonation and demo reset). Missing approval returns **428** with
  `code: "step_up_required"`; a successful assertion sets a five-minute `HttpOnly`
  `admin_step_up` cookie scoped to `/api/v1/admin`. The first passkey is trust-on-first-use;
  adding another requires step-up. New audit rows carry `seq`, `prevHash` and a canonical
  SHA-256 `hash`; `GET /admin/audit/verify` verifies the chain and reports legacy rows.
  Exports are audited and limited to **30 downloads per 10 minutes** per account/IP.
  `/health/ready` returns 503 until MongoDB is connected, `JWT_SECRET_PREVIOUS` is
  verification-only during rotation, and the settings patch no longer causes a Mongo
  `$set`/`$setOnInsert` path conflict.
- **Acoustic proof remains evidence-only:** keys stay server-side, proofs are signed by the
  bound P-256 key, one proof per student/wave, 1-day TTL, wave advancement is teacher-only
  and evidence-gated. The student cascade, automatic scoring and the ID round are **not
  built**.
- **Super-admin:** exact-match `SUPER_ADMIN_EMAILS` environment grant. For this project:
  `12shivanshsingha@gmail.com`; admin sessions default to 12 hours. It must not overlap
  `TEACHER_EMAILS` or a `TEST_*` list. Demo routes return 404 in production.
- **Document ingestion has started:** **A1 roster PDF text extraction → editable preview**
  and **A2a timetable PDF text extraction → read-only preview** are built and tested with
  generated PDF fixtures. Both read only an embedded text layer, reject scanned pages and
  never save automatically. A1 fills the roster textarea for the existing preview/save; A2a
  never parses rows, matches classes, creates a class or writes a slot. A2b structured
  timetable import, local OCR (A3) and consent-gated Gemini extraction (A4) are not built.
- **Deployed test plan:** `docs/testing-plan.md` is the click-level run for 4 phones and 3–4
  laptops: acoustic range/controls, signed Render attendance/query flow with real college
  accounts, device/passkey/admin security, PDF previews, deployment verification and the
  conditional encrypted restore drill. Its G2 (live commit) and G5 (restore prerequisites)
  gates are hard stops. `attendance-backend/scripts/generate-test-pdfs.js` creates the
  synthetic text-layer and no-text-layer PDFs used by the preview tests.
- **Local gates:** backend **255/255** under `npm test` and `--test-isolation=none`;
  frontend **96/96** (proof 15, acoustic 51, check-in 7, student check-in 9, auth 2, roster
  import 6, timetable import 6); the clean
  `CI=true REACT_APP_API_URL=/api/v1 npm run build` compiles successfully. The WebAuthn
  browser E2E passed with a Chrome virtual authenticator: 428 before enrollment, passkey
  registration, five-minute cookie, settings retry and a 3-entry verified audit chain with
  zero console errors.
- **Other recorded smokes:** dev **65/65**, production-mode Gmail-admin **13/13**, mobile/dark
  **27/27**, production PWA/offline **16/16**, CSP production-build audit **7/7** page loads.
  These use temporary browser harnesses, not repo npm commands.
- **Repository:** local `HEAD`, `origin/main` and `origin/HEAD` are all **`003f900`**; the
  A1 roster PDF slice, A2a timetable text preview, P0/P1 security, PWA and dark-mode work are
  committed and pushed. The earlier `32a2078`/“A2a uncommitted” claims were stale and were
  corrected on 2026-11-09. The live service is reachable and its bundle contains A2a UI
  strings, but the exact Render commit was not checked against the dashboard; do not assume
  it matches `003f900`. No push, tag, merge or deploy has been performed. The owner reviews,
  commits, pushes and deploys manually.
- **Next action:** execute `docs/testing-plan.md` in order. Pass G0–G7 first; G2 requires the
  owner to compare the Render dashboard commit with the recorded `HEAD`, and G5 checks the
  Atlas URI, passphrase, `mongodump`/`mongorestore` and scratch-database permission. Stop
  signed testing if G2 fails; mark the restore suite **BLOCKED** if G5 fails. Then run
  **AC → FL → AD → PDF → DP/RS** and record real results. **A2b structured timetable import**
  comes only after representative timetable PDFs are supplied. Match course code/section to
  an existing owned class, show a slot preview and require teacher confirmation; flag
  unmatched rows for manual class creation. Do not invent parser behaviour or claim accuracy
  without samples. Timetable import must never create a class automatically or overwrite a
  slot without the teacher seeing the change. Local OCR (A3) follows. Roster import must
  preview and require teacher confirmation; never auto-save a roster or auto-mark attendance.
  Use free options only and never require a payment card.
- **Gemini gate:** raw rosters may go to the free tier only after an explicit student notice
  and a documented risk acceptance are written into `plan.md`. That text does not exist yet;
  do not write the AI path before it does.
- **Remaining blockers:** a verified live Render commit (G2), sample PDFs, the Gemini
  consent/risk text, the encrypted Atlas restore drill (needs URI, passphrase,
  `mongodb-database-tools` and scratch-database permission), a real Google/phone multi-wave
  rehearsal through the deployed plan, and physical 5 m/10 m range diagnosis with
  reverse/muted control.
- **Production environment additions:** `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com`,
  `SUPER_ADMIN_SESSION_HOURS=12`, an HTTPS `WEBAUTHN_ORIGINS` (or Render's
  `RENDER_EXTERNAL_URL`), optional `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_NAME`, and an empty/unset
  `REACT_APP_GOOGLE_HOSTED_DOMAIN`. Register a passkey under **Admin → Security** after the
  first deploy. The temporary WebAuthn E2E server is stopped and its throwaway Mongo
  databases were dropped.

Rules for this session:

- Build only one small slice, test it, and record the real result in `progress.md`.
- Start the next slice only if this one passed. If it failed, fix it or stop and report.
- Do not add automatic scoring, the ID round, the student cascade, or any exposure of keys or
  key history to students. Attendance is teacher-confirmed and audited.
- Do not weaken or bypass passkey step-up, the audit hash chain, export limits, readiness or
  the teacher device-approval boundary.
- PDF/timetable imports must follow **extract → preview → teacher confirms**. Never create
  classes automatically from a timetable and never auto-save imported rosters.
- Do not use a paid service, a free tier that requires a card, or send raw rosters to an LLM
  before the consent notice and risk acceptance exist in `plan.md`.
- **Do not push, tag, merge or deploy.** The owner controls all publication.
- Do not invent state you cannot see.
- If a route, component, endpoint or gate changes, update `docs/routes.md`, the matching
  `docs/diagrams/*.puml` and every affected Markdown file in the same session.
- At the end, update `progress.md` and give me an updated resume prompt if the next slice
  changed.

Context from `plan.md`: Android + Chrome first, phones from 2020 or later; no room hardware;
teacher's phone only starts the process; server mints keys; location is optional evidence;
college Google accounts plus a class roster for identity; teacher owns the register; queries
are open for 24 hours after the session closes. Test accounts are env-gated and non-college;
`TEACHER_EMAILS` and real rosters are college-only, with the non-production-only
`ALLOW_TEST_ROSTER_EMAILS` rehearsal exception for exact test students. The code is built for
one Render instance; the audit-chain serialisation and in-memory rate limits assume that.

---

Short version if the files are unavailable:

> Read `agent.md`, `plan.md`, `progress.md` and `docs/routes.md` first. Work on exactly one
> small slice, test it, record the real result, and move on only if it passed. The product
> includes teacher-confirmed attendance, queries, analytics, exports, a production
> super-admin console, passkey step-up and an audit hash chain. Acoustic proof is evidence-only.
> Backend **255/255**, frontend **96/96**. A1 roster PDF extraction and A2a timetable PDF
> text preview are built; A2b structured timetable import is next but needs representative
> timetable PDFs, and the Gemini consent/risk text is still missing, so ask before building.
> Physical 5 m/10 m range work, reverse/muted control and a real Google/phone rehearsal remain
> open. Layer 1 is an owner assumption for build planning only, not a measured pass. Never
> push, tag, merge or deploy.
