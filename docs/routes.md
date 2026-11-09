# Route reference

Every frontend page and API endpoint in the working tree, with its access rule and
purpose. This is a map, not a second API specification: request bodies and response
shapes live in the controllers under `attendance-backend/controllers/`.

The API is mounted at **`/api/v1`**. Paths in the API table are relative to that prefix.
Every matched API endpoint returns JSON except the PDF/Excel downloads. An unmatched
`/api/*` path falls through to Express's built-in 404, which returns `text/html` rather
than the JSON error envelope or the React shell. API responses, including that default
404, send `Cache-Control: no-store`.

## Access labels

| Label | Meaning |
| --- | --- |
| **Public** | No session required. |
| **Signed in** | Any valid student, teacher or super-admin session. |
| **Student** | `role: "student"` only. |
| **Teacher** | `role: "teacher"` only. Class-owned routes also check ownership in the controller. |
| **Staff** | Teacher or super-admin. |
| **Super-admin** | `role: "superadmin"` only. Granted by `SUPER_ADMIN_EMAILS`. |
| **Super-admin + step-up** | Super-admin **and** a fresh WebAuthn assertion. Without it the route returns **428** `step_up_required`. |
| **Dev-only** | Mounted only when `NODE_ENV=development|test` **and** `DEV_AUTH_ENABLED=true`. Absent in production. |

A missing or expired session returns **401**. A valid session with the wrong role or
class ownership returns **403**. A valid super-admin session without a recent passkey
approval returns **428** on step-up routes. Teacher-owned routes deliberately do **not**
accept a super-admin; the console uses the `/admin/*` routes so the audit trail names the
right authority.

## Frontend pages

The React app is a single-page app. Direct navigation returns the app shell and the page
then checks `/islogin`; the access column describes where the page sends you.

| Route | Access | What it is for |
| --- | --- | --- |
| `/` | Public | Product landing page. A signed-in visitor gets a role-aware dashboard action instead of sign-in links. |
| `/login` | Public | Google sign-in and, in development only, one-click dev personas. An existing session is redirected to its dashboard. |
| `/student-dashboard` | Student | Student home: device-binding state, live-session card, check-in and sound-lab actions. A teacher is redirected to `/teacher-dashboard`; signed-out visitors go to `/login`. |
| `/student/check-in` | Student | Consent-gated microphone capture. Decodes the current wave locally, signs the session/wave/key proof with the bound device key, and shows the recorded-evidence card. Never displays the key. |
| `/teacher-dashboard` | Teacher | Teacher home: class/student counts, device-review queue, quick actions. Non-teachers are redirected. |
| `/teacher/classes` | Teacher | Rooms, classes, CSV/paste roster preview/save, text-based PDF roster extraction and the device approval queue. |
| `/teacher/check-in` | Teacher | Start/close a check-in session, show the live two-minute key, advance a wave after evidence, open the transmitter, inspect live evidence and history. |
| `/teacher/sessions` | Staff | Closed-session history, registers, attendance edits and the teacher audit log. A super-admin sees every teacher's sessions and can open any register. |
| `/attendance` | Signed in | Analytics. A student sees their own percentages and sessions; a teacher sees class overviews and per-student detail; a super-admin can switch across classes. |
| `/queries` | Signed in | Students raise and track 24-hour queries; teachers review, approve, reject and reopen; a super-admin sees every query. |
| `/exports` | Staff | Branded PDF/Excel downloads for registers, queries, sessions, users and the audit log. Admin-only user/audit exports appear for a super-admin. |
| `/admin` | Super-admin | Production console: overview, users, classes, sessions, attendance overrides/deletion, queries, audit, passkey security, settings and impersonation. Demo controls appear only outside production. Destructive actions ask for a passkey. |
| `/notifications` | Signed in | Personal notification centre; mark one/all read or clear read items. |
| `/profile` | Signed in | Account identity, role badge, phone label and display-name settings. The role cannot be changed here. |
| `/timetable` | Signed in | Weekly timetable. Students read; teachers and super-admins can add, edit and delete slots or extract a text-based PDF into a read-only text preview. A slot never starts attendance by itself. |
| `/help` | Signed in | Role-specific onboarding, workflow and FAQ. |
| `/acoustic-lab` | Public | Phone audio lab: sample-rate gate, mic settings, seven probe tones and margins. No sign-in needed. |
| `/acoustic-tx` | Public | Two-phone transmitter. Accepts `?key=<decimal>&from=checkin` to prefill a session key and show a back link to the teacher screen. |
| `/acoustic-rx` | Public | Two-phone receiver. Accepts `?run=<id>&distance=<text>&room=<text>&notes=<text>` from the transmitter's **Copy receiver link**, so both reports describe the same run. |
| `*` | Public | Client-side 404 page. |

## API endpoints

### Health, session and profile

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness probe used by Render and local checks. Stays green while the process is alive. |
| GET | `/health/ready` | Public | Readiness probe: **200** when MongoDB is connected, **503** with `checks.database: false` otherwise. |
| GET | `/islogin` | Public (returns 401 without a session) | Resolve the cookie/bearer session and return the current user, including role and binding state. |
| POST | `/logout` | Public | Clear the session cookie. State change is POST-only. |
| GET | `/logout` | Public | Return **405** with `Allow: POST`; protects against link/image logout. |
| POST | `/auth/google` | Public, rate limited | Verify a Google ID token, apply the email/roster policy, create or promote the user and set the session cookie. Device binding is a separate claim. |
| GET | `/profile` | Signed in | Read the caller's profile. |
| PATCH | `/profile` | Signed in | Update display fields such as name and phone label; never the role or sign-in email. |
| POST | `/profile/sessions/revoke` | Signed in | Bump the caller's `tokenVersion`, revoking every existing session for the account. |
| GET | `/auth/dev/accounts` | Dev-only | List one-click dev personas. **404** in production. |
| POST | `/auth/dev/login` | Dev-only, rate limited | Start a dev-persona session. **404** in production. |

### Device binding and review

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/device-bindings/claim` | Signed in | Register the browser's P-256 public key. First and changed devices both become a review request; only dev/test personas auto-approve. |
| GET | `/device-bindings/status` | Signed in | Current binding state for the signed-in account. |
| GET | `/device-reviews` | Teacher | Pending first-binding and changed-device requests visible to teachers. |
| POST | `/device-reviews/:reviewId` | Teacher | Approve or reject a device request. |

### Rooms, classes and rosters

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/rooms` | Staff | List rooms. |
| POST | `/rooms` | Staff | Create a room by room number. |
| GET | `/classes` | Teacher | List classes owned by the signed-in teacher. |
| POST | `/classes` | Teacher | Create a class with course code, title, section and default room. |
| POST | `/classes/:classId/roster/preview` | Teacher | Parse a pasted/CSV roster and return accepted rows plus validation errors without saving. |
| POST | `/classes/:classId/roster/pdf/preview` | Teacher, rate limited | Multipart upload of one text-based PDF (field `file`). Extract the embedded text layer and return editable text plus page/line/email counts. It never saves a roster. 10 MB, 20 pages, 200,000 characters, 20 requests per 10 minutes per account/IP. |
| PUT | `/classes/:classId/roster` | Teacher | Replace the class roster and sync enrollments. |
| GET | `/classes/:classId/roster` | Teacher | Read the current roster. |

### Check-in sessions, evidence and locations

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/classes/:classId/check-in-sessions` | Teacher | List sessions for one owned class. |
| POST | `/classes/:classId/check-in-sessions` | Teacher | Start a session at wave 0 and mint the first two-minute key. One active session per class. |
| GET | `/classes/:classId/check-in-sessions/active` | Student | Read the live session for one class the student is enrolled in; returns no key. |
| GET | `/student/check-in-sessions/active` | Student | Discover all live sessions across the student's active enrollments; returns no key. |
| POST | `/check-in-sessions/:sessionId/proofs` | Student, 60/min | Submit a signed session/wave/key proof as **evidence only**. Idempotent per student/wave; pending device changes are blocked. |
| GET | `/check-in-sessions/:sessionId/proofs` | Teacher | Read-only evidence rows and per-wave counts. No key, signature, protocol version or fingerprint; `attendanceDecided: false`. |
| GET | `/check-in-sessions/:sessionId/queries` | Teacher | Queries attached to one session. |
| GET | `/check-in-sessions/:sessionId` | Teacher | Read session state, current key for the owner and key-free wave history. |
| POST | `/check-in-sessions/:sessionId/advance` | Teacher | Advance only after the current wave has accepted evidence; archive the old key in bounded history and mint a fresh key. |
| POST | `/check-in-sessions/:sessionId/close` | Teacher | Close the session and stop accepting proofs. Idempotent. |
| POST | `/check-in-sessions/:sessionId/location` | Student | Attach an optional one-shot check-in location to the student's session attempt. A denied permission never blocks a proof. |

### Attendance register, analytics and audit

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/check-in-sessions/:sessionId/attendance` | Teacher | Open the session register: one row per active roster student, with evidence, location and timeline. |
| PATCH | `/check-in-sessions/:sessionId/attendance` | Teacher | Mark a student present, absent or excused with a decision note. |
| POST | `/check-in-sessions/:sessionId/attendance/finalize` | Teacher | Publish the register and turn remaining pending rows into absent. The 24-hour query window is tied to the session close, not to finalisation. |
| GET | `/attendance/me` | Student | Student's own attendance summary across classes. |
| GET | `/attendance/me/sessions` | Student | Student's own closed-session history and query-window state. |
| GET | `/attendance/sessions` | Staff | Teacher session history; a super-admin can view across teachers. |
| GET | `/attendance/classes/:classId/overview` | Staff | Class analytics: students, sessions, trend and queries. |
| GET | `/attendance/classes/:classId/students/:studentId` | Staff | One student's records in a class. `:studentId` accepts a Mongo user id or the student email. |
| GET | `/audit/me` | Teacher | The signed-in teacher's own audit entries. |

### Attendance queries

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/queries` | Student | Raise a query for a closed session inside its 24-hour window, with reason and optional location. |
| GET | `/queries/mine` | Student | List the caller's own queries. |
| GET | `/queries/review` | Teacher | Review queue for classes the teacher owns. |
| GET | `/queries/:queryId` | Signed in | Query detail. A student sees only their own; a teacher only classes they own; a super-admin sees all. |
| GET | `/queries/:queryId/audit` | Signed in | Query audit trail with the same access rule as the detail route. |
| POST | `/queries/:queryId/decision` | Staff | Approve or reject with a note. Approval marks the student present; the decision is audited. |
| POST | `/queries/:queryId/reopen` | Staff | Reopen an approved, rejected or expired query with a note and audit entry. |

### Notifications and timetable

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications` | Signed in | List the caller's notifications. |
| POST | `/notifications/read-all` | Signed in | Mark all of the caller's notifications read. |
| POST | `/notifications/:notificationId/read` | Signed in | Mark one notification read. |
| DELETE | `/notifications/read` | Signed in | Clear already-read notifications. |
| GET | `/timetable` | Signed in | Read timetable entries visible to the caller. |
| POST | `/timetable/pdf/preview` | Staff, rate limited | Multipart upload of one text-based PDF (field `file`). Extract the embedded text layer and return a read-only text preview. It never parses rows, matches classes, creates a slot or creates a class. 10 MB, 20 pages, 200,000 characters, 20 requests per 10 minutes per account/IP. |
| POST | `/timetable` | Staff | Create a weekly slot for an owned class. |
| PATCH | `/timetable/:entryId` | Staff | Edit a slot. |
| DELETE | `/timetable/:entryId` | Staff | Delete a slot. |

Timetable PDF text extraction (A2a) is **built**; it only fills a read-only preview. Structured
row parsing, class matching and automatic slot creation are **not built**. The next step must
schedule existing owned classes only, preview every slot and flag unmatched rows for manual
class creation. The route never creates a class or marks attendance.

### Exports

All export routes require **Staff** and generate the file on the server from the same
records as the on-screen views. Each successful download writes an audit entry and the
routes share a limit of **30 downloads per 10 minutes** per account/IP. The two admin
workbooks require **Super-admin**.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/exports/attendance.pdf` | Staff | Class attendance register as PDF. |
| GET | `/exports/attendance.xlsx` | Staff | Class register workbook with summary, percentages and raw rows. |
| GET | `/exports/queries.pdf` | Staff | Query evidence report as PDF. |
| GET | `/exports/queries.xlsx` | Staff | Query report as Excel. |
| GET | `/exports/sessions/:sessionId.pdf` | Staff | One session sheet as PDF. |
| GET | `/exports/sessions/:sessionId.xlsx` | Staff | One session sheet as Excel. |
| GET | `/admin/export/users.xlsx` | Super-admin | User directory workbook. |
| GET | `/admin/export/audit.xlsx` | Super-admin | Audit log workbook. |

### Super-admin console

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/admin/stop-impersonation` | Signed in | End an impersonation session. Mounted before the admin guard so the impersonated cookie can still call it. |
| GET | `/admin/webauthn/status` | Super-admin | Passkey count, enrollment state and whether the five-minute step-up window is open. |
| POST | `/admin/webauthn/register/options` | Super-admin, rate limited | Start passkey registration. The first passkey is trust-on-first-use; an additional one needs step-up. |
| POST | `/admin/webauthn/register/verify` | Super-admin, rate limited | Verify the registration and store only the public credential. Writes `admin.webauthn.registered`. |
| POST | `/admin/webauthn/step-up/options` | Super-admin, rate limited | Start a step-up assertion for the signed-in account. |
| POST | `/admin/webauthn/step-up/verify` | Super-admin, rate limited | Verify the assertion, set the five-minute `admin_step_up` cookie and write `admin.webauthn.step_up`. |
| GET | `/admin/overview` | Super-admin | Counts, recent activity and production/demo flags. |
| GET | `/admin/users` | Super-admin | Search/filter all users. |
| POST | `/admin/users` | Super-admin | Create a student or teacher account. |
| PATCH | `/admin/users/:userId` | Super-admin, step-up for role/status | Update profile fields; role or status changes require a passkey. Super-admin rows are protected from demotion/disable. |
| POST | `/admin/users/:userId/revoke-sessions` | Super-admin + step-up | Bump the target account's `tokenVersion` and audit the revocation. |
| GET | `/admin/classes` | Super-admin | List every class with its teacher. |
| POST | `/admin/classes` | Super-admin | Create a class and assign its teacher. |
| PATCH | `/admin/classes/:classId` | Super-admin | Reassign or update a class. |
| GET | `/admin/sessions` | Super-admin | List sessions across every teacher. |
| GET | `/admin/sessions/:sessionId/attendance` | Super-admin | Open any session register. |
| PATCH | `/admin/attendance/:recordId` | Super-admin + step-up | Override a register row with an audit note. |
| DELETE | `/admin/attendance/:recordId` | Super-admin + step-up | Delete a register row with an audit note and an explicit `confirm: "DELETE"` body. |
| GET | `/admin/queries` | Super-admin | List all queries. |
| GET | `/admin/audit` | Super-admin | Filterable append-only audit log, including `seq` and chain hashes on new rows. |
| GET | `/admin/audit/verify` | Super-admin | Recompute the SHA-256 audit chain and report the first break plus the legacy count. |
| GET | `/admin/settings` | Super-admin | Read term dates, attendance window and demo-mode settings. |
| PATCH | `/admin/settings` | Super-admin + step-up | Update settings; audited. |
| POST | `/admin/impersonate/:userId` | Super-admin + step-up | Start a time-limited impersonation session. |
| GET | `/admin/demo/status` | Super-admin, non-production | Demo record counts. **404** in production. |
| POST | `/admin/demo/seed` | Super-admin, non-production | Create the demo teacher, students, class, sessions and queries. **404** in production. |
| POST | `/admin/demo/reset` | Super-admin + step-up, non-production | Remove demo data while preserving the signed-in admin. **404** in production. |

## Related documents

- [Getting started](getting-started.md) — run the stack.
- [How it works](how-it-works.md) — the flows behind these routes.
- [Deployment](deployment.md) — production configuration and verification.
- [Deployed test plan](testing-plan.md) — click-level signed flow, security and restore gates.
- [Troubleshooting](troubleshooting.md) — 401/403, Google, microphone and session fixes.
