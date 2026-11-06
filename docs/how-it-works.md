# How it works

## The two apps

| Folder | What it is |
| --- | --- |
| `attendance-frontend/` | The website in the browser: React pages, the tone codec, the sound lab and the PWA shell. |
| `attendance-backend/` | The Express API and the MongoDB models. It owns authentication, sessions, attendance, queries, exports and the admin console. |

The frontend calls `/api/v1` with an httpOnly cookie; the backend talks to MongoDB and
verifies Google Identity tokens. In production one Render service serves both the built
React app and the API, so cookies stay first-party.

The PlantUML sources in [`docs/diagrams/`](diagrams/) show the component map, the
end-to-end check-in flow and the proof sequence. The complete page/API list is in
[routes.md](routes.md).

## Signing in and binding a device

Sign-in uses Google only — there are no passwords. The server:

1. Verifies the Google ID token and requires a verified email.
2. Applies the exact-match allowlists: college teachers in `TEACHER_EMAILS`, college
   students on an active class roster, and optional Gmail test accounts in
   `TEST_STUDENT_EMAILS` / `TEST_TEACHER_EMAILS`.
3. Grants `superadmin` only to an exact address in `SUPER_ADMIN_EMAILS`. This is an
   environment grant, not a UI toggle, and it works in production as well as development.
4. Creates or updates the user row and sets an httpOnly session cookie.

Allowlists are validated at startup. An address may appear in only one list; removing a
Gmail test address rejects its live session on the next request. Removing a college
teacher from `TEACHER_EMAILS` does not demote an existing teacher. Rotating `JWT_SECRET`
signs everyone out; setting `JWT_SECRET_PREVIOUS` to the old value keeps existing sessions
verifiable for one rotation window while new tokens use the new secret.

On the first successful sign-in the browser creates a P-256 key pair. The public key is
registered as the **device binding**; the private key stays in IndexedDB. Both the first
binding and a different browser become a **pending device request** that a teacher approves
or rejects from the review queue. Dev/test personas auto-approve. A pending request blocks
proof submission, and approving a replacement device revokes the old session.

The super-admin console is available in production. Its **Demo data** tab and demo metric
appear only outside production; `/api/v1/admin/demo/*` returns 404 in production. The rest
of the console — users, classes, sessions, attendance overrides, queries, audit, settings
and impersonation — stays available.

## Admin security and audit integrity

A signed-in super-admin session is not enough for destructive console actions. Settings,
role/status changes, session revocation, attendance override/delete, impersonation and demo
reset require a fresh **WebAuthn/passkey assertion**:

1. The owner registers a platform passkey once under **Admin → Security**. The first
   enrollment is trust-on-first-use; adding another passkey requires an existing approval.
2. A protected request without approval returns **428** with
   `code: "step_up_required"`.
3. The frontend asks for the passkey, verifies the assertion server-side, and sets a
   five-minute `HttpOnly` cookie scoped to `/api/v1/admin`. The original request is retried.
4. The expected origin and relying-party ID come from server configuration
   (`WEBAUTHN_ORIGINS`, `CLIENT_URL(S)` or `RENDER_EXTERNAL_URL`), never from a request
   header. Production requires HTTPS.
5. If every passkey is lost, destructive actions stay locked until an operator removes the
   stale `adminpasskeys` rows. Keep a second passkey on another device.

Audit entries now form a **SHA-256 hash chain**. Each row stores `seq`, `prevHash` and a
`hash` over its canonical fields. `GET /admin/audit/verify`, and the **Verify chain** button
in the console, recomputes the chain in order and reports the first break; rows written
before P1 are reported as legacy rather than rewritten. The chain append is serialised
in-process, which is correct for the single Render instance.

Every export is itself audited (`export.attendance.pdf`, `export.audit.xlsx`, and so on) and
limited to 30 downloads per 10 minutes per account/IP. `/health/ready` reports 503 until
MongoDB is connected, while `/health` remains a liveness probe. A settings patch only inserts
defaults for fields it is not already setting, avoiding Mongo's `$set`/`$setOnInsert`
path-conflict error.

## Classes, rooms and rosters

- A **room** is just a room number, e.g. `B-204`.
- A **class** has a course code, title, section, default room and a **roster**.
- The roster is the list of college emails allowed to submit evidence for that class. It
  also creates one attendance row per active student when a session starts.
- Teachers import the roster from CSV, paste it, or upload a text-based PDF. The server
  lowercases and de-duplicates addresses, rejects non-college addresses and flags malformed
  roll numbers.
- For non-production rehearsals only, `ALLOW_TEST_ROSTER_EMAILS=true` admits the exact
  `TEST_STUDENT_EMAILS` addresses to a roster. Production startup refuses the flag. Dev
  personas never join a roster.

### Roster PDF extraction

The teacher opens **Classes → roster → Upload CSV or PDF**. The browser sends one PDF to
`POST /classes/:classId/roster/pdf/preview`; the server:

1. checks that the caller owns the class and that the file starts with a PDF header;
2. reads the embedded text layer with PDF.js — it does not render or OCR the page;
3. groups text items by their visual `y` position, sorts each line left-to-right and joins
   character/word fragments back into readable lines;
4. returns the text plus page, line and college-email counts.

The frontend puts that text into the existing roster textarea. The teacher can correct it,
then **Preview roster** validates rows and **Save roster** still needs a separate confirmation.
Extraction never writes enrollments, creates a class or marks attendance.

The endpoint accepts at most **10 MB**, **20 pages** and **200,000 characters**, and is
limited to **20 extractions per 10 minutes** per account/IP. A scanned PDF returns
`pdf_no_text_layer`; a password-protected, oversized or damaged PDF also gets a stable error
code. Local OCR is not built yet. No real college PDFs have been supplied, so layout accuracy
on those documents is unvalidated.

### Timetable PDF text preview

The teacher opens **Timetable → Import PDF text**. The browser sends one PDF to
`POST /timetable/pdf/preview`; the server runs the same deterministic text-layer extraction
and returns a read-only preview with page and line counts.

This is deliberately **not** a timetable parser. It does not:

- recognise day or time columns;
- match course codes or sections to existing classes;
- create a class, slot or attendance record; or
- write anything to the database.

The teacher reads the text and adds each slot with **Add slot**, choosing an existing owned
class. Structured timetable parsing stays gated on representative timetable samples so the
parser is not invented from guesswork. The same 10 MB, 20-page, 200,000-character and
20-per-10-minute limits apply. A scanned timetable is rejected until local OCR exists.

## Check-in sessions and evidence

The teacher opens **Check-in** (`/teacher/check-in`), chooses an owned class and starts a
session. The server:

- creates one session per class (a partial unique index prevents two active sessions);
- starts at **wave 0** with a fresh seven-symbol key from the 15^7 space;
- keeps the key alive for **two minutes** and returns it only to the owning teacher;
- exposes the live session's class, room, wave and expiry to enrolled students, never the
  key.

A student opens `/student/check-in` while the session is live:

1. The retention/consent notice must be accepted before **Join** enables.
2. The phone listens through an AudioWorklet, decodes the current wave locally and keeps
   raw audio on the device.
3. It signs the canonical `session / wave / key / student` message with the bound P-256
   key and submits the proof.
4. The server checks the signature, active roster enrollment, approved binding and fresh
   key, then stores the proof as **evidence only**. Retries are idempotent per
   student/wave, submissions are capped at 60/minute per student, and evidence expires
   after about one day.
5. The page shows a recorded-evidence card. It never displays the key. If the teacher
   advances the wave while the phone is listening, listening stops and the student is
   asked to tap Join for the new wave.

**Advance wave** is a separate teacher-only action. It requires at least one accepted
proof in the current wave, atomically matches the session/wave, archives the old key in a
bounded 20-entry server-side history and mints a fresh two-minute key. The teacher view
returns a key-free timeline; students never receive key history.

The teacher **Evidence** card is read-only: student email, wave, recorded time and
per-wave counts, with `attendanceDecided: false`. It selects no key, signature, protocol
version or device fingerprint.

The student cascade that would hand the next key back to phones and have them retransmit
is **not built**. Today the teacher advances waves manually and phones submit evidence for
the live wave only. Scoring and the ID round remain future work.

## Attendance, queries and reports

A session starts with one attendance row per active roster student. When the check-in is
over the teacher closes the session, then opens the **Register**, sees the proof evidence,
optional location and event timeline for each student, marks **present / absent / excused**,
and **finalises** the register. Finalising publishes it and turns remaining pending rows
into absent. The 24-hour query window is tied to the session close, not to finalisation.
Later corrections keep a decision note and an audit entry; a super-admin can override or
delete a row with the same audit trail.

After a session closes, a student who was present but unmarked can raise a **query** for
**24 hours**. The teacher sees the reason plus the student's check-in/query location, the
teacher's session-start location, timestamps, accuracy and distance, and can approve,
reject or reopen. Approving marks the student present and the query counts toward their
percentage. Every action is appended to the query audit log.

**Analytics** turn the same records into class averages, per-student percentages, session
trends, term totals and query counts. Pending rows are shown separately from absences.
**Exports** generate PDF and Excel files for a class register, one session, queries, the
user directory and the audit log from the same records as the screen. Each download writes
an audit entry and is rate limited.

Location is **optional evidence**, not a gate. A denied browser permission never blocks a
session start, check-in or query.

## Page map in one glance

| Area | Pages |
| --- | --- |
| Public | `/`, `/login`, `/acoustic-lab`, `/acoustic-tx`, `/acoustic-rx` |
| Student | `/student-dashboard`, `/student/check-in` |
| Teacher | `/teacher-dashboard`, `/teacher/classes`, `/teacher/check-in` |
| Shared signed-in | `/teacher/sessions`, `/attendance`, `/queries`, `/exports`, `/notifications`, `/timetable`, `/profile`, `/help` |
| Super-admin | `/admin` |
| Fallback | `*` renders the 404 page |

The access rule, query parameters and purpose of every page are in
[routes.md](routes.md).

## The tones (the actual trick)

- A frame uses **17 tones** spaced about 110 Hz apart in the **18.0–19.8 kHz** band —
  near-ultrasonic, so most adults cannot hear it.
- Each symbol lasts **120 ms**; a frame is 2 marker + 7 data + 2 check symbols, about
  **1.3 s**. Data digits are base 15, and adjacent data/check tones never repeat.
- Phones play with a ~6 ms fade in/out to avoid clicks and listen with Goertzel filters in
  an AudioWorklet. A tone must sit about **9 dB above the median** of the 17 tones.
- `getUserMedia` disables echo cancellation, noise suppression and auto gain control, and
  the lab refuses a context below **44.1 kHz**.
- The code lives in `attendance-frontend/src/acoustic/fsk.js`,
  `public/tone-detector-worklet.js` and `src/acoustic/receiver.js`.

Measured so far: the 2026-10-25 sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at 3 m,
**4/10 at 5 m** and **1/10 at 10 m**. RX margins at 5–10 m were 10.2–12.9 dB, close to the
9 dB threshold. On the Samsung M32 lab run, tones up to 18.5 kHz were clear but 19.5 kHz
was too weak. The band and TX settings still need tuning; the reverse direction and muted
control are unmeasured. The owner treats Layer 1 as passed **for build planning only** —
that is an assumption, not a measurement.

## Where things live in the code

| Job | File |
| --- | --- |
| Google sign-in, allowlists, device review | `attendance-backend/controllers/googleAuthController.js`, `utils/signInPolicy.js` |
| Classes, rooms, rosters | `attendance-backend/controllers/classController.js`, `utils/roster.js` |
| Roster and timetable PDF text extraction | `attendance-backend/utils/pdfText.js`, `middleware/pdfUpload.js`, `controllers/classController.js`, `controllers/timetableController.js` |
| Check-in sessions and wave history | `attendance-backend/controllers/checkInSessionController.js`, `utils/checkInSession.js` |
| Proof transport | `attendance-backend/controllers/checkInProofController.js`, `utils/checkInProof.js` |
| Attendance register, analytics and history | `attendance-backend/controllers/attendanceController.js`, `utils/attendance.js` |
| Queries and audit | `attendance-backend/controllers/queryController.js`, `models/attendanceQueryModels.js` |
| PDF / Excel exports | `attendance-backend/controllers/exportController.js` |
| Super-admin, settings, impersonation, demo data | `attendance-backend/controllers/adminController.js`, `utils/audit.js`, `utils/settings.js` |
| Admin passkeys and step-up | `attendance-backend/controllers/adminPasskeyController.js`, `utils/webauthn.js`, `utils/adminStepUp.js`, `middleware/adminStepUp.js` |
| Audit hash chain and JWT rotation | `attendance-backend/utils/auditChain.js`, `utils/verifyJwt.js` |
| Teacher check-in screen | `attendance-frontend/src/components/teacher/checkInSessions.jsx`, `checkInSessionView.js`, `SessionAttendanceModal.jsx` |
| Student check-in shell | `attendance-frontend/src/components/student/studentCheckIn.jsx`, `studentCheckInView.js`, `src/acoustic/useCheckInAudio.js` |
| Attendance, query, export, session and admin pages | `attendance-frontend/src/components/{attendance,queries,exports,sessions,admin}/` |
| Shared shell and UI | `attendance-frontend/src/ui/`, `src/hooks/useRoleSession.js` |

The engineering plan is in [`plan.md`](../plan.md); current measurements and build status
are in [`progress.md`](../progress.md).
