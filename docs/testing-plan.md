# Bio Attend — deployed manual test plan

**Plan version:** 1.0  
**Written:** 2026-11-09  
**Application:** [https://bio-attend.onrender.com](https://bio-attend.onrender.com)  
**Repository state at writing:** `003f900` on `main` (A2a committed)  
**Owner:** project owner (deploy, environment, accounts)  
**Status:** ready to execute after the preflight gates in §3 pass

This plan tells one small test team exactly what to open, tap, type, observe and record. It
covers five areas:

| Area | Suite | What it proves |
| --- | --- | --- |
| Acoustic range and controls | **AC** | A phone can play and another phone can decode the tone at real distances, in both directions, and does not decode a muted signal |
| Signed attendance and queries | **FL** | A teacher and three or more real college students can complete the full evidence → register → finalise → query → approval → export flow |
| Device approval and admin security | **AD** | Device review, passkey step-up, session revocation, audit chain and export limits cannot be bypassed |
| PDF previews and imports | **PDF** | Roster and timetable PDFs only ever fill a review surface; nothing is auto-saved and no slot is created by extraction |
| Deployment and restore | **DP / RS** | The live deployment is the reviewed commit, production refuses test-only features, and the encrypted backup can be restored |

The plan is deliberately **evidence-only**. A decoded tone records evidence; it never marks a
student present. If any step makes attendance change without a teacher action, that step is a
**FAIL**, even if the rest of the flow looks correct.

---

## 1. Rules of engagement

### 1.1 Environment

- The signed end-to-end flow runs **only against the deployed Render URL**. Do not substitute a
  local build for a deployed result.
- Local commands are used only for preflight checks, PDF fixture generation and the encrypted
  backup/restore drill.
- Do not deploy, push, tag, merge or change production environment variables during the test.
  If the live commit does not match the reviewed commit, stop and ask the owner to deploy.

### 1.2 People and data

- Use a **dedicated test class**, not a real class with real attendance obligations.
- The teacher and every student in the signed flow use **real `@nitjsr.ac.in` Google accounts**.
  The production deployment refuses `ALLOW_TEST_ROSTER_EMAILS`, so Gmail test students cannot
  join a production roster.
- The super-admin account is the owner's production super-admin. It may be a Gmail address
  because `SUPER_ADMIN_EMAILS` is a separate environment grant. It is used only for admin
  security tests; it is not part of the student attendance flow.
- Tell every participant what is recorded: account email, device/browser details, check-in
  evidence, optional location and screenshots. Obtain their consent before the run.
- Never record a password, Google token, session cookie, passkey private key, backup
  passphrase or full database URI in a result table, screenshot or chat message.

### 1.3 Result vocabulary

Use exactly these words:

| Word | Meaning |
| --- | --- |
| **PASS** | The expected result was observed and the evidence is attached |
| **FAIL** | The expected result was not observed; a defect ID is recorded |
| **BLOCKED** | The test could not run because a prerequisite is missing |
| **NOT RUN** | The test was deliberately skipped or time ran out |

Do not write "works", "looks fine" or "probably". Write what you saw and where the evidence is.

### 1.4 Stop rules

Stop the affected suite and tell the owner if any of these happens:

1. The live commit does not match the reviewed commit.
2. A student can submit proof without an approved device.
3. Attendance becomes present without a teacher marking or approving a query.
4. A super-admin protected action succeeds without a passkey.
5. The audit chain reports a break.
6. A PDF upload saves a roster or creates a timetable slot by itself.
7. A production endpoint exposes dev personas or demo seeding.
8. A test account can join a production roster.

A stop is not a failure of the test team. It is a valid result.

### 1.5 Evidence rules

- Create a local folder `test-evidence/YYYY-MM-DD/` (gitignored) for screenshots, PDFs and
  exported files. Do not commit it; it may contain student names and emails.
- Screenshot name: `YYYYMMDD-<suite>-<step>-<device>.png`, for example
  `20261110-FL-06-P2.png`.
- For every FAIL, capture: the URL, the visible error, the browser console error (if any), the
  network status code (if relevant), the time and the device ID.
- Acoustic JSON reports go in `measurements/YYYY-MM-DD/` as described in
  [`measurements/README.md`](../measurements/README.md). They contain run IDs and device user
  agents, not student identities.
- Redact student emails in any screenshot that will leave the test team. The local evidence
  folder may keep the unredacted original.

---

## 2. Team, accounts and devices

### 2.1 Minimum team

| Role | Person | Responsibilities |
| --- | --- | --- |
| Test lead / recorder | 1 | Reads this plan, keeps time, records results, captures screenshots, stops a suite on a safety or security issue |
| Teacher | 1 | Real college teacher account; runs sessions, register decisions and queries |
| Students | 3 (4 preferred) | Real college student accounts, one per phone; consent to the test |
| Super-admin | 1 | Owner or delegated operator; runs `/admin` security tests and the restore drill |

One person may hold two roles only if it does not create a conflict (for example, the recorder
may also be the super-admin). The teacher and the students must be different accounts.

### 2.2 Account matrix

Fill this in before preflight. Do not write passwords.

| ID | Role | Email domain | Exact account | Used on | Consent recorded? |
| --- | --- | --- | --- | --- | --- |
| T1 | Teacher | `@nitjsr.ac.in` |  | L1, P1 |  |
| S1 | Student | `@nitjsr.ac.in` |  | P2, L3/L4 |  |
| S2 | Student | `@nitjsr.ac.in` |  | P3, L4 |  |
| S3 | Student | `@nitjsr.ac.in` |  | P4 |  |
| S4 | Optional student | `@nitjsr.ac.in` |  | AD-01 (L3) |  |
| A1 | Super-admin | owner-controlled |  | L2 |  |

Rules:

- T1 and S1–S4 must be distinct Google accounts.
- A1 must not be on `TEACHER_EMAILS` or any `TEST_*` list.
- S1–S3 must be on the test class roster before the signed flow. S4 is added immediately
  before AD-01 so the FL session percentages stay exact.
- Reserve S4 for the AD-01 first-binding test. Do not sign S4 in on any browser before AD-01.
  If only three student accounts exist, mark AD-01 **BLOCKED** and use FL-03 as the
  first-binding evidence instead of binding an already-approved student.
- At least three distinct student accounts are required. If only two are available, scale the
  attendance flow to two students and mark the third-phone checks **BLOCKED**; do not invent an
  account.

### 2.3 Device matrix

Use at most **4 phones and 3–4 laptops**. Phones are the acoustic endpoints; laptops are the
console, admin and recorder surfaces.

| ID | Device | Assigned role | Make / model | OS version | Browser + version | Media volume | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Phone | Teacher transmitter + teacher check-in |  |  | Chrome |  | Speaker at the front |
| P2 | Phone | Student S1 receiver / check-in |  |  | Chrome |  |  |
| P3 | Phone | Student S2 receiver / check-in |  |  | Chrome |  |  |
| P4 | Phone | Student S3 receiver / check-in |  |  | Chrome |  |  |
| L1 | Laptop | Teacher console / recorder |  |  | Chrome | — | Primary teacher screen |
| L2 | Laptop | Super-admin console |  |  | Chrome | — | `/admin` only |
| L3 | Laptop | Observer / second student browser |  |  | Chrome | — | Device-review and query checks |
| L4 | Laptop (optional) | Extra student / spare |  |  | Chrome | — | Only if available |

Minimum viable set: **4 phones + 3 laptops** (P1–P4, L1–L3). If only 3 phones are available,
use P1 as teacher and P2–P3 as two students; mark the third student's steps **BLOCKED** and do
not claim a three-student flow.

### 2.4 Device readiness

Before any measured run, on every phone:

- [ ] Current Chrome on Android; no iOS device in the acoustic or signed flow.
- [ ] Media volume set and recorded; do not change it between distances in the same series.
- [ ] Auto-lock off or set to at least 10 minutes.
- [ ] Battery above 50%; power saving off (it can suspend audio).
- [ ] Do not disturb on; no calls or notifications during a run.
- [ ] No Bluetooth headphones or speakers; use the phone's own speaker and microphone.
- [ ] Microphone permission allowed for the deployed origin.
- [ ] The tab stays in the foreground; do not switch apps during listening or transmitting.
- [ ] Phone cases removed if they cover the speaker or microphone.
- [ ] Date and time set automatically; clock skew can confuse evidence timestamps.

On every laptop:

- [ ] Current Chrome or Edge; hardware acceleration on.
- [ ] Signed in to the intended account only; no shared profile with another role.
- [ ] Developer Tools available for console and cookie checks.
- [ ] Screen recording or screenshot tool ready.

### 2.5 Room and acoustic setup

- Use one quiet room for the whole acoustic series. Record the room number, approximate size,
  door/window state and furniture.
- Mark distances with a tape measure from the **teacher phone speaker** to the **student phone
  microphone**: 1 m, 2 m, 3 m, 5 m, 10 m.
- Put both phones at approximately the same height (about 1.2 m), facing each other, with clear
  line of sight. Do not put a phone inside a bag or under a desk.
- Keep the room occupancy constant during a series. Fewer people is better; moving people
  change reflections.
- Warm the deployed site before the first run (open `/login` or call `/api/v1/health/ready`)
  because a free Render instance may need 30–60 seconds to wake.

---

## 3. Preflight gates

Every gate must be **PASS** before the dependent suite starts. Record the evidence in the gate
table in §5.3.

### G0 — Authorization and consent

- [ ] The owner has approved a test window and the dedicated test class.
- [ ] Every participant has consented to the account, device and evidence recording described
      in §1.2.
- [ ] The team knows the stop rules in §1.4.
- [ ] No real class is used for the test.

**PASS:** all boxes ticked. **FAIL/BLOCKED:** do not start.

### G1 — Repository and local gate

Run from the repository root:

```bash
git rev-parse --short HEAD
git rev-parse --short origin/main
git status --short
```

Expected at writing: both hashes print `003f900`, and `git status --short` shows only the
documentation/test-tool changes the owner already knows about. Record the actual hashes; do not
assume they are still `003f900`.

Run the local gate:

```bash
cd attendance-backend
npm test
npm test -- --test-isolation=none
cd ../attendance-frontend
npm run test:proof
npm run test:acoustic
npm run test:checkin
npm run test:studentcheckin
npm run test:auth
npm run test:rosterimport
npm run test:timetableimport
CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=YOUR-CLIENT-ID.apps.googleusercontent.com \
  REACT_APP_GOOGLE_HOSTED_DOMAIN= \
  npm run build
```

Expected at writing: backend **255/255** in both modes, frontend **96/96**, production build
compiles. Record the actual counts.

Generate the synthetic PDFs (see §4.4):

```bash
cd attendance-backend
node scripts/generate-test-pdfs.js
```

Expected:

```text
roster-text-layer.pdf: ... hasText=true
timetable-text-layer.pdf: ... hasText=true
no-text-layer.pdf: ... hasText=false
```

**PASS:** both hashes match, the tree contains no unexplained changes, every suite passes and
the build compiles.

### G2 — Deployed commit identity

This is the most important gate. The live site must be the reviewed commit, not an older
deploy.

1. Open the Render dashboard for the `bio-attend` service.
2. Open **Events** or **Deploys** and find the live deploy.
3. Record the commit hash shown for the live deploy.
4. Compare it with the `HEAD` recorded in G1.
5. Open the live site in a fresh browser tab and confirm it loads over HTTPS.

Supporting checks:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://bio-attend.onrender.com/api/v1/health
curl -sS https://bio-attend.onrender.com/api/v1/health/ready
curl -sS -D - -o /dev/null https://bio-attend.onrender.com/
```

Expected: health **200**, readiness **200** with `"database": true`, and the response headers
include `content-security-policy`, `strict-transport-security` and
`x-content-type-options: nosniff`.

Record the live bundle name and last-modified time:

```bash
curl -sS https://bio-attend.onrender.com/ | grep -oE 'src="[^"]+\.js"'
```

At plan-writing time the live site returned:

- `/api/v1/health` → `{"success":true,"status":"ok"}`
- `/api/v1/health/ready` → `{"success":true,"status":"ready","checks":{"database":true}}`
- `index.html` last-modified **Fri, 06 Nov 2026 14:29:45 GMT**
- `main.14c6a1a8.js` contained the strings **“Timetable PDF text preview”** and **“Import PDF
  text”**, which are A2a UI strings.

That is supporting evidence that A2a is deployed. It is **not proof** that the live commit is
exactly `003f900`. Only the Render dashboard commit comparison is proof.

**PASS:** the Render dashboard commit equals the recorded `HEAD`.  
**FAIL:** any mismatch, or the dashboard cannot be checked. Stop signed testing; ask the owner
to deploy the reviewed commit. Do not test an older deployment and call it current.

### G3 — Google OAuth and account access

- [ ] The deployed origin is an authorized JavaScript origin on the production OAuth client.
- [ ] The Google consent screen is configured for the accounts being used; if it is in
      **Testing**, every account is on the **Test users** list.
- [ ] `REACT_APP_GOOGLE_HOSTED_DOMAIN` is empty or unset for the deployment, so approved
      accounts can appear in the chooser.
- [ ] `/login` shows a working Google button and **no** “Dev-only test identities” section.
- [ ] T1, S1, S2 and S3 can each sign in and reach the correct dashboard; A1 can reach
      `/admin`.

**PASS:** all accounts sign in once. **FAIL/BLOCKED:** any account cannot sign in; record the
exact Google error.

### G4 — Test class and roster

1. Sign in as T1 on L1.
2. Open `/teacher/classes`.
3. Create or select a room (for example `B-204`).
4. Create a class:
   - Course code: `TST101`
   - Section: `T`
   - Class title: `Pilot test class — not a real class`
   - Default room: the room created above
5. Select the class and paste the real student emails for **S1–S3**. Do not add S4 yet; S4 is
   added immediately before AD-01 so the FL session percentages stay exact.
6. Click **Preview roster**; fix any error; click **Save roster**; confirm **Confirm save**.
7. Verify the class shows the expected active student count.

For the PDF save-path test, keep a copy of this real roster text. Do not save synthetic
`2023ugcs001…` emails into the attendance class.

**PASS:** S1–S3 are active on `TST101` and can sign in. S4 is added later, only for AD-01.

### G5 — Restore prerequisites

Run these checks on the operator machine. Do not print the values.

```bash
command -v mongodump
command -v mongorestore
command -v openssl
test -n "$DB_URI" && echo "DB_URI is set"
test -n "$BACKUP_PASSPHRASE" && echo "BACKUP_PASSPHRASE is set"
```

Also confirm:

- [ ] The Atlas user can create and drop a scratch database named `attendance_restore_*` or
      `attendance_drill_*`.
- [ ] The operator can read the source database and the encrypted backup file.
- [ ] The backup file from the most recent production deploy exists and its `.sha256` sidecar
      is present.

**PASS:** all available.  
**BLOCKED:** any missing. Mark the whole **RS** suite **BLOCKED**; do not pretend the restore
was tested. A real-data pilot should be **NO-GO** until this suite passes.

### G6 — PDF fixtures

Run the generator from G1. It writes three files to `test-artifacts/` at the repository root:

| File | Expected | Use |
| --- | --- | --- |
| `roster-text-layer.pdf` | 1 page, 14 lines, 10 college emails, `hasText=true` | Roster extraction and preview |
| `timetable-text-layer.pdf` | 1 page, 10 lines, `hasText=true` | Timetable read-only preview |
| `no-text-layer.pdf` | 1 page, 0 lines, `hasText=false` | Scanned-PDF rejection |

These are synthetic. They prove extraction mechanics, not real college layout accuracy.

### G7 — Device and network readiness

- [ ] §2.4 checklist complete on every device.
- [ ] All phones are on a stable network; record Wi-Fi/cellular.
- [ ] The Render instance is warm: open `/login` and wait for the page to render.
- [ ] The recorder's evidence folder exists.
- [ ] The acoustic tape measure, room log and media-volume settings are ready.

### Gate summary

| Gate | Result | Evidence | Checked by | Time |
| --- | --- | --- | --- | --- |
| G0 Authorization/consent |  |  |  |  |
| G1 Repo/local gate |  |  |  |  |
| G2 Deployed commit |  |  |  |  |
| G3 OAuth/accounts |  |  |  |  |
| G4 Test class/roster |  |  |  |  |
| G5 Restore prerequisites |  |  |  |  |
| G6 PDF fixtures |  |  |  |  |
| G7 Device/network |  |  |  |  |

If G2 or G5 is not PASS, mark the dependent suites **BLOCKED** and tell the owner before doing
any signed testing.

---

## 4. Test suites

Execute in this order: **AC → FL → AD → PDF → DP/RS**. The acoustic series is public and does
not need accounts; doing it first avoids binding phones before the measured runs.

### 4.1 Suite AC — acoustic range and controls

**Goal:** measure the real acoustic link and the controls that prevent a false positive. This
suite does **not** mark attendance and can run without signing in.

**Fixed settings for every AC run** (unless a step says otherwise):

| Setting | Value |
| --- | --- |
| Page | `/acoustic-tx` on the transmitter; `/acoustic-rx` on the receiver |
| Frames to send | 10 |
| Gap between frames | 450 ms |
| Amplitude | 50% (0.50) |
| Media volume | 50–70%; record the exact setting |
| Symbol duration | 120 ms (fixed by the app) |
| Room/notes | Same text on both phones via **Copy receiver link** |
| Run ID | 4–12 letters/digits, **no `O`, `I`, `0` or `1`**; use `FSTM`, `F2MT`, etc. |

#### AC-01 — Phone self-test

On each of P1–P4:

1. Open `/acoustic-lab`.
2. Tap **Allow microphone & inspect device**.
3. Allow the microphone.
4. Verify the sample-rate gate passes (44.1 kHz or higher).
5. Tap **Run local tone sweep**.
6. Wait for the seven-probe result.
7. Tap **Copy report** and save the text with the device ID.

Record: model, OS, Chrome version, AudioContext rate, microphone rate, each probe verdict,
summary recommendation. A phone that fails the 44.1 kHz gate is **BLOCKED** for acoustic tests.

**PASS:** all four phones pass the sample-rate gate and complete a sweep without a page error.

#### AC-02 — Forward 1 m

1. Put P1 (teacher TX) and P2/P3 (student RX) 1 m apart, facing each other.
2. On P1, open `/acoustic-tx`; set Run ID `FSTM`, distance `1 m`, room and notes.
3. Tap **Copy receiver link**.
4. On P2, open the copied link; verify the same run ID, distance and room.
5. On P3, open the same copied link (or type the same run ID and conditions).
6. On both receivers, tap **Start listening** and allow the microphone.
7. On P1, tap **Start transmitting**; wait for 10 frames.
8. Stop listening on both receivers.
9. On each receiver, copy/download the JSON report; on P1, copy/download the TX report.

Record per receiver: decoded count, decode rate, last margin, whether every decoded key equals
the TX key, and the report file names.

**PASS:** at least 19 of 20 frames decode across the two receivers and every decoded key
matches. If only one receiver is used, **PASS** means 10/10. The 95% Layer 1 gate applies at
1 m; 9/10 is a recorded **FAIL**, not a pass.

#### AC-03 to AC-06 — Forward 2 m, 3 m, 5 m, 10 m

Repeat AC-02 at each distance, using a new run ID (`F2MT`, `F3MT`, `F5MT`, `FTNM`) and
updating the **Distance** field before copying the receiver link. Keep amplitude, media volume,
room and notes identical. Do not move the furniture between distances.

Record the same fields. The formal Layer 1 gate applies at **1 m, 5 m and 10 m**: at least
**95% decoded**, which with 10 frames means 10/10 per receiver or at least 19/20 across two
receivers. At **2 m and 3 m**, record the actual rate as diagnostic data; do not mark the run
as a formal gate failure solely because it is below 95%.

**PASS (gate distances 1 m, 5 m, 10 m):** ≥95% decoded across the receivers used and all keys
match.  
**FAIL (gate distances):** below 95%, unreadable keys or a page error.  
**2 m / 3 m:** measurement recorded; no formal gate.

Do not claim Layer 1 is measured-passed unless **1 m, 5 m and 10 m all pass in both
directions** and the muted control decodes zero. This plan measures; it does not assume.

#### AC-07 — Reverse 1 m

Swap roles at the same physical positions:

1. P2 becomes the transmitter; P1 becomes the receiver.
2. P2 opens `/acoustic-tx`; set Run ID `RSTM`, distance `1 m`, room and notes.
3. P1 opens the receiver link from P2; start listening.
4. P2 taps **Start transmitting**; 10 frames.
5. Stop and save both reports.

**PASS:** 10/10 decoded and every key matches (the 1 m gate is 95%). A 9/10 result is recorded
as **FAIL**.

#### AC-08 — Reverse 5 m

Repeat AC-07 at 5 m with Run ID `R5MT`. Record.

#### AC-09 — Reverse 10 m

Repeat AC-07 at 10 m with Run ID `RTNM`. Record.

#### AC-10 — Muted control

This is the false-positive control. It must produce **zero** decoded frames.

1. Put P1 (TX) and P2 (RX) 1 m apart.
2. Set P1's **hardware media volume to 0** (not just the in-page amplitude).
3. Keep the in-page amplitude at 50% and 10 frames.
4. On P2, start listening.
5. On P1, tap **Start transmitting**; let it finish.
6. Stop listening and save both reports.

**PASS:** 0 of 10 decoded; no key is reported.  
**FAIL:** any decode. Stop and investigate before trusting any acoustic result.

#### AC-11 — Transmitter-off control

1. Put P1 and P2 1 m apart.
2. On P2, start listening for 20 seconds.
3. Do **not** start the transmitter.
4. Stop listening.

**PASS:** 0 decoded frames. **FAIL:** any decode.

#### AC-12 — Archive the evidence

1. Create `measurements/YYYY-MM-DD/`.
2. Copy each TX/RX JSON pair into it with the existing naming convention
   (`tx-<runId>-<distance>.json`, `rx-<runId>-<distance>.json`).
3. Write the day's `README.md` with the run table, device matrix, media volumes, room
   conditions, exact settings and caveats.
4. Update `measurements/README.md` only if the format changed.

**PASS:** every run has a matched TX/RX pair and the README states the actual result.

#### AC recording table

| Run | Distance | Direction | TX device | RX device | Sent | Decoded | Rate | Key match? | Margin range | Report files | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC-02 | 1 m | forward | P1 | P2 | 10 |  |  |  |  |  |  |
| AC-02 | 1 m | forward | P1 | P3 | 10 |  |  |  |  |  |  |
| AC-03 | 2 m | forward | P1 | P2 | 10 |  |  |  |  |  |  |
| AC-03 | 2 m | forward | P1 | P3 | 10 |  |  |  |  |  |  |
| AC-04 | 3 m | forward | P1 | P2 | 10 |  |  |  |  |  |  |
| AC-04 | 3 m | forward | P1 | P3 | 10 |  |  |  |  |  |  |
| AC-05 | 5 m | forward | P1 | P2 | 10 |  |  |  |  |  |  |
| AC-05 | 5 m | forward | P1 | P3 | 10 |  |  |  |  |  |  |
| AC-06 | 10 m | forward | P1 | P2 | 10 |  |  |  |  |  |  |
| AC-06 | 10 m | forward | P1 | P3 | 10 |  |  |  |  |  |  |
| AC-07 | 1 m | reverse | P2 | P1 | 10 |  |  |  |  |  |  |
| AC-08 | 5 m | reverse | P2 | P1 | 10 |  |  |  |  |  |  |
| AC-09 | 10 m | reverse | P2 | P1 | 10 |  |  |  |  |  |  |
| AC-10 | 1 m | muted | P1 | P2 | 10 |  |  |  |  |  |  |
| AC-11 | 1 m | TX off | — | P2 | 0 |  |  |  |  |  |  |

### 4.2 Suite FL — signed attendance, query and exports

**Preconditions:** G0–G4 and G6 PASS; P2–P4 can sign in as S1–S3; L1 is signed in as T1; the
test class `TST101` has the real S1–S3 roster. The first-device approvals happen in FL-03, not
in AD-01.

Each wave key lives about **two minutes**. Have the student phones on the Join screen before
the teacher transmits. If a key expires before every phone submits, the teacher may advance
only after at least one proof on the current wave; the remaining students join the new wave.
If a key expires with **zero** proofs, the wave cannot be advanced: close the session and
start a new one. Do not fake, replay or hand-enter evidence to unblock a wave. Record the
actual wave counts; do not force the planned example counts.

Use two sessions:

- **Session A** — all three students submit; teacher marks everyone present; tests the happy
  path, wave advancement, register and exports.
- **Session B** — S3 deliberately does not submit; teacher finalises S3 absent; S3 raises a
  query; teacher approves it. This tests the query correction.

#### FL-01 — Teacher sign-in and dashboard

1. On L1, open `https://bio-attend.onrender.com/login`.
2. Click the Google button and choose T1.
3. Verify the teacher dashboard loads.
4. Verify the page title/section “Teacher” and the cards for classes, active students and
   pending reviews.
5. Verify the browser console has no errors and no CSP violations.

**PASS:** T1 reaches `/teacher-dashboard`; no dev-persona section appeared.

#### FL-02 — Test class and roster

1. Open `/teacher/classes`.
2. Verify `TST101 · T` exists with the expected active student count.
3. Select it; verify the roster lists S1–S3 with the saved names.
4. If the roster is wrong, fix it with **Preview roster** → **Save roster** → **Confirm save**.

**PASS:** the roster matches the account matrix.

#### FL-03 — Student sign-in and device approval

Do this once per student phone before the first session:

1. On P2, open `/login`; sign in as S1.
2. The student dashboard should open. If this is the first browser, the device state is
   **review**.
3. On L1, open `/teacher/classes`; find **Device approval queue**.
4. Find S1's request; click **Approve**.
5. On P2, refresh the student dashboard; verify the device is approved.
6. Repeat for S2 on P3 and S3 on P4.

**PASS:** each student has one approved device and no “waiting for teacher review” alert.

#### FL-04 — Start Session A

1. On L1, open `/teacher/check-in`.
2. Select `TST101 · T`.
3. Verify the class has a default room; if not, set one in `/teacher/classes`.
4. Click **Start check-in**.
5. Verify the card **“2. Check-in is live”** appears.
6. Record the wave number (`0`), the key, the countdown (about 2:00) and the start time.
7. Do not share the key with students.

**PASS:** one active session exists; wave 0; key visible only on the teacher screen.

#### FL-05 — Prepare the wave 0 transmitter (do not transmit yet)

1. On P1, sign in as T1 and open `/teacher/check-in`; select `TST101 · T` if needed. Confirm
   the live session shows wave 0 and its key.
2. Tap **Open transmitter** on P1. Verify `/acoustic-tx` opens with the key prefilled and the
   notice “Session key loaded from the check-in screen. Start the transmitter when students
   are ready.”
3. Verify the **Back to check-in** link is present.
4. Set Distance `in class`, Room `B-204`, and Notes with the phone model and media volume.
5. Set media volume to the same level used in AC.
6. **Do not tap Start transmitting yet.** The students must be listening first (FL-06).
7. Work quickly: the key lives about two minutes. If it expires before any student submits,
   use the zero-proof recovery rule in the §4.2 introduction.

**PASS:** the transmitter is open on P1 with the correct key and settings, but no frames have
played.

#### FL-06 — Students join, then teacher transmits wave 0

1. On P2, open `/student/check-in`.
2. Read the **Before you listen** notice.
3. Tick the consent checkbox: “I understand this phone will use the microphone and that
   hearing a key records evidence, not attendance.”
4. Tap **Join check-in**; allow the microphone. Verify the page says **Listening for the wave**
   and shows the countdown.
5. On P3, repeat steps 1–4 for S2. Both students must be listening before the transmitter
   starts.
6. On P4, do **not** open `/student/check-in` yet; S3 joins in FL-08 for the wave-change test.
7. On P1, tap **Start transmitting**; wait for the planned frames to finish.
8. Verify the transmitter report shows the planned/played count.
9. On P2 and P3, verify:
   - The progress step **Wave heard** completes.
   - The evidence card says **Evidence recorded**.
   - **Attendance** says **Not decided**.
   - The wave number and time are shown.
10. On L1, verify the **Evidence received** card shows 2 proofs for wave 0.

**PASS:** both students were listening before the transmission; each sees evidence recorded
and “Attendance: Not decided”; nothing marks them present automatically.

#### FL-07 — Teacher sees evidence and advances

1. Verify the **Evidence received** card still lists both S1 and S2 for wave 0.
2. Verify the rows name S1 and S2 and show the wave/time.
3. Click **Advance wave**.
4. Read the confirmation: “Advance to wave 1?”
5. Click **Confirm advance**.
6. Verify the key changes, the countdown resets, and wave 1 is displayed.

**PASS:** the old key is no longer displayed; wave 1 has a fresh two-minute key.

#### FL-08 — Student handles the wave change

FL-07 left the session on **wave 1**, but the wave 1 key has not been transmitted yet. A wave
can only be advanced after at least one proof, so first put one proof on wave 1, then test the
listener's reaction to the next advance.

1. On P1, tap **Back to check-in**; confirm the screen shows wave 1 and its new key. Tap
   **Open transmitter** and verify the transmitter key matches wave 1.
2. On P3, reload `/student/check-in` to clear the previous **Evidence recorded** card, tick
   consent again, and tap **Join check-in**. The page does not offer a second Join on a new
   wave without a reload; record this as a **P2 UI finding**. Verify it is listening for wave 1.
3. On P1, tap **Start transmitting**; wait for the planned frames to finish.
4. On P3, verify **Evidence recorded** for wave 1.
5. On P4, open `/student/check-in`, tick consent and tap **Join check-in**; verify it is
   listening for wave 1. P4 has missed the wave 1 transmission, so it should not record
   evidence. Do not advance until P4 is listening.
6. On L1, verify wave 1 has at least one proof (S2), then click **Advance wave** →
   **Confirm advance** to wave 2.
7. On P4, verify listening stops and the message says the teacher advanced to a new wave and
   asks the student to tap Join for the new key.
8. On P1, tap **Back to check-in**; confirm wave 2. Tap **Open transmitter**, then **Start
   transmitting**; wait for the planned frames to finish.
9. On P4, tap **Join check-in**; verify it listens for wave 2, then records **Evidence
   recorded**.
10. On L1, verify the evidence card shows per-wave counts, for example `Wave 0 · 2`,
    `Wave 1 · 1` and `Wave 2 · 1`.

Complete steps 7–9 promptly: the wave 2 key is minted at step 6. If it expires with zero
proofs, the wave cannot be advanced; close the session, record the restart as an execution
issue, and repeat Session A.

**PASS:** the student's listener stops on the change; a new Join is required; no old-wave proof
is submitted after the change; each transmitted wave has evidence and the teacher sees per-wave
counts.

#### FL-09 — Register shows evidence, not attendance

1. On L1, click **Attendance register** (or open **Register** from session history).
2. Verify the modal **Session register** opens.
3. Verify every roster row is **Pending**.
4. Verify the **Evidence** column shows proof counts greater than zero for S1–S3.
5. Verify no row is already **Present**.
6. Open the **Evidence** tab; select a student; verify proof count, waves, distance/location
   evidence and the decision fields.
7. Open the **Wave timeline** tab; verify the wave counts.

**PASS:** all rows are Pending; evidence is visible; no automatic attendance decision.  
**FAIL:** any row is Present without a teacher action.

#### FL-10 — Teacher marks Session A

1. In the **Register** tab, set S1 to **Present**, S2 to **Present**, S3 to **Present**.
2. Add a short decision note for S1, for example “Present in room; wave 0/1 evidence.”
3. Click **Save 3 changes**.
4. Verify the statuses persist and the register summary updates to 3 present, 0 pending.
5. Verify **Finalise attendance** is **not** offered while the session is still live. The
   register shows the notice “The session is still live”. If the control is offered and
   finalisation succeeds while live, that is a **FAIL**.
6. On L1, open `/teacher/sessions` → **Audit trail**; verify the teacher decision entries.

**PASS:** the teacher decision changes the rows; no finalise control appears while live; the
decisions are audited.

#### FL-11 — Close and finalise Session A

1. Return to `/teacher/check-in`.
2. Click **Close check-in**.
3. Read “Close this check-in?”; click **Confirm close**.
4. Verify the session is closed and the key is inactive.
5. On P4, open `/student/check-in`; verify there is no live session and a new proof cannot be
   started.
6. On L1, open `/teacher/sessions`; find Session A and click **Register**.
7. Click **Finalise attendance**; read the warning; click **Confirm finalise**.
8. Verify the register is finalised and the session attendance is 100% (3 of 3 present).
9. On L1, open `/teacher/sessions` → **Audit trail**; verify the finalisation entry.
10. Verify the session appears in **Session history** with **Closed** and **Finalised**.

**PASS:** closed session accepts no new proofs; finalisation happens only after close and is
audited; Session A is 100% because all three rows were marked before finalisation.

#### FL-12 — Start Session B

1. On L1, open `/teacher/check-in`; select `TST101 · T`; click **Start check-in**.
2. On P1, open `/teacher/check-in` (or tap **Back to check-in**); confirm Session B is live on
   wave 0. Tap **Open transmitter**; do not transmit yet.
3. On P2 and P3, open `/student/check-in`; tick consent and tap **Join check-in**; allow the
   microphone. Verify both phones are listening for wave 0. If a stale **Evidence recorded**
   card from Session A blocks Join, reload the page and record the stale-state issue.
4. On P1, tap **Start transmitting**; wait for the planned frames.
5. On P2 and P3, verify **Evidence recorded** for wave 0. Do **not** have S3 submit; S3 may
   keep the page open or close it.
6. On L1, verify 2 proofs for wave 0.
7. Click **Close check-in** → **Confirm close**. Do not advance the wave.
8. On L1, open `/teacher/sessions`; find Session B and click **Register**. Verify S1/S2 are
   **Pending** with evidence and S3 is **Pending** with no evidence.
9. Mark S1 and S2 **Present**; leave S3 **Pending**.
10. Click **Save 2 changes**; then **Finalise attendance** → **Confirm finalise**.
11. Verify S3 becomes **Absent** and the session attendance is 2 of 3.
12. Verify the query window opens for the session (about 24 hours).

**PASS:** finalisation turns S3 from Pending to Absent; the query window is open.

#### FL-13 — Student raises a query

1. On P4, sign in as S3 if needed.
2. Open `/queries`.
3. Click the **Raise a query** tab.
4. In **Sessions you can query**, click **Select session** on the Session B card, or choose
   Session B in the **Session** dropdown of the **New query** form.
5. Enter a reason of at least 10 characters, for example: “I was in the room for the whole
   lecture, but my phone did not decode the wave.”
6. Optionally type a location note and click **Share location**; allow or deny. A denial must
   not block the query.
7. Click **Send query**.
8. Verify the query appears under **My queries** with status **Pending** and an expiry time
   about 24 hours after the session closed.

**PASS:** the query is created; the student sees Pending; the reason is stored.

#### FL-14 — Teacher approves the query

1. On L1, open `/queries`.
2. Verify the teacher view is **Query centre**.
3. Open the **Pending** tab; find S3's query.
4. Click **Review evidence**.
5. Verify the student reason, location evidence, distance and audit trail are shown.
6. Enter a decision note, for example: “Location and time match the class; approved.”
7. Click **Approve as present**.
8. Verify the query status changes to **Approved** and S3's register row becomes **Present**.
9. Verify the audit trail records the approval and the register change.

**PASS:** approval changes the register and is audited; the teacher decision is the only cause.

#### FL-15 — Student sees the correction

1. On P4, refresh `/queries`; verify the query is **Approved** and the teacher note is shown.
2. Open `/attendance`; verify the session now counts S3 as present and the overall percentage
   reflects the approved query.
3. Open `/student-dashboard`; verify the closed-session card shows the updated status.

**PASS:** the student sees the approved correction in queries, analytics and the dashboard.

#### FL-16 — Teacher analytics and history

1. On L1, open `/attendance`; select `TST101`.
2. Verify the class overview shows sessions, present/absent counts, the approved query and the
   trend.
3. Open `/teacher/sessions`; verify both sessions appear with the correct finalisation and
   query counts.
4. Open the Session B register; verify S3 is Present after the approved query.
5. Open `/timetable`; verify it shows scheduled slots only, not attendance or evidence.
   FL-19 tests that adding a slot does not start a session.

**PASS:** analytics and history match the register.

#### FL-17 — Exports

1. On L1, open `/exports`.
2. Select `TST101` and the session date range; select Session B in **Session sheet**.
3. Download:
   - **Attendance register — Excel**
   - **Attendance register — PDF**
   - **Attendance queries — Excel**
   - **Attendance queries — PDF**
   - **Session register** Excel and PDF for Session B
4. Open each file; verify the class, session, student names, statuses and query decision are
   correct.
5. On L2, open `/admin` → **Audit** as A1 and verify the export entries were written.
6. Record file names and sizes; keep the files in `test-evidence/`.

**Important:** the Class/date controls scope the attendance register and the session sheet,
but **not** the attendance-queries exports. Those contain every query visible to T1 and cannot
be filtered to one class in the UI. Use a dedicated test teacher account with only `TST101`,
or redact other classes' student data before keeping or sharing the query files.

**PASS:** all six files open and match the on-screen register; each download is audited.

#### FL-18 — Notifications

1. On P4, open `/notifications`.
2. Verify a notification for the query decision exists and links to the query or session.
3. Click **Mark read**; verify the unread count decreases.
4. Optionally click **Mark all read** and **Clear read**; verify the list updates.
5. On L1, verify the teacher notification for the pending query/decision where applicable.

**PASS:** notification state updates and links work.

#### FL-19 — Timetable slot does not start attendance

1. On L1, open `/timetable`.
2. Click **Add slot**; choose `TST101`, a day, start/end time and room; save.
3. Verify the slot appears in the week view.
4. On P4, open `/timetable`; verify the student sees the slot read-only.
5. Verify `/teacher/check-in` still shows **No live session** for the class; a timetable slot
   alone must not start a session.

**PASS:** the slot is a plan only; no session or attendance record is created.

#### FL-20 — Sign-out and session state

1. On P2–P4, open `/profile`; click **Sign out**.
2. Verify the login page appears and the dashboard is not reachable with the back button.
3. On L1, sign out T1.
4. Verify no signed-in page remains open on the test devices.

**PASS:** sessions end cleanly; protected pages redirect to `/login`.

#### FL recording table

| Test | Session | Student(s) | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| FL-04 Start Session A | A | — | Wave 0 live |  |  |  |
| FL-05 Transmitter prepared | A | — | Open; no frames played |  |  |  |
| FL-06 Join then transmit | A | S1, S2 | Listening first; evidence, not attendance |  |  |  |
| FL-07 Advance wave | A | — | Wave 1 fresh key |  |  |  |
| FL-08 Wave-change handling | A | S2, S3 | Listening stops; new Join |  |  |  |
| FL-09 Register pending | A | S1–S3 | All Pending with evidence |  |  |  |
| FL-10 Mark present (live) | A | S1–S3 | Present; no finalise while live |  |  |  |
| FL-11 Close + finalise | A | — | Closed first; 100%; audited |  |  |  |
| FL-12 Session B absent | B | S1–S3 | S3 absent; window open |  |  |  |
| FL-13 Raise query | B | S3 | Pending query |  |  |  |
| FL-14 Approve query | B | S3 | Present; audited |  |  |  |
| FL-15 Student sees correction | B | S3 | Approved in all views |  |  |  |
| FL-17 Exports | A/B | — | Files match register |  |  |  |
| FL-19 Timetable | — | — | No session created |  |  |  |

### 4.3 Suite AD — device approval, admin security and passkey

**Preconditions:** T1 and A1 can sign in; `TST101` has S1–S3 on the roster; S4 exists but has
never signed in on a browser. At least one super-admin passkey can be registered or already
exists. AD-01 adds S4 to the roster. Do not delete existing passkeys.

FL-20 signed T1 and S1–S3 out. Before AD, sign T1 back in on L1. Re-sign S1 on P2 and S2 on P3
before the tests that need their existing approved devices. A signed-out session does not
remove the approved device binding, but the plan must not claim a live session where there is
none.

#### AD-01 — First device goes to review

0. On L1, add S4 to the `TST101` roster: paste S4's real college email, click **Preview
   roster**, then **Save roster** → **Confirm save**. S4 must share the class so the teacher
   can see the request.
1. On L3, open a fresh browser profile (not the student phone profile).
2. Sign in as S4, a student with no approved device. If no such account exists, mark this test
   **BLOCKED** and cite FL-03 as the first-binding evidence; do not fake a first binding with an
   already-approved student.
3. Verify the student dashboard shows the device state **review** / “waiting for teacher
   review”.
4. On L1, open `/teacher/classes`; verify S4's request is in **Device approval queue**.
5. Click **Approve**.
6. On L3, refresh; verify the device is approved and the session is still signed in. A first
   binding must not bump the session version because there was no old device to revoke.

**PASS:** the first binding waits for teacher approval; approval unlocks the device without
signing the student out.

#### AD-02 — Rejected device stays blocked

1. On P3, sign in as S2 again and verify the existing device is approved. This re-establishes
   the old-device session that must survive a rejected change.
2. On L4 (or a second incognito profile on L3), sign in as S2. Because S2 already has an
   approved device, this is a pending device change.
3. On L1, find S2's request in **Device approval queue**.
4. Click **Reject**.
5. On L4/L3, refresh `/student-dashboard` and `/student/check-in`; record exactly what the
   device state says.
   - If it shows **review** / not approved, the rejected browser is clearly blocked.
   - If it shows **approved** because S2 still has the old approved device on P3, record a
     **P2 UI defect**: the status check is account-level, not browser-level. It is not a
     device-approval bypass if the proof signature is still rejected.
6. Prove the rejection with a disposable live session:
   - On L1, start a check-in for `TST101`. On P1 (sign in as T1 if needed), click
     **Open transmitter** but do not transmit yet.
   - On P3 and L4/L3, open `/student/check-in`, tick consent and tap **Join check-in** for
     wave 0. If the rejected browser blocks joining, record that block and continue with P3.
   - On P1, tap **Start transmitting**.
   - On L4/L3, verify it does **not** show **Evidence recorded**. If it joined, the server must
     reject the submission with **403** (invalid device signature).
   - On P3, verify **Evidence recorded** and **Attendance: Not decided**.
   - On L1, verify the evidence card shows one proof for S2 on wave 0.
   - Close the disposable check-in without finalising it.
7. On P3, refresh; verify the previously approved device still reports approved and its
   session was not revoked.

**PASS:** rejection leaves the existing approved device working; the rejected browser creates
no evidence.  
**FAIL:** the rejected browser creates evidence, or the old device is revoked or blocked.

#### AD-03 — Replaced device revokes the old and the new session

1. On P2, sign in as S1 again and verify the existing device is approved. Keep this session
   open; it is the old-device session that must be revoked.
2. On L3, use a fresh browser profile **different from the S4 profile from AD-01** and sign in
   as S1. Because S1 already has a device, this is a **device change**; the dashboard shows
   **review**.
3. On L1, approve S1's L3 request.
4. Because a replacement bumps `tokenVersion`, the approval revokes every existing session for
   S1: both P2 and the current L3 session. On L3, refresh or navigate; verify it is sent to
   `/login` (401). If L3 stays signed in, that is a **FAIL**.
5. Sign in again on L3; verify the dashboard now reports the device approved.
6. On P2, refresh or navigate; verify it is sent to `/login` (401).
7. Sign in again on P2; DP-05 needs S1 signed in on that phone.

**PASS:** replacing an approved device invalidates both the old session and the session that
requested the change; a fresh sign-in reaches the approved new binding.  
**FAIL:** the old session keeps submitting proofs, or the replacement is usable without a
fresh sign-in.

#### AD-04 — Production refuses dev and demo features

1. On L2, sign in as A1; open `/admin`.
2. Verify the admin navigation does **not** include **Demo data** in production.
3. Open `https://bio-attend.onrender.com/api/v1/auth/dev/accounts` in a tab; verify **404**.
4. Open `https://bio-attend.onrender.com/api/v1/admin/demo/status`; verify **404**.
5. Open `/login` in a fresh tab; verify no “Dev-only test identities” section.
6. On L1, try to paste a Gmail address into the roster and click **Preview roster**; verify it
   is rejected with “Use a valid @nitjsr.ac.in email.”

**PASS:** all dev/demo surfaces are absent; real-account enforcement is active.  
**FAIL:** any dev persona, demo seeding or test-roster email is accepted.

#### AD-05 — Passkey status and registration

1. On L2, open `/admin` → **Security**.
2. Read the metrics: **Passkey**, **Step-up window**, **Protected actions**.
3. If the state is **Not registered**, click **Register passkey**.
4. If a passkey already exists, click **Register another passkey** and complete the existing
   step-up when asked.
5. Follow the browser's passkey prompt (platform authenticator or security key).
6. Verify the table shows a new credential with date, device type, backup state and last used.
7. Verify the toast says the passkey was registered.

**PASS:** a passkey is registered or a second one is added; the table updates. Do not remove
existing credentials.

#### AD-06 — Protected action without step-up returns 428

This check uses the API so the boundary is visible. It needs A1's session cookie and a target
user id (use S4, not S1). Do not save the cookie to the repository. The curl carries only the
session cookie, not the `admin_step_up` cookie, so it tests the missing-assertion path even if
the browser window happens to be open.

1. In DevTools → Application → Cookies, copy the `token` value for the deployed origin.
2. In a terminal, set it as a shell variable with `read -s` (never paste it into a file):

```bash
read -s TOKEN
# paste the cookie value, press Enter
```

3. Find S4's user id (the admin user search uses `q`, not `search`):

```bash
curl -sS \
  -H "Cookie: token=$TOKEN" \
  "https://bio-attend.onrender.com/api/v1/admin/users?q=S4_EMAIL" | head -c 2000
```

4. Call the protected revocation route **without** a fresh step-up:

```bash
curl -sS -o /tmp/revoke.json -w '%{http_code}\n' \
  -X POST \
  -H "Cookie: token=$TOKEN" \
  "https://bio-attend.onrender.com/api/v1/admin/users/S4_USER_ID/revoke-sessions"
cat /tmp/revoke.json
```

Expected: **428** and `"code":"step_up_required"`.

5. Do not retry with a forged header. The 428 is the expected result.

**PASS:** 428 without a fresh assertion. **FAIL:** 200 or any session revocation without the
passkey.

#### AD-07 — Protected action with step-up succeeds

**Before starting:** open **Security**. If **Step-up window** shows **Open** because AD-05 just
registered a passkey, wait until it shows **Locked** (up to five minutes) so the action
genuinely needs a fresh assertion. Do not clear cookies or fake the clock.

1. On L2, open `/admin` → **Users**.
2. Find S4; click **Sign out** (this is the revoke-sessions action).
3. Complete the passkey prompt.
4. Verify the toast says all sessions for S4 were revoked.
5. On L3, return to the S4 browser profile from AD-01, refresh; verify it is sent to `/login`.
6. Verify the audit log records the revocation and the step-up.

**PASS:** the action succeeds only after a passkey assertion; it is audited.

#### AD-08 — Five-minute step-up window

1. Immediately after AD-07, open **Security**; verify **Step-up window: Open**.
2. Perform another protected action within five minutes: open **Settings** and click **Save
   settings** without changing a value (or revoke another disposable test user's sessions).
3. Verify it succeeds without asking for the passkey again.
4. Wait more than five minutes (take a break; do not fake the clock).
5. Perform a protected action again; verify the passkey prompt appears or the API returns
   **428**.

**PASS:** the window is about five minutes, then closes. Record the observed start and end
times.

#### AD-09 — Audit chain verification

1. On L2, open `/admin` → **Audit**.
2. Click **Verify chain**.
3. Verify the notice **Audit chain intact** with the checked count, first/last sequence and
   legacy count.
4. Record the first and last `seq` values and the time.
5. Refresh the audit list; verify the device approvals, session events, attendance decisions,
   query approval, export and passkey events are present.

**PASS:** chain intact; expected actions appear.  
**FAIL:** any break. Stop and notify the owner; do not “fix” production data.

#### AD-10 — Export limit

The limit is **30 downloads per 10 minutes** per account/IP. Do this last in the AD suite.

Preferred API check (keeps the UI free):

1. Copy the teacher or super-admin `token` cookie as in AD-06.
2. Run 31 sequential requests to a cheap export route, for example:

```bash
for i in $(seq 1 31); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Cookie: token=$TOKEN" \
    "https://bio-attend.onrender.com/api/v1/exports/queries.xlsx")
  echo "$i $code"
done
```

3. Expected: the first 30 return **200**; the 31st returns **429**.
4. Record the exact sequence. Do not restart the Render service to reset the limiter.

If the API check is not possible, click an export button 31 times in `/exports` and record the
error on the 31st. This is slower but valid.

**PASS:** the 31st request is rate-limited. **FAIL:** all 31 succeed or the limit is absent.

#### AD-11 — Impersonation

1. On L2, open `/admin` → **Users**.
2. Find S1; click **View as**.
3. Complete the passkey prompt if asked.
4. Verify the impersonation banner: “You are viewing as …” and the admin identity.
5. Open a safe student page (dashboard or analytics); do not submit a proof as the impersonated
   student.
6. Click **Return to admin**.
7. Verify you are back in the admin console.
8. Verify the audit log records the impersonation start and stop with both identities.

**PASS:** impersonation is explicit, time-limited and audited; returning works.

#### AD-12 — Attendance override and deletion (last)

Use a disposable third session so the main flow is not disturbed. If **Security** shows the
step-up window **Open** from an earlier action, wait until it shows **Locked** first, so the
assertion is genuinely tested rather than reusing the window.

1. On L1, start a session for `TST101`; close it immediately; finalise it.
2. On L2, open `/admin` → **Sessions**; find that session; click **Register**.
3. Select a row; change the status; add a decision note; save.
4. Complete the passkey prompt.
5. Verify the row changes and the audit log records the override.
6. Delete the same row: click **Delete attendance row** → **Confirm delete**; complete the
   passkey prompt.
7. Verify the row is gone and the audit log keeps the previous status and actor.
8. Do not delete audit entries.

**PASS:** override/delete work only with step-up and are audited.  
**FAIL:** either action succeeds without a passkey.

#### AD-13 — Headers, cookie flags and CSP

1. In a terminal:

```bash
curl -sS -D - -o /dev/null https://bio-attend.onrender.com/
curl -sS -D - -o /dev/null https://bio-attend.onrender.com/api/v1/health
```

2. Verify:
   - `content-security-policy` is present and does not allow inline scripts.
   - `strict-transport-security` is present.
   - API responses include `cache-control: no-store`.
   - `x-frame-options: DENY`, `x-content-type-options: nosniff`,
     `permissions-policy` includes `microphone=(self)`.
3. In Chrome DevTools → Application → Cookies, verify the session cookie is `HttpOnly`,
   `Secure` and `SameSite=Lax`.
4. In DevTools → Application → Local Storage / Session Storage, verify no session token is
   stored.
5. Open `/login`, `/teacher-dashboard`, `/student/check-in` and `/admin`; verify the console has
   no CSP violations and the Google button renders.

**PASS:** every header/cookie check matches. **FAIL:** inline script allowed, token in
JavaScript storage, or a CSP violation.

#### AD-14 — Readiness and cold start

1. If the instance may be asleep, time a cold request:

```bash
time curl -sS -o /dev/null -w '%{http_code}\n' https://bio-attend.onrender.com/api/v1/health/ready
```

2. Record the time and status.
3. Verify `/api/v1/health` stays 200 and `/api/v1/health/ready` reports the database as true.

Do **not** stop Atlas or the Render service to test the 503 path in production. The 503
behaviour is covered by automated tests; record it as **NOT RUN** manually.

**PASS:** readiness is green and the cold-start time is recorded.

#### AD recording table

| Test | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| AD-01 First binding review | Pending → approved, same session |  |  |  |
| AD-02 Rejected device | No evidence; old device intact |  |  |  |
| AD-03 Replaced device | Both old and new sessions 401 |  |  |  |
| AD-04 No dev/demo | 404/hidden |  |  |  |
| AD-05 Passkey registration | Credential listed |  |  |  |
| AD-06 No step-up | 428 |  |  |  |
| AD-07 Step-up action | Success + audit |  |  |  |
| AD-08 Five-minute window | Open → Locked |  |  |  |
| AD-09 Audit chain | Intact |  |  |  |
| AD-10 Export limit | 31st = 429 |  |  |  |
| AD-11 Impersonation | Banner + audit |  |  |  |
| AD-12 Override/delete | Step-up + audit |  |  |  |
| AD-13 Headers/CSP | All present |  |  |  |
| AD-14 Readiness | 200 + timing |  |  |  |

### 4.4 Suite PDF — roster and timetable previews

**Preconditions:** G1 and G6 PASS; T1 is signed in on L1; the real `TST101` roster is known.

The rule is **extract → review → preview → confirm**. Extraction never saves. If a file
upload changes the roster or creates a slot before the teacher clicks save/add, the test fails.

#### PDF-01 — Roster text-layer extraction

1. Open `/teacher/classes`; select `TST101 · T`.
2. In the roster card, click **Upload CSV or PDF**.
3. Choose `test-artifacts/roster-text-layer.pdf`.
4. Wait for **Extracting PDF…** to finish.
5. Verify:
   - The textarea **Roster text (CSV or extracted PDF)** fills with the synthetic roster.
   - The status says the PDF text was extracted and asks you to review it before previewing.
   - The page reports one page and **10 college emails found**.
6. Do **not** click **Save roster**.
7. Verify the saved roster count is unchanged.
8. As A1 on L2, open `/admin` → **Audit** and verify no class/roster save entry was written by
   the extraction.

**PASS:** extraction fills the box, saves nothing and writes no roster audit entry.

#### PDF-02 — Roster preview validation

1. Click **Preview roster**.
2. Verify the preview panel says **Ready**, lists the synthetic students and shows zero errors.
3. Verify the added/removed counts compare with the saved roster.
4. Do **not** click **Save roster**.
5. Verify the saved roster count is still unchanged.

**PASS:** preview validates rows without saving.

#### PDF-03 — Roster no-text-layer rejection

1. Click **Upload CSV or PDF**; choose `test-artifacts/no-text-layer.pdf`.
2. Verify the error: “This PDF has no selectable text layer. Use CSV or paste the list instead;
   local OCR is not built yet.”
3. Verify the textarea and saved roster are unchanged.

**PASS:** a scanned/image-only PDF is rejected; nothing is guessed or saved.

#### PDF-04 — Roster save path with real accounts

1. In the textarea, replace the synthetic lines with the real roster text currently shown for
   the class (S1–S3, plus S4 if it was added for AD-01).
2. Click **Preview roster**; verify the expected valid count and zero errors.
3. Click **Save roster**.
4. Read **Replace this class roster?** and click **Confirm save**.
5. Verify the success toast shows the active student count.
6. Verify the roster list matches the real accounts and the saved count.

**PASS:** the extract → edit → preview → confirm path saves only after the explicit
confirmation.  
Do not save synthetic emails into the attendance class.

#### PDF-05 — Timetable text preview

1. Open `/timetable`.
2. Record the current number of active slots.
3. Click **Import PDF text**; choose `test-artifacts/timetable-text-layer.pdf`.
4. Verify the modal **Timetable PDF text preview** opens.
5. Verify the warning **Nothing has been scheduled**.
6. Verify the extracted text is read-only and contains the synthetic timetable lines.
7. Click **Close preview**.
8. Verify the slot count is unchanged and no new slot appears.

**PASS:** the text preview is read-only; no slot, class or attendance record is created.

#### PDF-06 — Timetable no-text-layer rejection

1. Click **Import PDF text**; choose `test-artifacts/no-text-layer.pdf`.
2. Verify the error: “This timetable PDF has no selectable text layer. Add slots manually for
   now; local OCR is not built yet.”
3. Verify no modal with invented text opens and the slot count is unchanged.

**PASS:** scanned/image-only timetable is rejected with a clear message.

#### PDF-07 — Add a slot manually from the preview

1. Import `timetable-text-layer.pdf` again; read the text.
2. Click **Close preview**.
3. Click **Add slot**; choose `TST101`, a day, start/end time and room.
4. Save; verify the slot appears.
5. Verify `/teacher/check-in` still shows no live session for the class.

**PASS:** the teacher manually schedules a slot; the timetable remains a plan.

#### PDF-08 — Production rejects Gmail roster rows

1. In the roster textarea, paste a Gmail address, for example `someone@gmail.com`.
2. Click **Preview roster**.
3. Verify the error “Use a valid @nitjsr.ac.in email.”
4. Remove the Gmail row; do not save an invalid roster.

**PASS:** the production deployment refuses non-college roster rows, proving
`ALLOW_TEST_ROSTER_EMAILS` is not enabling a rehearsal bypass.

#### PDF-09 — Document limits (NOT RUN manually)

The 10 MB, 20-page and 200,000-character limits, password-protected PDFs and damaged PDFs are
covered by automated tests. Do not spend the manual session generating 10 MB files unless the
owner asks. Record **NOT RUN (automated coverage)**.

#### PDF-10 — No auto-save audit check

1. After PDF-01, PDF-02, PDF-03, PDF-05 and PDF-06, on L2 open `/admin` → **Audit**.
2. Search for `roster`, `timetable`, `class` and `slot`.
3. Verify no save/create entry exists for the extraction steps.
4. Verify entries appear only after the explicit save/add in PDF-04 and PDF-07.

**PASS:** extraction leaves no write audit trail.

#### PDF recording table

| Test | File | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| PDF-01 Roster extraction | `roster-text-layer.pdf` | Text fills; no save |  |  |  |
| PDF-02 Roster preview | same | Ready; no save |  |  |  |
| PDF-03 Roster no-text | `no-text-layer.pdf` | Rejected |  |  |  |
| PDF-04 Roster save | real roster | Saves after confirm |  |  |  |
| PDF-05 Timetable preview | `timetable-text-layer.pdf` | Read-only; no slot |  |  |  |
| PDF-06 Timetable no-text | `no-text-layer.pdf` | Rejected |  |  |  |
| PDF-07 Add slot | manual | Slot only; no session |  |  |  |
| PDF-08 Gmail row | Gmail | Rejected |  |  |  |
| PDF-10 No auto-save | — | No write audit |  |  |  |

### 4.5 Suite DP — deployment verification

**Preconditions:** G2 PASS; A1 signed in on L2.

#### DP-01 — Live commit and deploy log

1. Open the Render dashboard → service → **Events/Deploys**.
2. Record the live commit, deploy time, status and build duration.
3. Open the deploy log; verify the build completed and the start log shows MongoDB connected
   and indexes ready.
4. Compare the live commit with G1's `HEAD`.

**PASS:** the live commit equals the reviewed commit and the deploy log is clean.

#### DP-02 — Health and readiness

1. Open `/api/v1/health`; verify 200 and `status: ok`.
2. Open `/api/v1/health/ready`; verify 200 and `checks.database: true`.
3. Record the cold-start time if the instance was asleep.

**PASS:** both endpoints return the expected values.

#### DP-03 — Production configuration

1. Verify `/login` has no dev personas.
2. Verify `/api/v1/auth/dev/accounts` returns 404.
3. Verify `/api/v1/admin/demo/status` returns 404 as A1.
4. Verify the admin console does not show **Demo data**.
5. Verify a Gmail roster row is rejected (PDF-08).
6. Verify the Google chooser can show the approved college accounts and does not force an
   unapproved domain.

**PASS:** production-only rules are active.

#### DP-04 — PWA and offline shell

1. On L1, open `/login`; open DevTools → Application → **Service Workers**; verify the worker is
   activated for the origin.
2. Open **Manifest**; verify the app name, icons and start URL.
3. Set DevTools → Network → **Offline**; reload a previously visited page.
4. Verify the offline shell appears; API data must not be served from a stale cache.
5. Return to **Online**; reload; verify the page works again.

**PASS:** the shell is installable/offline-capable; API responses are not cached as
attendance data.

#### DP-05 — Console and CSP sweep

1. On L1 (teacher), open `/teacher-dashboard`, `/queries`, `/exports`, `/timetable` and
   `/acoustic-lab`.
2. On L2 (A1), open `/admin`.
3. On P2 (S1), open `/student/check-in`.
4. Open `/login` in a signed-out tab.
5. For each page, check the console for errors and CSP violations.
6. Verify the Google button renders on `/login`.
7. Record the page list and result.

**PASS:** no errors or CSP violations on any page.

#### DP recording table

| Test | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| DP-01 Live commit | Matches HEAD |  |  |  |
| DP-02 Health/readiness | 200/200 |  |  |  |
| DP-03 Production config | No dev/demo |  |  |  |
| DP-04 PWA/offline | Shell only |  |  |  |
| DP-05 CSP sweep | No violations |  |  |  |

### 4.6 Suite RS — encrypted backup and restore drill

**Preconditions:** G5 PASS. If any prerequisite is missing, mark the whole suite **BLOCKED**.

Read [`docs/backup-restore.md`](backup-restore.md) before starting. Never restore over
production. Never write a decrypted archive to disk. Never record the passphrase.

#### RS-01 — Take the encrypted backup

```bash
export DB_URI='...'
export BACKUP_PASSPHRASE='...'
./scripts/backup-db.sh
```

1. Verify the script writes one encrypted file under `backups/` and a `.sha256` sidecar.
2. Verify the script's decrypt-and-`gzip -t` check passes.
3. Record the file name, size and time. Do not record the passphrase.
4. Confirm the source database is still healthy.

**PASS:** encrypted file and checksum exist; integrity check passes.

#### RS-02 — Restore to a scratch database

```bash
export DB_URI='...'
export BACKUP_PASSPHRASE='...'
export BACKUP_FILE='backups/<file>.archive.gz.enc'
export SOURCE_DB='attendance'
export RESTORE_DB='attendance_restore_YYYYMMDD'
./scripts/restore-db.sh
```

1. Verify the script refuses to restore if `RESTORE_DB` is missing `_restore_`/`_drill_` or
   equals `SOURCE_DB`.
2. Restore into the scratch database.
3. Do not point the app at the scratch database.

**PASS:** the restore completes against the scratch database.

#### RS-03 — Compare collections and known records

Use `mongosh` or the Atlas Data Explorer:

```javascript
const source = db.getSiblingDB("attendance");
const restored = db.getSiblingDB("attendance_restore_YYYYMMDD");
for (const name of source.getCollectionNames().sort()) {
  print(name, source.getCollection(name).countDocuments(), restored.getCollection(name).countDocuments());
}
```

1. Compare counts for at least:
   `users`, `courseclasses`, `enrollments`, `checkinsessions`, `attendancerecords`,
   `attendancequeries`, `timetables`, `auditlogs`.
2. Read one known student and one known class from the restored database.
3. Verify a known session and its attendance rows exist.
4. Record counts and the known records (IDs only; no secrets).

**PASS:** counts match and known records are readable.  
**FAIL:** missing collections, count mismatch or unreadable records.

#### RS-04 — Delete the scratch database and confirm production

1. Drop the scratch database.
2. Verify it is gone.
3. Verify the production app still returns `/health/ready` 200 and the test class/roster are
   unchanged.
4. Record the deletion time.

**PASS:** scratch database deleted; production untouched.

#### RS-05 — Operator log

Record:

- backup file name and size;
- restore database name;
- collection counts;
- known records checked;
- start/end time;
- result;
- passphrase location (the password manager entry name, never the value);
- any deviation.

**PASS:** the log is complete and contains no secret.

#### RS recording table

| Test | Expected | Observed | Result | Evidence |
| --- | --- | --- | --- | --- |
| RS-01 Encrypted backup | File + checksum |  |  |  |
| RS-02 Scratch restore | Completes |  |  |  |
| RS-03 Counts/records | Match |  |  |  |
| RS-04 Cleanup | Scratch gone; prod intact |  |  |  |
| RS-05 Operator log | Complete, no secret |  |  |  |

---

## 5. Recording templates

### 5.1 Master run sheet

| Field | Value |
| --- | --- |
| Test date |  |
| Start / end time |  |
| Commit under test |  |
| Live deploy commit |  |
| Render URL | https://bio-attend.onrender.com |
| Test class |  |
| Room |  |
| Test lead |  |
| Teacher account |  |
| Student accounts |  |
| Super-admin account |  |
| Devices used |  |
| Overall result | PASS / FAIL / BLOCKED |
| Go/no-go recommendation |  |

### 5.2 Device matrix

Copy the table from §2.3 and fill every cell. If a device is missing, write **MISSING**; do not
silently substitute a different device.

### 5.3 Gate checklist

| Gate | PASS/FAIL/BLOCKED | Evidence file/link | Time | Initials |
| --- | --- | --- | --- | --- |
| G0 |  |  |  |  |
| G1 |  |  |  |  |
| G2 |  |  |  |  |
| G3 |  |  |  |  |
| G4 |  |  |  |  |
| G5 |  |  |  |  |
| G6 |  |  |  |  |
| G7 |  |  |  |  |

### 5.4 Acoustic run table

Use the table in §4.1. Add one row per receiver per distance. Attach the TX/RX JSON file names.

### 5.5 Signed-flow table

Use the table in §4.2. Add one row per student per session where the student acts.

### 5.6 Admin table

Use the table in §4.3. Record the HTTP status for AD-06 (428) and AD-10 (429).

### 5.7 PDF table

Use the table in §4.4. Record the exact toast/error text.

### 5.8 Deployment/restore table

Use the tables in §4.5 and §4.6. Record the live commit and the restore counts.

### 5.9 Defect log

| ID | Suite/step | Severity | What happened | Expected | Evidence | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 |  | P0/P1/P2/P3 |  |  |  |  | Open |

Severity guide:

- **P0** — attendance changes without a teacher, device/passkey bypass, audit break, data loss,
  production secret exposure.
- **P1** — core flow blocked (sign-in, check-in, register, query, export), wrong attendance for
  a test student, PDF auto-save.
- **P2** — confusing UI, missing evidence, notification/analytics mismatch, recoverable error.
- **P3** — cosmetic or documentation issue.

### 5.10 Evidence index

| File | Suite/step | Device | What it shows | Redacted? |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

### 5.11 Daily sign-off

| Item | Value |
| --- | --- |
| Suites completed |  |
| Suites blocked |  |
| P0/P1 defects |  |
| P2/P3 defects |  |
| Evidence folder |  |
| Next action |  |
| Signed by |  |

---

## 6. Suggested execution order and time budget

| Block | Duration | Notes |
| --- | --- | --- |
| G0–G4, G6–G7 preflight | 60–90 min | Do not rush G2 (live commit) or G4 (roster) |
| AC suite | 2–3 h | Quiet room; take breaks; do not change volume mid-series |
| FL suite | 2–3 h | Two sessions; keep the teacher and student devices charged |
| AD suite | 1.5–2 h | Includes a real five-minute wait for AD-08 |
| PDF suite | 45–60 min | Synthetic PDFs only |
| DP suite | 30–45 min | Headers, PWA, CSP |
| RS suite | 30–60 min | Only if G5 is PASS |
| Buffer and defect triage | 60 min | Capture evidence before fixing anything |

Recommended spread: **Day 1** = G0–G4 + AC; **Day 2** = FL + AD; **Day 3** = PDF + DP + RS and
sign-off. If the team is small, run one suite per half-day and stop when tired; acoustic
measurements are not valid when the tester is rushing.

Warm the Render instance before each block:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://bio-attend.onrender.com/api/v1/health/ready
```

If it takes more than a few seconds, wait for the cold start before starting a timed test.

---

## 7. Go/no-go criteria

### 7.1 GO for a limited pilot (test class only)

All of these must be true:

- [ ] G0–G4, G6, G7 PASS.
- [ ] G2 live commit matches the reviewed commit.
- [ ] AC: 1 m forward and reverse ≥95%; 5 m and 10 m measured and recorded; muted control 0/10.
- [ ] FL: full session A and B flow PASS; evidence-only boundary holds at FL-09.
- [ ] AD: device review, 428/step-up, audit chain, export limit and production config PASS.
- [ ] PDF: no auto-save; no auto-created slot; no-text rejection PASS.
- [ ] No open P0 or P1 defect.

### 7.2 GO for a real-data pilot

Everything in §7.1 **plus**:

- [ ] AC: 1 m, 5 m and 10 m meet ≥95% in **both directions**, with 0 muted decodes.
- [ ] RS: encrypted backup and restore drill PASS, or the owner records a written risk
      acceptance with a date and a remediation plan.
- [ ] The owner accepts the remaining P2/P3 defects.

### 7.3 NO-GO

Any of these is an automatic NO-GO:

- live commit mismatch;
- attendance changes without a teacher decision;
- device or passkey bypass;
- audit chain break;
- PDF extraction saves or schedules by itself;
- dev/demo/test-account access in production;
- restore drill BLOCKED for a real-data pilot (unless the owner signs a written risk
  acceptance);
- 1 m acoustic link below 95%.

### 7.4 Decision

| Decision | Criteria | Signed by | Date |
| --- | --- | --- | --- |
| Limited pilot | §7.1 |  |  |
| Real-data pilot | §7.2 |  |  |
| No-go | §7.3 |  |  |

---

## 8. Cleanup and handoff

1. Sign out every test account on every device.
2. Revoke test sessions from `/admin` → **Users** → **Sign out** if a device is lost or a
   session is suspicious.
3. Keep the acoustic reports in `measurements/YYYY-MM-DD/`.
4. Keep the test evidence folder local and gitignored; do not commit student PII.
5. Do not delete audit entries. The test class and its sessions may remain as labelled test
   data; ask the owner before deleting anything from the database.
6. Record the test class ID, session IDs and account emails in the run sheet so the owner can
   find and remove them later.
7. Clear the `TOKEN` shell variable and any temporary files containing cookies.
8. Tell the owner: what passed, what failed, what is blocked, and whether the go/no-go criteria
   are met.

---

## 9. Known limitations and blocked items

These are not failures of this test plan; they are boundaries of the current build.

| Item | Status | Consequence |
| --- | --- | --- |
| A2b structured timetable parsing | **Not built** | The timetable PDF preview is text only; every slot is added manually |
| A3 local OCR | **Not built** | Scanned/image-only PDFs are rejected; no OCR fallback |
| A4 Gemini extraction | **Gated** | No raw roster/timetable leaves the server; no consent/risk text exists |
| Real college PDF layout accuracy | **Unvalidated** | Synthetic PDFs test mechanics, not real layout; do not claim accuracy |
| Physical Layer 1 gate | **Not measured-passed** | This plan measures it; it may fail at 5 m/10 m. Never describe it as passed before the numbers say so |
| Reverse direction and muted control | **Unmeasured** | AC-07–AC-11 measure them; record actual results |
| Exact live Render commit | **Owner must verify** | G2 is a hard gate |
| Atlas restore drill | **Prerequisites unconfirmed** | RS is BLOCKED if G5 fails |
| iOS/Safari | **Not covered** | Do not include iPhones in the acoustic or signed flow |
| 24-hour query expiry | **Not waited** | The window opens correctly; expiry is covered by automated tests |
| PDF size/page/character limits | **Automated only** | Marked NOT RUN manually unless the owner asks |
| In-memory rate limits | **Single instance** | A Render restart resets them; do not scale out without a shared store |

---

## Appendix A — Quick click cards

### Teacher (L1/P1)

| Task | Path and clicks |
| --- | --- |
| Sign in | `/login` → Google button → choose T1 |
| Create room/class | `/teacher/classes` → **Add room** → **Room number** → **Add room**; fill **Course code**, **Section**, **Class title**, **Default room** → **Create class** |
| Roster | Select class → **Upload CSV or PDF** or paste → **Preview roster** → **Save roster** → **Confirm save** |
| Approve device | `/teacher/classes` → **Device approval queue** → **Approve** / **Reject** |
| Start check-in | `/teacher/check-in` → select class → **Start check-in** |
| Transmit | **Open transmitter** → **Start transmitting** |
| Advance | **Advance wave** → **Confirm advance** |
| Register | **Attendance register** → status dropdown → note → **Save N changes**; after **Close check-in**, **Finalise attendance** → **Confirm finalise** |
| Close | **Close check-in** → **Confirm close** |

### Student (P2–P4)

| Task | Path and clicks |
| --- | --- |
| Sign in | `/login` → Google button → choose student |
| Check in | `/student/check-in` → tick consent → **Join check-in** → allow microphone → wait for **Evidence recorded** |
| Query | `/queries` → **Raise a query** → select session → reason ≥10 characters → **Send query** |
| Analytics | `/attendance` |
| Sign out | `/profile` → **Sign out** |

### Super-admin (L2)

| Task | Path and clicks |
| --- | --- |
| Open console | `/admin` |
| Users | **Users** → search → **Edit** / **View as** / **Sign out** |
| Security | **Security** → **Register passkey** / **Register another passkey** |
| Audit | **Audit** → **Verify chain** |
| Sessions | **Sessions** → **Register** |
| Settings | **Settings** → change → **Save settings** (step-up) |

---

## Appendix B — Useful commands

### Health and headers

```bash
curl -sS https://bio-attend.onrender.com/api/v1/health
curl -sS https://bio-attend.onrender.com/api/v1/health/ready
curl -sS -D - -o /dev/null https://bio-attend.onrender.com/
curl -sS -D - -o /dev/null https://bio-attend.onrender.com/api/v1/health
```

### Generate PDF fixtures

```bash
cd attendance-backend
node scripts/generate-test-pdfs.js
```

### Local test gate

```bash
cd attendance-backend && npm test
cd attendance-backend && npm test -- --test-isolation=none
cd attendance-frontend && npm run test:proof && npm run test:acoustic
cd attendance-frontend && npm run test:checkin && npm run test:studentcheckin
cd attendance-frontend && npm run test:auth && npm run test:rosterimport && npm run test:timetableimport
```

### Encrypted backup/restore

```bash
export DB_URI='...'
export BACKUP_PASSPHRASE='...'
./scripts/backup-db.sh
export BACKUP_FILE='backups/<file>.archive.gz.enc'
export SOURCE_DB='attendance'
export RESTORE_DB='attendance_restore_YYYYMMDD'
./scripts/restore-db.sh
```

Never commit `backups/`, `test-evidence/` or `test-artifacts/`.

---

## Appendix C — Evidence naming and redaction

| Type | Name | Store |
| --- | --- | --- |
| Screenshot | `YYYYMMDD-<suite>-<step>-<device>.png` | `test-evidence/YYYY-MM-DD/` |
| Acoustic TX | `tx-<runId>-<distance>.json` | `measurements/YYYY-MM-DD/` |
| Acoustic RX | `rx-<runId>-<distance>.json` | `measurements/YYYY-MM-DD/` |
| Export | `YYYYMMDD-<suite>-<step>-<session>.<ext>` | `test-evidence/YYYY-MM-DD/exports/` |
| Backup | `attendance-<timestamp>.archive.gz.enc` | `backups/` (gitignored) |
| Defect | `D-<nn>-<suite>-<step>.md` | `test-evidence/YYYY-MM-DD/defects/` |

Redact before sharing outside the test team:

- student names and emails;
- session keys and QR/tone payloads;
- cookies and authorization headers;
- database URIs and passphrases;
- location coordinates if they identify a home or hostel.

---

## Appendix D — Glossary

| Term | Meaning |
| --- | --- |
| **Evidence** | A signed record that a bound phone heard a session/wave key; it does not decide attendance |
| **Register** | The teacher-owned attendance list for one session |
| **Finalise** | Publish the register; pending rows become absent |
| **Query** | A student's 24-hour correction request after a session closes |
| **Step-up** | A fresh passkey assertion required for destructive admin actions |
| **Device review** | Teacher approval of a first or changed student browser |
| **Wave** | A two-minute key period; the teacher advances only after evidence |
| **A2a** | Timetable PDF text extraction into a read-only preview (built) |
| **A2b** | Structured timetable row parsing (not built) |
| **A3** | Local OCR (not built) |
| **A4** | Optional Gemini extraction (gated) |
| **Layer 1** | The physical acoustic gate (measured, not assumed) |

---

*This plan is a test document, not a deployment authorisation. The owner controls every push,
tag, merge and deploy.*
