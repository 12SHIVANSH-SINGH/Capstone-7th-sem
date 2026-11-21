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

## Current phase (2026-11-21, session 31)

- **Layer 1 is assumed passed by owner direction (2026-10-29) for build planning only.** This
  is **not** a measured pass. The 2026-10-25 sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at
  3 m, **4/10 at 5 m** and **1/10 at 10 m**; the reverse direction and muted control are
  unmeasured. The 2026-10-24 5 m claim was not a true 5 m result. Never describe the physical
  gate as measured-passed.
- **The product is built through the attendance/admin layer:** Google sign-in, classes,
  rosters, teacher-approved device binding, check-in sessions, signed proof evidence, student
  discovery and shell, the server-minted phone-to-phone relay cascade, teacher-confirmed
  register, 24-hour queries, analytics, PDF/Excel exports, session history, notifications,
  timetable, profile/help, PWA/dark theme and a production-capable super-admin console. The
  cascade is built and locally tested but has **not** been measured in a physical classroom;
  owner-reported classroom attempts remain planning evidence, not measured results.
- **P0 and P1 security are built and tested locally:** strict CSP, first-party cookies,
  `tokenVersion` session revocation, impersonation hardening, teacher-approved first device
  binding, WebAuthn/passkey step-up (5-minute `admin_step_up` cookie, **428** without it),
  SHA-256 audit hash chain plus verification, audited/rate-limited exports,
  `/health/ready`, verification-only `JWT_SECRET_PREVIOUS` rotation and the settings
  `$set`/`$setOnInsert` conflict fix.
- **Acoustic proof remains evidence-only.** The proof endpoint does not mark attendance or
  score. A valid proof earns the server-minted next relay signal, but it never marks a
  student present. The teacher opens the register, sees evidence/optional location and marks
  present/absent/excused; finalisation and every correction are audited. Scoring and the ID
  round remain unbuilt.
- **Repository state (2026-11-21):** local `HEAD`, `origin/main` and `origin/HEAD` are all
  **`7148994`** (“security scan lapse”), which includes the committed phone-to-phone cascade,
  its tests and docs, and the Mongoose `8.24.10` security patch. The owner reports the Render
  dashboard shows the same commit. The working tree now adds the 2026-11-21 register fixes
  (proof-load errors are visible, note-only edits save, and the dashboard Register link opens
  the exact session) plus the new `test:attendance` suite. Commit, push, redeploy and re-run
  gate G2 before signed testing.
- **Deployed test plan:** [`docs/testing-plan.md`](docs/testing-plan.md) is the execution
  script for the 4-phone/3–4-laptop run. It covers acoustic range and controls, the signed
  attendance/query flow on Render with real college accounts — including the automatic
  phone-to-phone cascade and teacher fallback — device/passkey/admin security, PDF previews,
  deployment verification and the conditional encrypted restore drill.
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
- **Next work:** finish verification before adding ingestion. Commit/push/deploy the 2026-11-21
  register fixes, run G0–G7 and AC → FL → AD → PDF → DP/RS, then measure the physical cascade
  and range. Only then build **A2b** structured timetable import, **A3** local OCR and **A4**
  optional Gemini extraction. A2b needs representative timetable PDFs; A4 needs the owner to
  date and sign the accepted copy of the draft notice and risk text now in `plan.md` §12
  (D1–D5). The capstone submission pack comes last. Moving to a new Mac:
  [`docs/new-device-handoff.md`](docs/new-device-handoff.md).
- **Gemini gate:** raw rosters may go to the free tier only after the exact student notice,
  data-field list, retention/training risk, dated owner acceptance and opt-out fallback are
  settled in `plan.md`. The draft exists, but D4 is unsigned; do not write the AI path yet.
- **Still blocked:** automatic scoring, the ID round, the "lowest wave heard" join rule, the
  mobile app, the real Google/phone phone-to-phone cascade rehearsal in the deployed plan,
  physical 5 m/10 m range diagnosis with reverse/muted control, representative timetable
  PDFs, the owner's signed Gemini acceptance (D4), and the encrypted Atlas restore drill (URI, passphrase,
  `mongodb-database-tools` and scratch-database permission are unconfirmed). The owner has
  confirmed Render showed `7148994`; re-check G2 after the next deploy.

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
cd attendance-backend && npm test                              # 262/262
cd attendance-backend && npm test -- --test-isolation=none     # 262/262
cd attendance-frontend && npm run test:proof                    # 15/15
cd attendance-frontend && npm run test:acoustic                 # 51/51
cd attendance-frontend && npm run test:checkin                  # 10/10
cd attendance-frontend && npm run test:attendance               # 7/7
cd attendance-frontend && npm run test:studentcheckin           # 12/12
cd attendance-frontend && npm run test:auth                     # 2/2
cd attendance-frontend && npm run test:rosterimport             # 6/6
cd attendance-frontend && npm run test:timetableimport          # 6/6
# frontend helper total: 109/109
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
  `resume-prompt.md` — how to restart a session. `docs/new-device-handoff.md` — how to move
  the project to a new Mac and continue.

## Hard boundaries

- **Acoustic proof is evidence, not attendance.** Do not add an automatic `present` flag,
  score or ID-round decision to the proof path. The response keeps
  `attendanceDecided: false`. Attendance lives in the separate teacher register.
- **Wave advancement is server-driven on accepted proof, with a teacher-only, evidence-gated
  manual fallback.** A valid proof for the current round mints a pending next signal and
  returns it to that proving phone. A valid proof for the pending round atomically promotes
  it and mints the following pending signal. The teacher's manual Advance must refuse a
  closed session or a round with no accepted proof, and it must preserve the original expiry
  of a fresh pending key. Never auto-mark attendance from an advance.
- **Keys and key history stay server-side; phones never invent keys.** Students receive the
  wave and expiry from discovery, and only the proving student receives the server-minted
  next signal in the proof response. A student may try the displayed wave and the next two
  because an acoustic frame carries only the key; the server accepts only its current or
  pending round. The active teacher view returns the current key and pending signal but a
  key-free `waveHistory`; a closed session returns neither current key nor pending. Evidence
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
- **Teacher's phone stays at the front; student phones are 1–10 m away.** It plays round 0
  and the manual nudge; later rounds are carried by phones whose evidence was accepted. Use
  **TX/RX** terminology in reports and diagrams.
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
