# agent.md: Rules for any AI agent working on this project

Read this file, then `plan.md`, then `progress.md`, in that order, **before doing anything
else in every session**. Do not rely on memory of earlier sessions. Open
[`docs/routes.md`](docs/routes.md) before changing a page/API path, and
[`docs/diagrams/`](docs/diagrams/) before changing architecture or flow.

## Project in one paragraph

A web app (Chrome on Android first) that produces evidence students were physically inside a
20 m × 20 m classroom by passing short-lived keys between phones as near-ultrasonic tones.
The server mints keys, records signed proof evidence and keeps an audited attendance
register. A **teacher confirms attendance**; a decoded tone is not an automatic verdict.
Full detail is in `plan.md`; do not restate or redesign it here.

## Current phase (2026-11-09, session 27)

- **Layer 1 is assumed passed by owner direction (2026-10-29) for build planning only.** This
  is **not** a measured pass. The 2026-10-25 sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at
  3 m, **4/10 at 5 m** and **1/10 at 10 m**; the reverse direction and muted control are
  unmeasured. The 2026-10-24 5 m claim was not a true 5 m result. Never describe the physical
  gate as measured-passed.
- **The product is built through the attendance/admin layer:** Google sign-in, classes,
  rosters, teacher-approved device binding, check-in sessions, signed proof evidence, student
  discovery and shell, evidence-gated wave advancement, teacher evidence view,
  teacher-confirmed register, 24-hour queries, analytics, PDF/Excel exports, session history,
  notifications, timetable, profile/help, PWA/dark theme and a production-capable super-admin
  console.
- **P0 and P1 security are built and tested locally:** strict CSP, first-party cookies,
  `tokenVersion` session revocation, impersonation hardening, teacher-approved first device
  binding, WebAuthn/passkey step-up (5-minute `admin_step_up` cookie, **428** without it),
  SHA-256 audit hash chain plus verification, audited/rate-limited exports,
  `/health/ready`, verification-only `JWT_SECRET_PREVIOUS` rotation and the settings
  `$set`/`$setOnInsert` conflict fix.
- **Acoustic proof remains evidence-only.** The proof endpoint does not mark attendance or
  score. The teacher opens the register, sees evidence/optional location and marks
  present/absent/excused; finalisation and every correction are audited. Scoring, the ID
  round and the student cascade remain unbuilt.
- **Repository state (2026-11-09):** local `HEAD`, `origin/main` and `origin/HEAD` are all
  **`003f900`**, which includes the A1 roster PDF slice, A2a timetable text preview, P0/P1
  security, PWA and dark-mode work. The earlier `32a2078` claims in the status docs are stale
  and were corrected in session 27. The live service is reachable and its bundle contains A2a
  strings, but the exact deployed commit was **not verified against the Render dashboard**;
  do not claim the deployment matches the repository without checking.
- **Deployed test plan:** [`docs/testing-plan.md`](docs/testing-plan.md) is the execution
  script for the 4-phone/3–4-laptop run. It covers acoustic range and controls, the signed
  attendance/query flow on Render with real college accounts, device/passkey/admin security,
  PDF previews, deployment verification and the conditional encrypted restore drill.
- **Test PDF fixtures:** `attendance-backend/scripts/generate-test-pdfs.js` writes synthetic
  text-layer roster/timetable PDFs and a no-text-layer PDF to the gitignored `test-artifacts/`
  directory. It verifies each file through `extractPdfText` before exiting.
- **The owner controls every push and deploy.** Never push, tag, merge, or deploy unless the
  owner explicitly asks in that session. A green local suite is not permission to publish.
- **Roster PDF extraction is built (A1):** an authenticated teacher uploads a text-based
  PDF to `POST /classes/:classId/roster/pdf/preview`; the server extracts the text layer with
  PDF.js, returns editable text and the teacher still runs the normal validation preview and
  confirms the save. Scanned PDFs are rejected; nothing is auto-saved. The path is tested with
  generated PDF fixtures, **not real college PDFs**; do not claim layout accuracy without
  samples.
- **Timetable PDF text preview is built (A2a):** a teacher or super-admin uploads a text-based
  PDF to `POST /timetable/pdf/preview`; the server returns a **read-only** text preview with
  page/line counts. It never parses rows, matches classes, creates a class or writes a slot.
  The teacher adds slots through the existing form. Tested with generated PDF fixtures, not
  real timetable PDFs.
- **Next build slice (A2b), after the deployed test run:** structured timetable row parsing,
  then local OCR, then optional Gemini extraction. **No sample timetable or roster PDFs have
  been supplied yet**, so do not invent parser behaviour or claim extraction accuracy.
  Structured timetable import must schedule existing classes only; unmatched rows are flagged
  for manual class creation. Local OCR comes after text-layer extraction, and optional Gemini
  extraction comes last.
- **Gemini gate:** raw rosters may go to the free tier only after an explicit student notice
  and a documented risk acceptance are written into `plan.md`. That text does not exist yet;
  do not write the AI path before it does.
- **Still blocked:** automatic scoring, the ID round, the student cascade, the "lowest wave
  heard" join rule, the mobile app, a verified live Render commit, the real Google/phone
  multi-wave rehearsal in the deployed plan, physical 5 m/10 m range diagnosis with
  reverse/muted control, and the encrypted Atlas restore drill (URI, passphrase,
  `mongodb-database-tools` and scratch-database permission are unconfirmed).

## Core working rule: small slices, one session at a time

1. Build **one small slice** per session, as listed in `progress.md`/`plan.md`. A slice should
   be buildable and testable in one sitting.
2. Test the slice before calling it done.
3. Start the **next** slice only if the current one passed. If it failed, fix it or stop and
   report; do not stack new work on an unverified base.
4. If a slice is too big, split it in `progress.md` before continuing.
5. Never build ahead of a gate unless the owner explicitly allows a band-independent slice.
   Scoring and the ID round still require a genuinely measured Layer 1 decision.

## Session start checklist

- [ ] Read `agent.md`, `plan.md`, `progress.md`.
- [ ] Before a deployed test run, read `docs/testing-plan.md` and execute its preflight gates.
- [ ] Open the relevant route/diagram before changing architecture or flow.
- [ ] Inspect the actual files. If `progress.md` and the code disagree, trust the code, then
      correct `progress.md` and tell the owner.
- [ ] State the one slice and its pass/fail test before writing code.
- [ ] If anything is ambiguous, name it and ask. Do not pick silently.

## Session end checklist

- [ ] Run the slice's test and record the real result.
- [ ] Update `progress.md`: status, files touched, test result, next slice, blockers.
- [ ] If a decision changed, update `plan.md`.
- [ ] If a component, endpoint, gate or flow changed, update `docs/routes.md`, the matching
      `docs/diagrams/*.puml` and re-render it.
- [ ] Keep `README.md`, `docs/README.md`, `docs/getting-started.md`, `agent.md`,
      `resume-prompt.md` and other docs consistent with current counts and production state.
- [ ] Give the owner a short summary and an updated resume prompt if the next slice changed.

## Coding principles

- **Think before coding:** state assumptions, surface trade-offs, push back if a simpler
  approach exists.
- **Simplicity first:** minimum code for the slice. No speculative features or abstractions.
- **Surgical changes:** touch only what the slice needs. Match existing style. Mention
  unrelated problems instead of fixing them.
- **Goal-driven:** write the verifiable pass/fail criterion first, then loop until verified.
- **Evidence over claims:** "built" means code exists; "tested" means a named test or
  measurement passed; "deployed" means the owner published it and it was verified live.

## Testing

- Prefer synthetic tests first: encode/decode buffers, noise, echo, API/controller tests.
- Then real-device tests in small steps: one tone, one frame, then distance.
- Real-device results (model, Android/Chrome version, distance, sent/decoded, band) go in
  `progress.md` and `measurements/YYYY-MM-DD/`. Do not claim a physical result you did not
  measure.
- Never report "works" for something only reasoned about.

Current local gate (all must pass before asking the owner to deploy):

```bash
cd attendance-backend && npm test                              # 255/255
cd attendance-backend && npm test -- --test-isolation=none     # 255/255
cd attendance-frontend && npm run test:proof                    # 15/15
cd attendance-frontend && npm run test:acoustic                 # 51/51
cd attendance-frontend && npm run test:checkin                  # 7/7
cd attendance-frontend && npm run test:studentcheckin           # 9/9
cd attendance-frontend && npm run test:auth                     # 2/2
cd attendance-frontend && npm run test:rosterimport             # 6/6
cd attendance-frontend && npm run test:timetableimport          # 6/6
```

Production build (same API path and empty hosted-domain hint as the deployed site):

```bash
cd attendance-frontend
CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=690196150991-39rsb4sffjvfl66jt22unp0uulhfgu5m.apps.googleusercontent.com \
  REACT_APP_GOOGLE_HOSTED_DOMAIN= \
  npm run build
```

Also keep the recorded HTTP/browser smokes current: proof guards/accept/retry/wrong key/
expiry/close/race/rate limit/indexes; session discovery; student shell consent/expiry/
device-review; teacher advance/evidence; attendance register/query; production admin/demo
checks. A pure unit test is not enough for those routes.

## Architecture and code map

- `attendance-frontend/` — React SPA: public pages, role dashboards, classes, check-in,
  attendance, queries, exports, sessions, admin, notifications, timetable, profile, help,
  sound lab, TX/RX and the student shell.
- `attendance-backend/` — Express API: Google sign-in, classes/rosters, text-layer PDF roster
  and timetable previews, teacher-approved device binding, check-in sessions, proof transport,
  attendance register, queries, exports, notifications, timetable, admin, passkey step-up,
  audit hash chain, startup/index readiness and CSRF origin guard.
- `docs/routes.md` — every page/API path and its access rule.
- `docs/diagrams/` — `system-components.puml`, `check-in-flow.puml`,
  `proof-transport.puml`.
- `plan.md` — what and why. `progress.md` — status and measurements.
  `resume-prompt.md` — how to restart a session.

## Hard boundaries

- **Acoustic proof is evidence, not attendance.** Do not add an automatic `present` flag,
  score or ID-round decision to the proof path. The response keeps
  `attendanceDecided: false`. Attendance lives in the separate teacher register.
- **Wave advancement is teacher-only and evidence-gated.** It does not live on the proof
  path. It must refuse a closed session or a wave with no accepted proof.
- **Keys and key history stay server-side.** Students receive only the current wave and
  expiry. The teacher view returns the current key but a key-free `waveHistory`. Evidence
  returns no key, signature, protocol version or device fingerprint.
- **The proof endpoint stays student-only and roster-bound.** Only an enrolled, active
  student with an approved device binding may submit. A pending device change blocks proofs.
- **The device signature is bound to session, wave, key and student.** Do not shorten,
  reorder or version-drift the canonical message without updating both client and server and
  the cross-package tests.
- **One proof per student per wave.** The unique index is the real guard; find-then-create is
  only an optimization. Never remove the index or the `11000` race handling.
- **Proof evidence expires after one day** through the TTL index.
- **Startup order is `connect → every model init() → listen`.** If an index cannot build, the
  service must exit rather than serve without constraints.
- **Unsafe cross-origin requests are rejected.** The origin guard runs before routes.
  Split hosting needs the exact frontend origin in `CLIENT_URLS`.
- **Logout is POST-only.** Do not add a GET mutation back.
- **Teacher's phone stays at the front; student phones are 1–10 m away.** Use **TX/RX**
  terminology in reports and diagrams.
- **Test accounts are env-gated and non-college.** `TEACHER_EMAILS` and real rosters are
  college-only. `ALLOW_TEST_ROSTER_EMAILS` is non-production only. Dev personas never join a
  roster.
- **Super-admin is an exact-match environment grant.** No UI role toggle, no hardcoded
  privileged email in source. `SUPER_ADMIN_EMAILS` must be disjoint from every other list.
  Demo routes must remain 404 in production.
- **Destructive super-admin actions stay passkey-protected.** Never bypass
  `requireAdminStepUp`, never derive WebAuthn origins from a request header, and never
  auto-approve a production first passkey outside the documented trust-on-first-use flow.
- **Audit integrity stays append-only.** New entries keep `seq`, `prevHash` and the canonical
  SHA-256 `hash`; never rewrite legacy rows to make verification pass. Exports stay audited
  and rate-limited.
- **PDF/timetable ingestion is extract → preview → teacher confirms.** Never auto-save an
  imported roster, never create classes from a timetable, and never mark attendance from an
  import. The timetable route currently returns a read-only text preview only: it does not
  parse rows, match classes or write slots. An unmatched timetable row is flagged for manual
  class creation once structured parsing is built. The current extractor reads only an
  embedded text layer; never present OCR output as implemented until local OCR is actually
  built and tested.
- **No room hardware.** The teacher's ordinary phone starts the process and is never passed
  around.
- **Mic/audio need a user tap and HTTPS.** Disable echoCancellation, noiseSuppression and
  autoGainControl; refuse below 44.1 kHz.
- **The server mints keys.** Phones never invent keys.
- **The ID round is still required.** A decoded key is data and can be forwarded. Never claim
  a stored proof proves physical presence.

## Things not to do

- Do not push, deploy or change production configuration without an explicit owner request.
- Do not invent project state. If you cannot see it, say so.
- Do not skip reading the core files because the task looks small.
- Do not mark a slice done without a recorded test result.
- Do not start the mobile app or later layers early.
- Do not change tone/symbol/threshold values in `plan.md` without a measurement; record it in
  `progress.md`.
- Do not store more personal data than `plan.md` allows.
- Do not describe proof evidence as attendance or proof of physical presence.

## Reporting style

Short and plain. Say what was done, what was tested, the real result and what comes next.
Flag assumptions and anything you could not verify.
