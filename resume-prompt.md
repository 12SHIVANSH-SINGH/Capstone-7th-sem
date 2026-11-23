# Resume prompt

Paste everything between the lines into a new session. Keep `agent.md`, `plan.md`,
`progress.md`, `docs/routes.md`, `docs/how-it-works.md`, `docs/new-device-handoff.md` and
`docs/diagrams/` in the project folder.

---

I am continuing **Bio Attend** (Acoustic Presence Check-in): a web app that produces evidence
students were physically inside a 20 m × 20 m classroom by passing short-lived keys between
phones as near-ultrasonic tones. The teacher's phone stays at the front; student phones are
**1–10 m** away. Use **TX/RX** terminology. A **teacher confirms attendance from the evidence
by default**; a decoded tone is not an automatic verdict. The teacher may explicitly enable
auto-present for one live session, and that decision is audited and reversible.

Before doing anything:

1. Read `agent.md`, then `plan.md`, then `progress.md`. Follow the rules in `agent.md`.
2. On a new Mac, read `docs/new-device-handoff.md` first: clone, `npm ci` in both projects,
   restore the gitignored `attendance-backend/config/config.env`, start MongoDB, run the gate,
   then verify the deployment.
3. Open `docs/routes.md` and the relevant PlantUML diagram in `docs/diagrams/`
   (`system-components.puml`, `check-in-flow.puml`, `proof-transport.puml`).
4. Inspect the actual project files. If `progress.md` disagrees with the code, trust the code,
   correct `progress.md`, and tell me.
5. Tell me in a few lines: the current layer, the single slice you will work on, and its
   pass/fail test.

Current state (2026-11-23, session 33; details in `progress.md`):

- **Layer 1 is assumed passed by owner direction (2026-10-29) for build planning only. This
  is not a measurement.** The 2026-10-25 sweep recorded **1 m 10/10, 2 m 9/10, 3 m 9/10,
  5 m 4/10, 10 m 1/10** (33/50, 66%). Reverse direction and muted control are unmeasured.
  The 2026-10-24 5 m result is not a valid 5 m measurement. Never call the physical gate
  measured-passed.
- **The product is built:** teacher-confirmed attendance registers with evidence filtering,
  one-click accept, draft-only bulk marking, expandable proof/location detail and quick
  session PDF/XLSX exports; 24-hour student queries; analytics; session history;
  notifications; timetable; profile/help; PWA/dark theme; and a production-capable super-admin
  console with users, classes, sessions, attendance overrides, queries, audit, settings,
  impersonation and development-only demo data.
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
- **Acoustic proof remains evidence-only by default:** keys stay server-side, proofs are
  signed by the bound P-256 key, one proof per student/wave and the TTL is about one day. The
  phone-to-phone cascade is **committed in `b1e31f6`** and included in the owner-confirmed
  Render deployment **`7148994`**. A valid proof for the current round mints a server-side
  pending next key and returns it to the proving phone; a valid proof for the pending round
  atomically promotes it and mints the following key. Accepted or duplicate proving phones
  relay the returned signal three times, then listen again. The teacher starts and plays
  round 0 in one tap, stops old audio on auto-advance, and keeps **Nudge** plus an
  evidence-gated **Advance round** fallback. Closed sessions expose neither key nor pending
  state. Automatic scoring and the ID round are **not built**. No physical cascade rehearsal
  has been measured; owner-reported classroom attempts are planning evidence only.
- **Auto-present is a per-session opt-in:** off by default, teacher-owned, writable only while
  the session is live and unfinalised, and audited. The first accepted proof updates only a
  still-pending row to present with source `evidence`; a manual teacher decision always wins.
  The proof response reports `attendanceStatus`/`autoMarked` so the student UI is truthful.
- **Register/evidence slice is in `d98bec1`:** the 2026-11-21 fixes (retryable proof-load
  errors, note-only saves, exact dashboard Register deep link) and the 2026-11-22 workflow
  (evidence filter, draft-only bulk accept, expandable proof detail, quick session exports,
  current-device status) are committed in **`d98bec1`** on `main`. The working tree still has
  two production-build fixes: `globalThis` → `window` in `src/utils/deviceFingerprint.js` and
  an unused variable removed from `SessionAttendanceModal.jsx`. **The committed frontend fails
  `CI=true` because of the `globalThis` lint error; commit the working-tree fix before any
  deploy.**
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
- **Local gates (fully re-run 2026-11-23):** backend
  **271/271** under `npm test` and `npm test -- --test-isolation=none`; frontend **120/120**
  (proof 15, acoustic 51, teacher check-in 10, attendance/evidence 12, student check-in 14,
  auth 2, device fingerprint 4, roster import 6, timetable import 6); the clean
  `CI=true REACT_APP_API_URL=/api/v1 npm run build` compiles successfully. The WebAuthn
  browser E2E passed with a Chrome virtual authenticator: 428 before enrollment, passkey
  registration, five-minute cookie, settings retry and a 3-entry verified audit chain with
  zero console errors.
- **Other recorded smokes:** dev **65/65**, production-mode Gmail-admin **13/13**, mobile/dark
  **27/27**, production PWA/offline **16/16**, CSP production-build audit **7/7** page loads.
  These use temporary browser harnesses, not repo npm commands.
- **Repository:** local `HEAD`, `origin/main` and `origin/HEAD` are all **`d98bec1`**
  (`it-14`), containing the committed cascade, the 2026-11-21 register fixes and the
  2026-11-22 evidence/device/auto-present slice. The last owner-confirmed Render deploy is
  **`7148994`**; G2 is not yet satisfied. The working tree contains the two production-build
  fixes and reconciled docs, **uncommitted**. The owner reviews, commits, pushes and deploys
  manually; no push, tag, merge or deploy has been performed in this session.
- **Completion order for the final week:** (1) commit/push/deploy the build fix and the
  2026-11-22 slice, then re-run G2; (2) execute `docs/testing-plan.md` gates G0–G7, then
  **AC → FL → AD → PDF → DP/RS** with the available 4 phones and 3–4 laptops, recording
  PASS/FAIL/BLOCKED with evidence; (3) run the physical range diagnosis and the
  phone-to-phone cascade rehearsal and record real measurements; (4) build **A2b** with
  representative timetable PDFs, then **A3** local OCR, then **A4** only if the drafted
  consent/risk text is dated and signed; (5) assemble the capstone submission pack from
  recorded results only.
- **A2b gate:** match course code/section to an existing owned class, show a slot preview and
  require teacher confirmation; flag unmatched rows for manual class creation. Do not invent
  parser behaviour or claim accuracy without real samples. Timetable import must never create
  a class automatically or overwrite a slot without the teacher seeing the change.
- **Gemini gate:** `plan.md` §12 has a draft student notice, data-field list, free-tier
  retention/training risk, opt-out fallback and dated owner-acceptance block (D4). D4 is
  unsigned, so do not write the AI path; raw rosters stay server-side until the owner signs.
- **Remaining blockers:** committing the build fix and deploying the 2026-11-22 slice plus a
  fresh G2 check, representative timetable PDFs, the signed Gemini acceptance (D4), the
  encrypted Atlas restore drill (needs URI, passphrase, `mongodb-database-tools` and
  scratch-database permission), a real Google/phone cascade rehearsal through the deployed
  plan, and physical 5 m/10 m range diagnosis with reverse/muted control. The reported
  “all approved devices re-requested” case still needs origin/browser details to diagnose.
- **Production environment additions:** `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com`,
  `SUPER_ADMIN_SESSION_HOURS=12`, an HTTPS `WEBAUTHN_ORIGINS` (or Render's
  `RENDER_EXTERNAL_URL`), optional `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_NAME`, and an empty/unset
  `REACT_APP_GOOGLE_HOSTED_DOMAIN`. Register a passkey under **Admin → Security** after the
  first deploy. The temporary WebAuthn E2E server is stopped and its throwaway Mongo
  databases were dropped.

Rules for this session:

- Build only one small slice, test it, and record the real result in `progress.md`.
- Start the next slice only if this one passed. If it failed, fix it or stop and report.
- Do not add automatic scoring or the ID round, and do not expose keys or key history to
  students beyond the server-minted next signal in their own proof response. Preserve the
  one-proof-per-student-per-round rule, the current/pending acceptance boundary and the
  evidence-only default. The only automatic attendance write allowed is the per-session,
  teacher-enabled auto-present path: pending rows only, audited, manually overridable.
  Attendance is otherwise teacher-confirmed and audited.
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

> Read `agent.md`, `plan.md`, `progress.md` and `docs/routes.md` first. On a new Mac, start
> with `docs/new-device-handoff.md`. Work on exactly one small slice, test it, record the real
> result, and move on only if it passed. The product includes teacher-confirmed attendance,
> queries, analytics, exports, a production super-admin console, passkey step-up and an audit
> hash chain. Acoustic proof is evidence-only by default; auto-present is a per-session,
> audited teacher opt-in. Backend **271/271**, frontend **120/120**, production build green
> with the working-tree build fix. `HEAD`/`origin/main` are `d98bec1`; the last
> owner-confirmed Render deploy is `7148994`, so G2 is pending. The committed frontend needs the
> uncommitted `globalThis` → `window` fix before it can build under `CI=true`. A1 roster PDF
> extraction and A2a timetable PDF text preview are built; A2b structured timetable import is
> next but needs representative timetable PDFs, and the Gemini consent/risk draft is
> unsigned, so ask before building. Physical 5 m/10 m range work, reverse/muted control, the
> real Google/phone cascade rehearsal and the Atlas restore drill remain open. Layer 1 is an
> owner assumption for build planning only, not a measured pass. Never push, tag, merge or
> deploy.
