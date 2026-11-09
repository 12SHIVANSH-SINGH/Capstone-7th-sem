# Bio Attend — The Complete Guide

**A layman's tour of every formula, route, design decision, physics idea and code path in the Bio Attend acoustic attendance system.**

Written for the working tree inspected on **6 November 2026** (`HEAD` reported by `git log -1 --oneline` as `003f900`, "deepseek flash 4.1 max"). The repository's older status documents may name a different commit; when this book and the code disagree, the code wins. No commit, push, tag, merge or deploy was performed while writing it.

---

## What this book is

Bio Attend is a capstone project: a web application that tries to prove a student's phone was physically inside a classroom, using near-ultrasonic sound, a server-minted one-time key, a browser-bound signing key, and a teacher's final decision. It is deliberately **evidence-only**. The acoustic subsystem records what a phone heard. It does not decide who was present. A teacher reads the evidence, marks a register, finalises it, and every later correction is audited. Students can raise a 24-hour query if they believe a mark is wrong.

This book explains the whole system from first principles:

- the physics of sound and why an 18–19.8 kHz tone can be evidence of presence;
- the mathematics of the FSK codec, checksum, Goertzel detector and acoustic lab;
- the architecture of the React frontend and Express/MongoDB backend;
- every database model, field and index;
- every frontend page and every API route, with access rules and failure codes;
- the authentication, device-binding, passkey, session-revocation and audit-chain security model;
- the exact backend control flow for sessions, proofs, attendance, queries, rosters, PDF extraction, exports, admin actions and notifications;
- the frontend flow for students, teachers, super-admins and the acoustic lab;
- the test suites, the operations story, the deployment assumptions and the honest limitations.

It is written in plain language first, with the formula or code condition immediately beside the explanation. You should be able to use it to explain the project to a examiner, a teacher, a student, or another engineer without opening the repository.

## What this book is not

- It is **not** a claim that the physical layer has passed. The owner has treated Layer 1 as passed **for build planning only**. The last recorded distance sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at 3 m, **4/10 at 5 m** and **1/10 at 10 m**. Reverse direction and the muted control were not measured. Do not describe the acoustic gate as measured-passed.
- It is **not** a claim that real college PDFs parse accurately. Roster PDF extraction and timetable PDF extraction are tested with generated fixtures. No representative college timetable or roster PDFs have been supplied, and scanned OCR is not built.
- It is **not** a claim that the live Render deployment matches this working tree (`003f900`). The exact deployed version was not verified while writing; gate **G2** in [`docs/testing-plan.md`](../testing-plan.md) checks it before signed testing.
- It is **not** a promise that automatic attendance, scoring, the ID round or the multi-hop student cascade exist. They do not.

## The one-sentence version

> A teacher starts a check-in; the server mints a short-lived numeric key; the teacher's phone plays it as near-ultrasonic FSK; a student's phone hears and decodes it locally; the phone signs the session, wave and key with a browser-bound P-256 key; the server stores that as evidence; the teacher decides the register; and a hash-chained audit trail records every consequential action.

## How to read this book

The chapters are ordered so that each one can be read on its own, but the intended path is:

1. **Part I** for the problem, vocabulary and product boundaries.
2. **Part II** for the physics and signal processing. If you only need the product, skim the formulas but read the "what can go wrong" sections.
3. **Part III** for the architecture and request lifecycle.
4. **Part IV** for the data model.
5. **Part V** for security and identity.
6. **Part VI** for every route.
7. **Parts VII–IX** for the backend, frontend and end-to-end acoustic proof in narrative form.
8. **Part X** for imports and document handling.
9. **Parts XI–XII** for operations and tests.
10. **Part XIII** for the design tradeoffs behind the system.
11. **Part XIV** for the honest limits and the open-work list.
12. **Part XV** for the formula sheet, constants, error codes, file map and glossary.
13. **Part XVI** for demo scripts, plain-language explanations and examiner questions.

Each technical chapter follows the same pattern:

- **In plain words** — the idea without jargon.
- **The formula or rule** — the exact arithmetic or condition used in the code.
- **Where it lives** — the file and function names.
- **What happens step by step** — the code path.
- **What can go wrong** — failure modes and why they are handled that way.

> **A note on line numbers.** Code line numbers move whenever a file changes. This book names files, functions, constants and exact conditions instead of quoting line numbers. That makes it stable and still precise enough to find the code.

## Status snapshot at the time of writing

| Item | State |
| --- | --- |
| Backend test suite | **255/255** under `npm test` and under `npm test -- --test-isolation=none` |
| Frontend helper tests | **96/96** total across proof, acoustic, check-in view, auth, roster import and timetable import suites |
| Production build | Green with `CI=true REACT_APP_API_URL=/api/v1 npm run build` |
| Acoustic lab, FSK codec, TX/RX pages | Built and tested; link works at 1 m but degrades at 5–10 m |
| Signed proof transport | Built and tested; stores evidence only |
| Teacher-confirmed register, queries, analytics, exports | Built and browser-smoke-tested locally |
| Super-admin console, passkeys, audit chain | Built and locally verified, including a Chrome virtual-authenticator run |
| Roster PDF extraction | Built for text-layer PDFs; generated fixtures only; no auto-save |
| Timetable PDF extraction | Built as **read-only preview only**; no row parsing, class matching, slot writes or attendance changes |
| Structured timetable import (A2b) | Blocked on representative timetable PDFs |
| Local OCR (A3) | Blocked on representative scanned samples |
| Gemini extraction (A4) | Gated on student notice and written risk acceptance |
| Student cascade, automatic scoring, ID round, mobile app | Not built / gated |
| Physical range diagnosis | Open: 5 m and 10 m fail the proposed 95% target |
| Real Google + physical-phone multi-wave rehearsal | Pending |
| Live Render version verification | Pending |

## A warning about language

In this book, **"acoustic evidence"** means "a signed claim that a phone decoded a particular wave key". It does not mean "proof beyond doubt that the student was in the room". A forwarded key, a nearby open door, a friend's phone, a rooted device or a spoofed browser can weaken the evidence. The design deliberately keeps a human teacher in the decision loop, and the limitations chapter lists the attacks that remain.

With that framing, let's start with the product.

---

# Table of contents

## Part I — The product in plain words

1. The problem Bio Attend is trying to solve
2. The four actors and what each one sees
3. The end-to-end journey
4. What "evidence-only" means and what it forbids
5. What is built, what is not, and what is gated
6. The vocabulary you need

## Part II — Physics and signal processing

7. Sound as a pressure wave
8. Frequency, wavelength, decibels and the hearing range
9. Why near-ultrasonic sound, and why phones struggle with it
10. The classroom acoustic channel: distance, echoes and noise
11. Digital audio: sampling, Nyquist, aliasing and bit depth
12. Frequency-shift keying from first principles
13. The Bio Attend frame format, symbol by symbol
14. The checksum: weights, modulo 225 and why two symbols are enough
15. The no-adjacent-repeat tone walk and its inverse
16. Synthesis: sine waves, envelopes and clicks
17. Detection: the Goertzel algorithm and the 9 dB rule
18. Frame search, timing and the decision window
19. The acoustic capability lab: probes, baselines, verdicts and reports
20. The two-phone TX/RX link and its planning arithmetic
21. Every formula in the signal path, in one place

## Part III — Architecture

22. The shape of the system
23. The request lifecycle, middleware by middleware
24. Startup, database readiness and shutdown
25. Configuration and environment variables
26. The PWA and static-file strategy

## Part IV — The data model

27. How MongoDB and Mongoose are used
28. Every model, field by field
29. Relationships and the life of a record
30. Indexes, uniqueness and concurrency guards
31. Retention and deletion

## Part V — Identity, security and trust

32. Google sign-in and the sign-in policy
33. Roles, sessions and the JWT cookie
34. Session revocation and impersonation
35. Device binding and the teacher review queue
36. Passkeys and super-admin step-up
37. The audit hash chain
38. Rate limits, origin checks, CSP and other hardening
39. The threat model in plain language

## Part VI — Every route

40. Route conventions and access labels
41. Frontend page routes
42. Health, session and profile routes
43. Device-binding routes
44. Room, class and roster routes
45. Check-in session and proof routes
46. Attendance, analytics and audit routes
47. Query routes
48. Notification and timetable routes
49. Export routes
50. Super-admin routes
51. A complete route index

## Part VII — Backend flows in detail

52. Starting a check-in session
53. Student discovery of live sessions
54. The proof submission path
55. Advancing a wave
56. Closing a session
57. Marking and finalising attendance
58. Student attendance views
59. Class analytics
60. Queries: creation, decision, expiry and reopen
61. Class and roster management
62. Timetable management
63. PDF text extraction
64. PDF preview endpoints
65. Exports
66. Notifications
67. Admin console actions
68. Demo data

## Part VIII — The frontend

69. The app shell, routing and design system
70. Session hooks and API configuration
71. The login and landing pages
72. The student dashboard and check-in page
73. The teacher dashboard and class management
74. The teacher check-in screen
75. Attendance analytics, session history and the query centre
76. The export centre, notifications, profile and help
77. The timetable page and PDF preview modal
78. The acoustic lab, transmitter and receiver
79. The service worker and offline behaviour

## Part IX — The acoustic proof, end to end

80. Who knows which key, and when
81. What the student phone signs
82. What the server checks, in order
83. What the database stores
84. What the teacher sees
85. What the system deliberately does not do

## Part X — Imports and document handling

86. Roster parsing rules
87. Roster PDF extraction flow
88. Timetable PDF extraction flow
89. Why there is no automatic save
90. The gates on OCR and LLM extraction

## Part XI — Operations

91. Local development
92. Production deployment shape
93. Environment variables
94. Health and readiness
95. Backup and restore
96. Troubleshooting by symptom

## Part XII — Tests and verification

97. The backend suite
98. The frontend helper suites
99. Browser smoke tests and their limits
100. What the tests prove and what they do not

## Part XIII — Design decisions and tradeoffs

101. Why evidence-only instead of automatic attendance
102. Why FSK instead of QR, GPS or ultrasonic data
103. Why this band, this frame and these thresholds
104. Why P-256 device keys
105. Why passkeys for the console
106. Why an audit hash chain
107. Why one service and one database
108. Why PDF preview instead of import
109. Why no paid services
110. The decisions that were deliberately deferred

## Part XIV — Honest limits and open work

111. Physical-range limitations
112. Security limitations
113. Privacy and retention limitations
114. Usability and accessibility limitations
115. Operational limitations
116. The open-work list

## Part XV — Reference

117. Formula sheet
118. Constant sheet
119. Error-code and HTTP-status sheet
120. File map
121. Glossary

## Part XVI — Teaching notes

122. How to demo the system in ten minutes
123. How to explain it to a non-technical audience
124. Questions an examiner is likely to ask
125. Answers that are honest

---
# Part I — The product in plain words

## 1. The problem Bio Attend is trying to solve

A classroom has 70–120 students. A teacher needs to know who was physically there. The traditional options are weak:

- **Manual roll call** takes minutes, interrupts teaching, and depends on a student answering to a name.
- **Signing a paper sheet** proves only that somebody held a pen.
- **QR codes** prove that a code was photographed or forwarded. A student outside the room can receive the image from a friend inside.
- **GPS** proves a reported coordinate, not that the phone is honest or that the coordinate is inside the room. Indoors, GPS is often 5–10 metres off or unavailable.
- **Wi-Fi or IP checks** are coarse and easy to share.
- **Facial recognition or fingerprint hardware** requires equipment, consent and a much heavier privacy story.

Bio Attend starts from a different physical fact: **sound stays inside a room**. If a phone hears a fresh, short-lived signal that was played in that room, the phone was probably in that room. The system turns that fact into signed evidence, then asks a teacher to confirm the register.

The project is deliberately **not** an automatic attendance machine. It is a system for producing and reviewing evidence. That distinction drives almost every design decision in this book.

### The room and the time budget

The target room is about **20 m × 20 m** (400 m²), with 70–120 students. A class lasts 50–55 minutes. The check-in is intended to start around minute 40 and finish in **5–6 minutes**. The teacher's ordinary phone sits at the front. It plays the first signal and is never passed around. Students use their own phones and browsers. No room speaker, screen, beacon or installed hardware is assumed.

Those numbers matter because they create the central engineering tension:

- The teacher's phone is 1–10 m from the nearest students, and much farther from the back row.
- Phone speakers and microphones roll off badly at high frequencies.
- A hard-walled room creates echoes and standing waves.
- 100 phones cannot all transmit at once without collisions.
- The system must still work through a normal web browser, with no app install.

The long-term answer in the plan is a **cascade**: the teacher's phone plays key K0; phones that hear K0 prove it and retransmit K1; more phones hear K1; and so on. The current build implements teacher-driven waves and signed evidence, but **not** the student retransmission cascade. That gap is stated repeatedly in the plan and must not be hidden.

## 2. The four actors and what each one sees

### The student

The student signs in with a college Google account, is on a class roster, and has a browser-bound device key approved by a teacher. On the student dashboard they see live sessions for classes they are enrolled in. They open the check-in page, read a short retention/consent notice, tick the consent box, and press Join. The browser asks for microphone permission. The phone listens for a valid FSK frame, decodes it **locally**, signs a message containing the session id, wave and key with the device key, and posts the signed proof. The page shows a "recorded evidence" card. It does **not** say "present". It does **not** show the key. It does **not** decide attendance.

Later, the student can see their attendance history and raise a query for a closed session if they were present but unmarked. They see the status of that query and any decision note.

### The teacher

The teacher owns classes, rosters and sessions. On the class page they create a class, add a room, and import or paste a roster. Before a check-in they open the live session page, start a session, and show or play the current key. The key is displayed only on the teacher's page. The teacher can open the transmitter page to play the tone. They can see live evidence: which enrolled student submitted which wave. They can advance to the next wave only after the current wave has at least one accepted proof. They can close the session.

After the session closes, the teacher opens the register, one row per active roster student, sees evidence and optional location, and marks each row present, absent or excused. When they finalise, remaining pending rows become absent. The query window opens at **close** and lasts the configured number of hours, default 24. The teacher reviews student queries, approves or rejects them, and can reopen a decided or expired query. Every decision is audited.

The teacher can also see class analytics, session history, their own audit log, device-review requests, timetable slots and exports.

### The super-admin

The super-admin is granted by exact-match environment configuration (`SUPER_ADMIN_EMAILS`), never by a UI role toggle. The console can list users, classes, sessions and queries; create users and classes; reassign classes; inspect any register; override or delete an attendance row; inspect the audit log and verify its hash chain; change settings; revoke sessions; and impersonate a non-admin account for 15 minutes.

Destructive actions require a fresh **passkey** assertion. A missing or stale assertion returns HTTP **428** with `code: "step_up_required"`. A successful assertion sets a five-minute, `HttpOnly`, admin-path-scoped step-up cookie. The first passkey is trust-on-first-use; adding another passkey requires an existing approval.

Demo seed/reset routes exist only outside production and return 404 in production.

### The public visitor

The landing page, login page, acoustic lab, transmitter and receiver are public. The acoustic lab is intentionally usable without an account because it is a device-capability test, not attendance. It can play probes, measure them, and print a report. It cannot mark attendance, save a result or prove classroom range.

## 3. The end-to-end journey

Here is the full happy path, with the evidence boundary marked.

### Before the class

1. A teacher signs in with Google.
2. The server verifies the Google ID token, checks the email policy, and sets an `HttpOnly` JWT cookie.
3. The student signs in the same way. If they are on an active class roster, they get a student account.
4. The student's browser creates a P-256 key pair. The private key stays in IndexedDB; the public key is sent to the server.
5. In production, the first binding and every changed browser create a **pending** device-review request. A teacher who owns a class containing that student approves or rejects it. In development, dev personas and test-student allowlist accounts auto-approve.
6. The teacher creates a class with a course code, title, section and default room, then adds a roster by paste, CSV or text-based PDF extraction. The roster is previewed and explicitly saved.

### Starting the check-in

7. The teacher taps **Start check-in**.
8. The server checks that the class belongs to the teacher, that the class has a default room, and that there is no other active session for that class.
9. The server creates a session at **wave 0** with a random key from 0 to 15⁷−1, a two-minute expiry, a class snapshot and a room snapshot.
10. The server snapshots the active roster into one **pending** attendance row per student. This is the durable register. The operation is idempotent.
11. The server notifies enrolled users that check-in is live.
12. The server writes an audit entry `session.created`.
13. The teacher's page receives the current key. Students never receive it.

### Hearing the wave

14. The teacher plays the key through the transmitter page, which encodes it as 11 tones.
15. A student opens `/student/check-in`, ticks the consent box, and presses Join.
16. The browser captures mono audio at 44.1 kHz or higher, with echo cancellation, noise suppression and automatic gain control requested **off**.
17. An AudioWorklet posts chunks of PCM to the main thread. A rolling buffer keeps recent audio.
18. Every 700 ms the page tries to decode a frame: find the two-marker burst, measure 11 symbol windows with Goertzel filters, require roughly 9 dB above the median, invert the no-repeat tone walk, verify the checksum.
19. If a valid frame is found, the page releases the microphone and keeps the decoded integer key. Raw audio never leaves the phone.

### Submitting evidence

20. The phone builds the exact message `bioattend-proof:v1|session=<id>|wave=<n>|key=<k>|student=<id>`.
21. It signs the UTF-8 bytes with ECDSA P-256 / SHA-256, using the private key in IndexedDB. The signature is 64 bytes in IEEE P1363 format, base64-encoded.
22. It posts `{ wave, key, signature, location? }` to `/check-in-sessions/:id/proofs`.
23. The server validates the shape, finds the session, checks that the student is on the active roster, checks that the device binding is approved, checks that no device change is pending, rebuilds the exact message, and verifies the signature against the stored public key.
24. It checks for an existing proof for that student and wave. An identical retry is a **duplicate success** (200). A different key for the same wave is a **conflict** (409). A closed session, stale wave, expired key or wrong key is rejected with a precise status.
25. On acceptance, it stores a proof document with session, class, student, email, device fingerprint, wave, key, signature, protocol version, optional location and timestamps. It increments the attendance row's evidence counter and adds the wave to the evidence list.
26. The response says `recorded: true` and `attendanceDecided: false`. The student sees the evidence card, not a present mark.

### Advancing and closing

27. The teacher sees at least one evidence row for wave 0 and taps **Advance wave**. The server requires at least one proof for the current wave, archives the old key in a bounded 20-entry history (without returning old keys), mints a fresh distinct key with a new two-minute expiry, and uses an atomic compare-and-set so two taps cannot both win.
28. Steps 14–27 may repeat for several waves.
29. The teacher closes the session. Closing is idempotent. The server sets `closedAt`, computes `queryWindowEndsAt = closedAt + queryWindowHours`, notifies students, and audits `session.closed`. Proofs are no longer accepted.

### Deciding the register

30. The teacher opens the session register. One row exists for every active roster student, due to the start-time snapshot. Rows show status, source, evidence count, waves, first/last proof time, optional locations, queries and a timeline.
31. The teacher marks rows present, absent or excused, with an optional note. Marking is allowed while live and after close. Every batch writes one audit entry with per-student changes.
32. The teacher finalises. Finalisation requires a closed session. All remaining pending rows become absent with source `auto`. The session records `attendanceFinalized`, the time and the teacher. Students are notified. The audit entry reports the summary and how many rows were auto-absent.
33. Percentages count **decided** records only: `present / (present + absent)`, rounded to one decimal. Excused and pending are shown separately.

### Queries and corrections

34. A student who was present but unmarked can raise a query after close, inside the window. The reason must be 10–1000 characters. The student must be on the roster and not already present. Only one query per session per student exists. Optional location is captured; if the admin requires it and it is missing, the request is rejected.
35. The server computes distance from the teacher's session-start location to the student's query location or attempt location using the Haversine formula, and stores whether it is within the configured radius (default 30 m). Location is **evidence**, not a gate, unless `requireQueryLocation` is on.
36. The teacher approves or rejects with a note. Approval sets the attendance row to present with source `query`; rejection leaves or restores it appropriately. Both are audited and notified.
37. An expired query can still be decided; a decided or expired query can be reopened, which sets it pending again with a fresh window and increments the reopen count.
38. A background sweeper expires pending queries every five minutes, and every read path expires stale queries lazily. Expiry writes an audit entry and notifies the student and teacher.

### After the class

39. Teachers and super-admins can view analytics, download branded PDF/Excel exports, inspect notifications and manage the timetable.
40. Every successful export writes an audit entry. Exports are limited to 30 downloads per 10 minutes per account/IP.
41. Super-admin destructive actions require passkeys and are recorded in the hash chain.

## 4. What "evidence-only" means and what it forbids

"Evidence-only" is a product rule, not a marketing phrase. It means:

- The proof endpoint **stores** a signed claim. It never writes `present`.
- The student response explicitly includes `attendanceDecided: false`.
- The teacher-facing proof view exposes email, wave and recorded time only. It hides the key, signature, protocol version and device fingerprint.
- No score is computed from proof count, wave number, timing, location or device.
- No ID round is run.
- No student cascade is run.
- The teacher confirms the register.
- A query decision can change attendance, but a human decides it and the change is audited.

The system also forbids these shortcuts:

- **No automatic attendance from hearing a tone.** A decoded key is data and can be forwarded.
- **No GPS gate.** Location is optional evidence. A denied permission never blocks a proof or a query unless the administrator explicitly turns on `requireQueryLocation`.
- **No raw-audio upload.** Audio is decoded in the browser and discarded.
- **No key exposure to students.** Student session views contain the wave and expiry, never the key.
- **No old-key exposure to teachers.** The wave history shows wave numbers and times, not archived keys.
- **No automatic roster save from a PDF.** Extraction fills a text box; the teacher reviews and saves.
- **No automatic class creation from a timetable.** Timetable PDF extraction is read-only text preview; no rows are parsed and no slots are written.
- **No LLM extraction before consent and risk text exist.** A4 remains gated.
- **No production demo endpoints.** They return 404 in production.
- **No silent attendance edits.** Every teacher batch, admin override, deletion and query decision is audited.

## 5. What is built, what is not, and what is gated

### Built and tested

- Google-only sign-in with college-domain, roster, teacher allowlist and exact-match super-admin policy.
- Dev personas in development only.
- One bound device per student, with teacher review for first and changed devices in production.
- Rooms, classes, CSV/paste rosters and enrollment sync.
- Roster PDF text extraction into an editable preview.
- Check-in sessions, two-minute wave keys, teacher display, wave advancement gated on evidence, bounded key history, closing.
- Student live-session discovery and a consent-gated check-in shell.
- Local FSK decode, P-256 signing, signed proof submission, duplicate handling.
- Teacher evidence view and session history.
- Teacher-confirmed register, finalisation, edits and audit.
- 24-hour queries with optional location evidence, decisions and reopen.
- Analytics, term ranges, trends and query counts.
- PDF/Excel exports with audit-on-download and rate limits.
- Notifications, timetable CRUD, profile, help, dark theme and PWA shell.
- Super-admin console, settings, impersonation, demo seed/reset (non-production), passkey step-up, audit chain and readiness.
- Timetable PDF **text preview** with no structured import.

### Not built

- Student cascade (phones retransmitting the next key).
- Automatic scoring or automatic attendance.
- The ID round (neighbour hearing reports).
- Structured timetable row parsing, class matching and slot preview/save (A2b).
- Local OCR for scanned PDFs (A3).
- Gemini/LLM extraction (A4).
- Native mobile app.
- Shared-store rate limiting for multi-instance deployment.
- Real-college PDF layout validation.
- A measured-passed physical layer.

### Gated

- A2b waits for representative timetable PDFs.
- A3 waits for representative scanned samples and accuracy/runtime validation.
- A4 waits for a student notice and written risk acceptance.
- Scoring and the ID round wait for a genuinely measured physical gate.
- Real pilot waits for a physical-phone rehearsal and deployment verification.

## 6. The vocabulary you need

| Term | Plain meaning |
| --- | --- |
| **Acoustic evidence** | A signed claim that a phone decoded a particular wave key. Not an attendance decision. |
| **Wave** | One generation of the check-in key. Wave 0 is the first; each advance increments it. |
| **Key** | An integer from 0 to 170,859,374, transmitted as seven base-15 digits. The teacher's phone plays it; the student's phone decodes it. |
| **Frame** | The full 11-tone transmission: two markers, seven data symbols and two check symbols. |
| **Symbol** | One 120 ms tone. |
| **Tone** | One frequency in the 17-tone alphabet. |
| **FSK** | Frequency-shift keying: encode digits by changing frequency rather than amplitude. |
| **Goertzel** | An efficient way to measure the energy at one frequency without a full FFT. |
| **Marker** | Tone 0 at 18.0 kHz. Two markers in a row mark the start of a frame. |
| **Check symbol** | One of two symbols carrying a weighted checksum. |
| **Proof** | The signed session/wave/key/student tuple submitted by a phone. |
| **Device binding** | The association between a student account and a browser-held P-256 public key. |
| **Fingerprint** | SHA-256 of the canonical public JWK, used to identify a binding. |
| **Step-up** | A fresh passkey assertion required before a destructive admin action. |
| **Audit chain** | A sequence of audit entries where each hash includes the previous hash. |
| **Register** | The per-session attendance rows, one per active roster student. |
| **Finalise** | Publish the register and turn remaining pending rows into absent. |
| **Query** | A student's request to correct an attendance mark after a session closes. |
| **Roster** | The list of college emails allowed to check in to a class. |
| **Enrollment** | One roster row linked to a class, with status active/inactive. |
| **Class snapshot** | A copy of course code, title, section and room stored on a session or record so history survives later edits. |
| **Term range** | The configured start/end dates used by analytics and exports. |
| **Demo data** | Non-production records with `@demo.invalid` addresses, excluded from real exports. |
| **Evidence-only** | The rule that acoustic proof never automatically decides attendance. |

---
# Part II — Physics and signal processing

This part explains the physical layer from the ground up. You do not need a physics degree. Each idea starts with an everyday analogy, then gives the exact formula used in the code.

## 7. Sound as a pressure wave

### In plain words

Sound is a travelling pattern of tiny pressure changes in a material. When a phone speaker plays a tone, its diaphragm pushes air molecules together and pulls them apart many times per second. Those pushes spread outward as a wave. When the wave reaches a microphone, it moves the microphone's diaphragm, which produces a tiny electrical signal.

The wave does not carry air from the speaker to your ear. Each air molecule oscillates around its resting position and passes the disturbance to its neighbour. Think of a crowd doing a wave at a stadium: people stay in their seats, but the pattern travels.

Two numbers describe the pattern:

- **Frequency** — how many complete cycles pass a point each second. The unit is hertz (Hz). One hertz is one cycle per second.
- **Wavelength** — the physical distance between two consecutive peaks of the wave.

They are linked by the speed of sound:

$$
\lambda = \frac{c}{f}
$$

where:

- $\lambda$ is wavelength in metres,
- $c$ is the speed of sound in metres per second,
- $f$ is frequency in hertz.

In room-temperature air, $c \approx 343\ \text{m/s}$ (it rises slightly with temperature). For the Bio Attend band:

| Frequency | Period $1/f$ | Wavelength at 343 m/s |
| --- | --- | --- |
| 15.50 kHz | 64.5 µs | 22.1 mm |
| 18.00 kHz | 55.6 µs | 19.1 mm |
| 18.50 kHz | 54.1 µs | 18.5 mm |
| 19.50 kHz | 51.3 µs | 17.6 mm |
| 19.76 kHz | 50.6 µs | 17.4 mm |

A wavelength of roughly **1.7–2.2 cm** matters later. It is smaller than most objects in a classroom, so sound scatters off chair backs, table edges, phones and people. It also means a small movement of the phone can change the phase of the arriving wave, even though the frequency stays the same. Bio Attend therefore detects **which frequency is loudest**, not the exact phase.

### Amplitude, power and loudness

The size of the pressure oscillation is **amplitude**. The energy carried per second is **power**, proportional to amplitude squared:

$$
P \propto A^2
$$

A sound that is twice the amplitude carries four times the power. Loudness is a human perception, not a physical quantity; it depends on frequency, duration and the listener. That is why the system uses decibels (a ratio) and not a claim about perceived loudness.

### Why this matters for attendance

Sound is evidence of a shared physical channel. A phone on the other side of a wall may still hear a loud signal, and a phone inside a quiet room may hear nothing if its microphone rolls off. The design cannot treat "heard" as "inside" without qualifications. It treats "heard a fresh key" as **evidence** that a phone was in the acoustic path, which a teacher weighs.

## 8. Frequency, wavelength, decibels and the hearing range

### The hearing range

Human hearing is often quoted as **20 Hz to 20 kHz**. The upper limit falls with age and exposure. Many adults hear little above 15–17 kHz; teenagers may hear up to 18–19 kHz; some people can hear a little higher. This is why the 18–19.8 kHz band is called **near-ultrasonic**: it is above most adults' comfortable range but not above every listener's.

Bio Attend uses two possible bands:

- **High band:** 18.0–19.76 kHz, the default codec band.
- **Fallback band:** roughly 15.5–17.5 kHz, tested by the acoustic lab when the high band is weak.

The fallback is more audible, especially to younger listeners. The plan says to keep volume low and frames short if it is used. The lab explicitly warns that a fallback result may be partly audible.

### Decibels

A decibel (dB) is a **ratio**, not an absolute amount. For power-like quantities:

$$
\text{dB} = 10 \log_{10}\left(\frac{P}{P_0}\right)
$$

For amplitude-like quantities (voltage, pressure, sample value):

$$
\text{dB} = 20 \log_{10}\left(\frac{A}{A_0}\right)
$$

The factor 20 appears because power is proportional to amplitude squared, and $\log(A^2) = 2\log(A)$.

Useful landmarks:

| Ratio | dB |
| --- | --- |
| ×2 amplitude, ×4 power | +6.02 dB |
| ×10 amplitude, ×100 power | +20 dB |
| ×0.5 amplitude | −6.02 dB |
| ×0.1 amplitude | −20 dB |
| ×0.01 amplitude | −40 dB |

In the code, Goertzel output is converted with:

$$
\text{dB} = 10 \log_{10}\left(\max\left(\frac{|X|^2}{N^2}, 10^{-12}\right)\right)
$$

This is a **relative digital level**, not dB SPL. It is meaningful only when compared with another measurement from the same recording and the same window size. That is exactly how the detector uses it: the loudest tone is compared with the **median** of all 17 tone levels.

### The inverse-square law and distance

A point source radiating equally in all directions spreads its power over a sphere of area $4\pi r^2$. In a free field, intensity falls as:

$$
I \propto \frac{1}{r^2}
$$

Each doubling of distance reduces intensity by about **6 dB**. In a real classroom, walls, floor, ceiling, furniture and people absorb and reflect sound, so the simple law is only a rough guide. A hard-walled room may keep the level higher than free-field at the back, but it also adds echoes that smear the symbols. This is the central range problem: the measured sweep found strong margins at 1–3 m but only 10–13 dB margins at 5 m and about 10 dB at 10 m, with decode rates collapsing to 40% and 10%.

### Frequency weighting

Human hearing is not equally sensitive at all frequencies. Sound-level meters often apply **A-weighting** to approximate loudness. Bio Attend does not use A-weighted SPL; it uses raw digital levels from the microphone. The lab's 6 dB and 12 dB verdicts are relative margins, not calibrated sound-pressure levels. This is honest but means a lab result cannot be compared across phones or rooms without care.

## 9. Why near-ultrasonic sound, and why phones struggle with it

### Why choose a high band?

- It is **mostly inaudible to adults**, so a classroom of students is less distracted.
- It is far from speech, fans, air-conditioning and most room noise, which concentrate at lower frequencies.
- It lets the system distinguish itself from background sound with a simple frequency detector.
- It avoids playing an audible "beep" that a student could record and forward easily (though any sound can be recorded).

### Why phones struggle

A phone is not a laboratory speaker. At 18–20 kHz:

- **Speaker roll-off:** tiny speakers are tuned for speech and music. Their output often drops sharply above 15–17 kHz. The plan records an M32 lab run where 19.5 kHz measured only **0.7 dB** above baseline.
- **Microphone roll-off:** MEMS microphones also lose sensitivity at high frequencies. Some phones apply a low-pass filter before the app sees samples.
- **Volume limits:** phone media volume may be low, and the speaker may be covered by a hand or case.
- **Directivity:** high frequencies are directional. A phone facing away from the listener may be much quieter.
- **Audio processing:** echo cancellation, noise suppression and automatic gain control are designed for speech. They can treat the tone as noise and remove it. The app requests them off, but the browser or OS may ignore the request.
- **Sample rate:** if the audio pipeline opens at 32 kHz, the Nyquist limit is 16 kHz and the 18–19.8 kHz band cannot be represented at all. It folds down (aliases) to a lower frequency.
- **Bluetooth:** a headset in call/SCO mode often forces a low sample rate and narrow band. The lab warns about this explicitly.
- **Backgrounding:** mobile browsers suspend audio when the tab is backgrounded or the screen locks. The check-in page requests a wake lock and must stay foregrounded.
- **Thermal and battery limits:** long playback can throttle or reduce volume.

The honest conclusion is that the physical layer is **device-dependent**. That is why the acoustic lab exists: to measure a specific phone before trusting it.

## 10. The classroom acoustic channel: distance, echoes and noise

### Direct path and reverberation

A microphone receives:

1. **Direct sound** — the shortest path from speaker to microphone.
2. **Early reflections** — sound bouncing off walls, desks, floor and ceiling within tens of milliseconds.
3. **Late reverberation** — a diffuse tail of many reflections.

In a hard-walled 20 m × 20 m room, reverberation can last several hundred milliseconds. Bio Attend uses **120 ms symbols** partly for this reason: a symbol long enough to ride through early echoes is easier to detect than a very short click. But long symbols reduce the data rate, so the frame is only 11 symbols.

### Standing waves and nulls

At high frequencies, the room is full of interference patterns. Two paths can arrive out of phase and cancel at a particular point. Moving a phone by a few centimetres can change the level dramatically. This is why a single measurement at one spot is not enough, and why the lab repeats probes and uses a median.

### Signal-to-noise ratio

The detector does not need the tone to be absolutely loud; it needs the tone to stand out from the other frequencies. Define the **margin**:

$$
M = L_{\text{loudest}} - \operatorname{median}(L_0, \ldots, L_{16})
$$

where each $L_i$ is the dB level of tone $i$ in the same window. A margin of 9 dB means the loudest tone is about eight times the power of the median tone. The codec default is:

```js
const DEFAULT_DETECTION_MARGIN_DB = 9;
```

The lab uses stricter verdicts: **12 dB = strong**, **6 dB = tentative**. Those are different scales of judgement; the codec's 9 dB is a detection gate, while the lab's 12/6 dB are confidence labels.

### Why compare with the median?

A simple absolute threshold would fail when the room is loud or the microphone gain changes. Comparing the loudest tone with the median of all 17 asks: "Is one tone unusually prominent relative to everything else in this window?" That adapts to overall gain. It also fails gracefully: if the room has a loud fan at one of the codec frequencies, that tone may dominate and produce a false positive. The checksum and frame structure reduce that risk, but do not eliminate it.

### Interference between phones

If many phones play the **same** key at the same time, the sounds add. Identical signals can reinforce each other (constructive interference) or cancel at a point (destructive interference). The plan deliberately avoids random backoff: identical synchronised signals should reinforce, not collide. The current build does not implement the student cascade, so this is future work. The teacher's single phone is the only transmitter.

### Doppler and motion

If a phone or a person moves during a 120 ms symbol, the received frequency shifts slightly. At walking speed (1.5 m/s) and 18 kHz, the Doppler shift is about:

$$
\Delta f \approx f \frac{v}{c} = 18000 \times \frac{1.5}{343} \approx 79\ \text{Hz}
$$

That is comparable to the 110 Hz tone spacing. A moving phone can therefore drift toward a neighbouring tone. The Goertzel window is 35% of a symbol (about 42 ms), which limits the exposure, but motion remains a real risk. The lab asks the user to hold still.

## 11. Digital audio: sampling, Nyquist, aliasing and bit depth

### Sampling

A microphone produces a continuous voltage. A digital system measures it at regular intervals:

$$
x[n] = x(nT_s), \quad T_s = \frac{1}{f_s}
$$

where $f_s$ is the **sample rate** in samples per second. Common rates are 44,100 Hz (CD audio) and 48,000 Hz (phones and video).

### The Nyquist–Shannon theorem

To represent a frequency $f$ without ambiguity, the sample rate must satisfy:

$$
f_s > 2f
$$

The highest representable frequency is the **Nyquist frequency**:

$$
f_{\text{Nyquist}} = \frac{f_s}{2}
$$

At 44.1 kHz, Nyquist is 22.05 kHz. The top Bio Attend tone is 19.76 kHz, so it fits with about 2.3 kHz of headroom. At 48 kHz, Nyquist is 24 kHz, even safer. At 32 kHz, Nyquist is 16 kHz, and the entire high band is above it.

### Aliasing

If a frequency is above Nyquist, it is not simply lost. It **folds** to a lower frequency:

$$
f_{\text{alias}} = \left| f - f_s \cdot \operatorname{round}\left(\frac{f}{f_s}\right) \right|
$$

A simpler formulation used in the lab code is:

```js
const folded = ((frequency % sampleRate) + sampleRate) % sampleRate;
return folded <= sampleRate / 2 ? folded : sampleRate - folded;
```

Examples:

- 19.5 kHz at 32 kHz: $19.5 - 32 = -12.5$, absolute value **12.5 kHz**.
- 19.76 kHz at 32 kHz: folds to **12.24 kHz**.
- 18.0 kHz at 32 kHz: folds to **14.0 kHz**.

If the app tried to detect 19.5 kHz with a 32 kHz stream, it would actually be measuring 12.5 kHz. The symbol would be wrong, and the frame would fail its checksum. This is why the lab **refuses to run below 44.1 kHz**:

```js
const MIN_SAMPLE_RATE = 44100;
```

The check is applied twice: to the `AudioContext` rate and, when reported, to the microphone track rate. If the context is fine but the track rate is unknown, the lab allows the run with a warning; if the track rate is known and below 44.1 kHz, it refuses.

### Bit depth and quantization

Each sample is stored as a number. A 16-bit PCM sample has $2^{16} = 65,536$ levels. The browser's Web Audio API typically gives **32-bit floating point** samples in the range roughly −1 to +1. Quantization adds a small noise floor. For a loud tone, the error is negligible compared with room noise. For a very quiet high-frequency tone, it can matter.

### PCM and the worklet

The app uses an `AudioWorklet` to receive raw PCM frames. A worklet runs on the audio thread, separate from React and the main thread, so a busy UI does not drop samples. It posts fixed-size chunks (4096 samples in the check-in hook) to the main thread, where the decoder runs.

### FFT versus Goertzel

A **fast Fourier transform (FFT)** computes the energy at many frequencies at once. It is efficient when you need the whole spectrum, but it requires a power-of-two window and produces a full bin set. The **Goertzel algorithm** computes the energy at **one** frequency with a simple recurrence. Bio Attend needs only 17 known frequencies, so 17 Goertzel filters are cheaper and simpler than a 4096-point FFT. The plan explicitly chose Goertzel for this reason.

---
# Part II, continued — The Bio Attend signal layer

## 12. Frequency-shift keying from first principles

### The problem

We need to send a number from one phone's speaker to another phone's microphone using sound. The channel is noisy, echoey and lossy. We want a scheme that a browser can encode and decode in real time, without a library, with strong protection against random noise.

### The idea

**Frequency-shift keying (FSK)** represents data by choosing one of several frequencies for a fixed period. It is like a piano with a small number of keys: to send a digit, press the corresponding key for 120 ms, then press the next key. The receiver asks, "Which key was loudest in this slot?" and writes down the digit.

FSK is robust because:

- It does not depend on absolute loudness; it depends on which frequency dominates.
- A constant-amplitude tone concentrates energy in a narrow band, making it easy to detect.
- It tolerates amplitude changes from distance and microphone gain.
- It can be generated with a simple sine oscillator.

The cost is **bandwidth and speed**: 17 widely spaced tones at 120 ms each give only 11 symbols in 1.32 seconds. A more complex scheme (OFDM, chirps, QAM) could send more data, but would be harder to implement reliably in a browser and harder to explain and test.

### The alphabet

Bio Attend uses **17 tones**:

$$
f_i = 18000 + 110i \quad \text{Hz}, \quad i = 0,1,\ldots,16
$$

so the tones are 18,000 Hz, 18,110 Hz, …, 19,760 Hz.

- **Tone 0 (18.0 kHz) is the marker.** It never carries data.
- **Tones 1–16 are the 16 data tones.**
- Data symbols are digits **0–14** (base 15), so one of the 16 data tones is always unused for a given step. That spare slot is what makes the no-adjacent-repeat rule possible.

Why 110 Hz spacing? It is wide enough that a small frequency error or Doppler shift is unlikely to make one tone look like its neighbour, and narrow enough that 17 tones fit in a 1.76 kHz band. At 44.1 kHz, the band is comfortably below Nyquist. The spacing is a starting value from the plan, to be tuned only with measurements.

Why base 15 rather than base 16? Because the no-repeat rule needs 15 choices for the next tone after excluding the previous tone. With 16 data tones available and one excluded, exactly 15 remain. A digit 0–14 maps to one of those 15. Base 15 also makes the checksum arithmetic neat: two base-15 digits represent 225 possible checksums.

### Frame layout

```
marker | marker | data0 | data1 | data2 | data3 | data4 | data5 | data6 | check0 | check1
  0        0       d0      d1      d2      d3      d4      d5      d6       c0      c1
```

- 2 marker symbols
- 7 data symbols
- 2 check symbols
- **11 symbols total**
- 120 ms per symbol
- **1,320 ms per frame** (1.32 seconds)

The two markers in a row are a distinctive start pattern. A single marker could occur by chance as a data tone; two in a row are much less likely. The decoder searches for a sustained marker run, then aligns the 11 symbol windows.

### Key space

Seven base-15 digits encode:

$$
15^7 = 170{,}859{,}375
$$

distinct values, numbered 0 to 170,859,374. That is about **2^27.35**, or 27.35 bits of key space. It is not a cryptographic key; it is a one-time code with a two-minute lifetime and a server-side check. The security comes from freshness, signature and teacher confirmation, not from the size of the code space.

### Converting a key to digits

The code uses standard base conversion, most significant digit first:

```js
const valueToDigits = (value) => {
  const digits = new Array(7);
  let remaining = value;
  for (let index = 6; index >= 0; index -= 1) {
    digits[index] = remaining % 15;
    remaining = Math.floor(remaining / 15);
  }
  return digits;
};
```

The inverse is Horner's method:

$$
v = ((((((d_0)\cdot 15 + d_1)\cdot 15 + d_2)\cdots)\cdot 15 + d_6)
$$

```js
const digitsToValue = (digits) =>
  digits.reduce((value, digit) => value * 15 + digit, 0);
```

Example: key `67685752` (from a measurement run) becomes the seven base-15 digits `[8, 9, 10, 9, 1, 14, 7]` in the code's conversion. You can verify:

$$
8\cdot15^6 + 9\cdot15^5 + 10\cdot15^4 + 9\cdot15^3 + 1\cdot15^2 + 14\cdot15 + 7 = 67{,}685{,}752.
$$

## 13. The Bio Attend frame format, symbol by symbol

### The constants

```js
const TONE_COUNT = 17;
const BASE_FREQUENCY_HZ = 18000;
const TONE_SPACING_HZ = 110;
const SYMBOL_DURATION_MS = 120;
const FADE_DURATION_MS = 6;
const MARKER_TONE = 0;
const DATA_TONE_COUNT = 16;
const DATA_SYMBOL_COUNT = 7;
const CHECK_SYMBOL_COUNT = 2;
const SYMBOL_COUNT = 2 + 7 + 2; // 11
const DIGIT_RADIX = 15;
const CHECK_MODULUS = 225;
const CHECK_WEIGHTS = [1, 2, 4, 7, 8, 11, 13];
const INITIAL_PREVIOUS_SLOT = 15;
const MAX_FRAME_VALUE = 15 ** 7;
```

### Why two markers?

The marker is the only tone that is not part of the data alphabet. The decoder can scan for windows where tone 0 is loudest and above the margin. A run of marker detections indicates the start of a frame. Two symbols give a **1.5-symbol minimum span** check, so a single noisy window does not trigger a frame decode.

### Why seven data symbols?

Seven base-15 digits give 170 million values, enough that a random guess is unlikely to collide with the current key. A shorter key would make guessing easier, especially if an attacker can submit many proofs (the endpoint is rate-limited to 60 per minute per student). A longer key would make frames longer and slower, which hurts the 5–6 minute budget.

### Why two check symbols?

A checksum over 225 values catches most random symbol errors. It is not cryptographic authentication; the signature does that. The checksum's job is to reject noise that happens to look like a frame, so the phone does not sign and upload garbage.

### Why 120 ms?

Long enough to ride through early echoes and to give the Goertzel window a stable steady-state; short enough that 11 symbols fit in 1.32 s and several repeats fit in a check-in wave. The plan says tune only with measurements.

## 14. The checksum: weights, modulo 225 and why two symbols are enough

### The formula

Given data digits $d_0,\ldots,d_6$, compute:

$$
S = \sum_{i=0}^{6} w_i d_i \pmod{225}
$$

with weights:

$$
(w_0,\ldots,w_6) = (1, 2, 4, 7, 8, 11, 13)
$$

Then split $S$ into two base-15 digits:

$$
c_0 = \left\lfloor \frac{S}{15} \right\rfloor, \qquad c_1 = S \bmod 15
$$

Because $S < 225$, both $c_0$ and $c_1$ are in 0–14.

```js
const checkDigitsFor = (dataDigits) => {
  let sum = 0;
  for (let i = 0; i < 7; i += 1) sum += CHECK_WEIGHTS[i] * dataDigits[i];
  const checksum = sum % 225;
  return [Math.floor(checksum / 15), checksum % 15];
};
```

### What it detects

- Any single-symbol error changes the weighted sum by $w_i \Delta$, which is not a multiple of 225 for a small nonzero $\Delta$ (the weights are chosen to be coprime with 15 and reasonably spread). It is caught.
- Many two-symbol errors are caught.
- Some multi-symbol errors can cancel out. The checksum is not a cryptographic MAC; it is a lightweight integrity check.
- A random 11-tone sequence has roughly a **1 in 225** chance of passing the checksum if the structure and no-repeat rule already hold. Combined with the marker and margin checks, false frames are rare.

### Why not a CRC?

A CRC would be stronger, but two base-15 symbols are what the frame has room for. The design keeps the frame short and relies on the signature and server checks for security. The checksum is a noise filter, not an anti-forgery mechanism.

## 15. The no-adjacent-repeat tone walk and its inverse

### The problem

If two consecutive symbols used the **same** tone, the receiver would see one long tone and could not tell where one symbol ends and the next begins. It would also lose timing. Silent gaps would solve the boundary problem, but gaps waste time and can be filled by echoes. The design instead guarantees that **consecutive data/check tones are never the same**.

### The encoding rule

Maintain a `previousSlot` initialized to **15**. For each digit $d$ (data or check), compute:

$$
\text{slot} = (\text{previousSlot} + 1 + d) \bmod 16
$$

Then transmit tone $\text{slot} + 1$. Update `previousSlot = slot`.

Because $d \in [0,14]$, the step $1+d$ is in $[1,15]$, so the new slot is never equal to the previous slot (mod 16). There are exactly 15 possible next slots, matching the 15 possible digits.

```js
const frameTones = (dataDigits) => {
  const tones = [0, 0];
  let previousSlot = 15;
  for (const digit of [...dataDigits, ...checkDigitsFor(dataDigits)]) {
    const slot = (previousSlot + 1 + digit) % 16;
    tones.push(slot + 1);
    previousSlot = slot;
  }
  return tones;
};
```

The first data tone is `(15 + 1 + d0) % 16 = d0`, so tone `d0 + 1`. The initial previous slot 15 is a sentinel, not a transmitted tone.

### The decoding rule

Given the received tone $t \in [1,16]$, let $\text{slot} = t - 1$. Invert the formula:

$$
d = ((\text{slot} - \text{previousSlot} - 1) \bmod 16 + 16) \bmod 16
$$

The double modulo handles JavaScript's negative remainder. If $d \ge 15$, the sequence is invalid (it would mean the step was 0, i.e. a repeat, which the encoder never produces). Then update `previousSlot = slot`.

```js
const digit = ((slot - previousSlot - 1) % 16 + 16) % 16;
if (digit >= 15) return null;
```

### Why this is clever

It turns the physical constraint ("adjacent tones must differ") into a **bijective code**. Every valid digit sequence maps to exactly one tone sequence, and every valid tone sequence maps back. No bits are wasted on a separate "same as previous" flag. The receiver can also detect a repeat as invalid, which is an extra error check.

### A worked example

Suppose data digits are `[0, 1, 2, 3, 4, 5, 6]`.

- Start previousSlot = 15.
- d0=0: slot = (15+1+0)%16 = 0 → tone 1. previous=0.
- d1=1: slot = (0+1+1)%16 = 2 → tone 3. previous=2.
- d2=2: slot = (2+1+2)%16 = 5 → tone 6.
- d3=3: slot = (5+1+3)%16 = 9 → tone 10.
- d4=4: slot = (9+1+4)%16 = 14 → tone 15.
- d5=5: slot = (14+1+5)%16 = 4 → tone 5.
- d6=6: slot = (4+1+6)%16 = 11 → tone 12.

Then the checksum digits follow the same walk. The receiver reconstructs the digits exactly and verifies the checksum.

## 16. Synthesis: sine waves, envelopes and clicks

### The waveform

For each symbol, the encoder generates:

$$
x[n] = A \cdot e[n] \cdot \sin\left(\frac{2\pi f n}{f_s}\right)
$$

where:

- $A$ is amplitude (default 1 in the codec, 0.08 in the lab),
- $e[n]$ is the fade envelope,
- $f$ is the symbol's tone frequency,
- $f_s$ is the sample rate,
- $n$ is the sample index within the symbol.

```js
samples[offset + index] +=
  amplitude * envelope * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
```

The code uses `+=` rather than `=` because each symbol occupies a separate slice of the output array; the offset makes the slices non-overlapping. If they overlapped, the add would mix tones.

### Why fade?

A sine wave that starts at full amplitude has a discontinuity at the boundary. A discontinuity contains energy at many frequencies, which produces an audible **click** and can confuse the detector. A short fade removes the discontinuity:

$$
e[n] =
\begin{cases}
\frac{1}{2} - \frac{1}{2}\cos\left(\frac{\pi n}{F}\right), & 0 \le n < F \\
1, & F \le n < N-F \\
\frac{1}{2} - \frac{1}{2}\cos\left(\frac{\pi (N-1-n)}{F}\right), & N-F \le n < N
\end{cases}
$$

where $F$ is the fade length in samples (6 ms) and $N$ is the symbol length in samples.

This is a **raised cosine** fade. It starts at 0, rises smoothly to 1, stays at 1, then falls smoothly to 0. The derivative is continuous at the joins, so the click energy is much lower.

At 48 kHz, 6 ms is 288 samples out of 5,760 per symbol, about 5% of the symbol. At 44.1 kHz, 6 ms is 265 samples out of 5,292.

### Symbol length in samples

$$
N = \operatorname{round}\left(\frac{f_s \cdot 120}{1000}\right)
$$

At 44.1 kHz: 5,292 samples. At 48 kHz: 5,760 samples.

### Frame duration

$$
T_{\text{frame}} = 11 \cdot 120\ \text{ms} = 1{,}320\ \text{ms}
$$

## 17. Detection: the Goertzel algorithm and the 9 dB rule

### What Goertzel computes

The Goertzel algorithm evaluates the discrete Fourier transform at a single frequency. It uses a second-order recurrence:

$$
s[n] = x[n] + 2\cos\left(\frac{2\pi f}{f_s}\right) s[n-1] - s[n-2]
$$

with $s[-1] = s[-2] = 0$. After processing $N$ samples, the squared magnitude is:

$$
|X(f)|^2 = s[N-1]^2 + s[N-2]^2 - 2\cos\left(\frac{2\pi f}{f_s}\right) s[N-1] s[N-2]
$$

The code names the coefficient $k$:

```js
const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
let previous = 0;
let previousPrevious = 0;
for (...) {
  const current = samples[index] + coefficient * previous - previousPrevious;
  previousPrevious = previous;
  previous = current;
}
const magnitudeSquared =
  previousPrevious * previousPrevious +
  previous * previous -
  coefficient * previous * previousPrevious;
```

### Normalisation and dB

Raw magnitude grows with window length. To compare windows of different sizes, divide by $N^2$:

$$
P = \max\left(\frac{|X|^2}{N^2}, 10^{-12}\right)
$$

Then:

$$
L = 10 \log_{10}(P)
$$

The floor $10^{-12}$ prevents $\log(0)$ when the signal is digitally silent.

### The 9 dB rule

For each symbol window, the code measures all 17 tones, sorts the levels, takes the **median**, finds the **loudest**, and computes:

$$
\text{margin} = L_{\text{loudest}} - L_{\text{median}}
$$

The symbol is accepted only if:

$$
\text{margin} \ge 9\ \text{dB}
$$

```js
const DEFAULT_DETECTION_MARGIN_DB = 9;
```

Why 9 dB? It is a compromise:

- Too low: room noise or a neighbouring tone can win, producing false symbols.
- Too high: quiet phones at 5–10 m fail even when the tone is present.

The 2026-10-25 measurements showed margins of 20–35 dB at 1–3 m but only 10–13 dB at 5 m and about 10 dB at 10 m. Those are close to the 9 dB gate, which explains the sharp failure at distance. The gate is not the only problem—the absolute level and the detector's ability to resolve the tone also matter—but it is a useful indicator.

### Why the median?

The median is robust to a few loud outliers. If one tone is a fan harmonic and another is the real signal, the median stays near the noise floor. If the room is generally loud, the median rises and the margin falls, which is the desired behaviour. The median of 17 values is the 9th smallest (index 8 in a zero-based sorted array):

```js
const median = sorted[(TONE_COUNT - 1) >> 1];
```

`>> 1` is integer division by 2. For 17 values, `(17-1)>>1 = 8`.

### The loudest tone

The code picks the first tone with the highest level:

```js
let loudestTone = 0;
for (let tone = 1; tone < 17; tone += 1) {
  if (db[tone] > db[loudestTone]) loudestTone = tone;
}
```

Ties go to the lower tone index. A tie is rare in real audio but possible in synthetic tests.

## 18. Frame search, timing and the decision window

### The decision window

The receiver does not measure the entire 120 ms symbol. It measures a window centred on the symbol:

$$
W = \max\left(512, \operatorname{round}(0.35 N)\right)
$$

At 48 kHz, $N = 5760$, so $W = 2016$ samples (42 ms). At 44.1 kHz, $N = 5292$, so $W = 1852$ samples (42 ms).

Why 35%? The edges of a symbol contain fade and transition energy. The centre is steadiest. A window shorter than the symbol also reduces the chance of catching a neighbouring symbol when timing is slightly off. The minimum 512 samples ensures enough resolution at low sample rates.

The window start is:

$$
\text{start} = \text{centre} - \left\lfloor \frac{W}{2} \right\rfloor
$$

where the centre is the middle of the symbol:

$$
\text{centre} = \text{frameStart} + iN + \left\lfloor \frac{N}{2} \right\rfloor
$$

### Decoding with a known start

`decodeAtStart` checks that the full frame fits in the buffer, then for each of the 11 symbols:

1. Computes the centre and window.
2. Measures all 17 tones.
3. Requires margin ≥ 9 dB.
4. Records the loudest tone and margin.

After all 11, it calls `decodeToneSequence`, which checks the markers, inverts the walk, and verifies the checksum. Any failure returns `null`.

### Searching without a known start

`decodeFrame` scans the buffer in **10 ms hops**:

```js
const hopSamples = Math.max(1, Math.round((sampleRate * 10) / 1000));
```

For each hop, it measures all 17 tones over a decision window. If tone 0 is loudest with margin ≥ 9 dB, it records a marker start.

It then groups marker starts into **runs**. Two starts belong to the same run if their gap is at most two hops (20 ms). This tolerates a one-hop dropout.

A run is considered a candidate only if its span is at least **1.5 symbols**:

```js
const minMarkerSpan = 1.5 * symbolSamples;
```

That is 180 ms at any sample rate, or 1.5 × 5,760 = 8,640 samples at 48 kHz. This avoids triggering on a single noisy window.

For each candidate run, the decoder estimates the frame start:

$$
\text{estimate} = \operatorname{round}\left(\frac{\text{firstStart} + \text{lastStart} + W}{2} - N\right)
$$

The logic: the marker run covers roughly the two marker symbols. Its midpoint is around the boundary between the second marker and the first data symbol. Subtracting one symbol length moves back to the start of the first marker.

It then tries offsets:

```
0, -10ms, +10ms, -20ms, +20ms, -30ms, +30ms
```

At each offset it calls `decodeAtStart`. The first success wins. This handles timing jitter and the imprecision of the run estimate.

### Why not use a matched filter or cross-correlation?

A matched filter would be more sensitive, but it is more complex and more expensive in a browser. The Goertzel-plus-marker approach is simple, testable and fast enough. The project's goal is a working prototype, not a communications-engineering optimum.

### False positives

A false frame requires:

1. A marker run of at least 1.5 symbols at 18.0 kHz with 9 dB margin.
2. All 11 symbols above 9 dB margin.
3. A valid no-repeat walk (no decoded digit ≥ 15).
4. A checksum match (1 in 225).

Random noise rarely satisfies all four. A loud 18 kHz tone from another source could satisfy the markers, but the data and checksum would still need to align. The synthetic tests report **0 false positives on noise** across the tested runs, but that is not a proof for every room.

## 19. The acoustic capability lab: probes, baselines, verdicts and reports

### Purpose

The lab answers a device question: **Can this phone's speaker and microphone handle the high band at all, and how strong is the local loopback?** It is a self-test, not a range test. The page says so repeatedly.

### Probes

Seven probes:

| Frequency | Band |
| --- | --- |
| 15,500 Hz | coarse |
| 16,500 Hz | coarse |
| 17,500 Hz | coarse |
| 18,500 Hz | coarse |
| 19,500 Hz | coarse |
| 18,000 Hz | codec-edge (marker) |
| 19,760 Hz | codec-edge (top tone) |

The five coarse probes cover the lower-high and upper-high region. The two codec-edge probes are the actual endpoints of the codec band. The lab can therefore say "the top of the band works" or "only the fallback works", not just "some high frequency works".

### Sample-rate gate

The lab requires:

```js
const MIN_SAMPLE_RATE = 44100;
```

It checks the `AudioContext` rate and the microphone track rate separately. If the context is below 44.1 kHz, it refuses. If the track rate is below 44.1 kHz, it refuses. If the track rate is unknown, it allows the run with a warning. The messages explain aliasing and Bluetooth headsets.

### Baseline

Before playing probes, the lab records the ambient level at each probe frequency for **2,200 ms**, after a **450 ms** settle. It computes the **median** of the windows:

$$
B_f = \operatorname{median}(L_{f,1}, \ldots, L_{f,m})
$$

The median is robust to a single click or fan surge.

### Tone playback

Each probe is played for **700 ms** with a **250 ms** gap, at level **0.08**, with a **6 ms** fade and a **20 ms** stop tail. The plan is built by `buildTonePlan`, which computes start/end/fade times for each frequency. The envelope uses four points:

```
(start, 0) → (start+fade, level) → (end-fade, level) → (end, 0)
```

This is a trapezoid with smooth corners, not an abrupt on/off.

### Peak and margin

For each probe, the lab records windows during the steady part, trims the first and last **20%**, and takes the median of the remaining windows:

$$
P_f = \operatorname{median}(\text{steady windows})
$$

The margin is:

$$
M_f = P_f - B_f
$$

Trimming prevents a single click or spurious spike from becoming the peak.

### Verdict thresholds

| Margin | Verdict | Meaning |
| --- | --- | --- |
| ≥ 12 dB | **Strong** | Clear local detection |
| 6–11.9 dB | **Tentative** | Between tentative and strong |
| < 6 dB | **Weak** | Below the tentative threshold |
| no data | **No data** | No steady window collected |

These are stricter than the codec's 9 dB gate because the lab is making a recommendation, not just decoding a frame.

### Summary logic

`summarizeSweep` looks at the measured margins and classifies the device:

1. **Full high band** — both 19.5 kHz and 19.76 kHz are strong. The page still says this is a local self-test; verify 18.0/18.5 kHz, distance and other phones.
2. **Lower high band only** — 18.0 or 18.5 kHz strong, but not both top probes. Do not claim the full band.
3. **Fallback band** — at least one of 15.5/16.5/17.5 kHz strong and no high-band recommendation. Warn about audibility.
4. **Tentative only** — some probes ≥ 6 dB but none of the above patterns.
5. **No data / no usable band** — nothing measured or nothing reached 6 dB.

The report explicitly says: "No attendance claim can be made from this report."

### Meter mapping

The UI meter maps dB to a percentage:

$$
\text{percent} = \frac{\operatorname{clamp}(L, -100, 0) - (-100)}{0 - (-100)} \times 100
$$

So −100 dB maps to 0%, 0 dB maps to 100%, and −50 dB maps to 50%. The clamp prevents the bar from overflowing. The meter is a visual aid, not a calibrated SPL meter.

### Aliasing display

The lab can show the frequency that would actually be represented at a given sample rate:

```js
const folded = ((frequency % sampleRate) + sampleRate) % sampleRate;
return folded <= sampleRate / 2 ? folded : sampleRate - folded;
```

This is how it explains why a 19.5 kHz probe at 32 kHz would appear at 12.5 kHz.

### Report

`formatLabReport` builds a plain-text report with:

- generated timestamp,
- device details (context rate, track rate, processing flags, channels, worklet availability, window size, probes, warning, user agent),
- ambient baseline per probe,
- local measurements table (probe, band, baseline, peak, margin, verdict),
- recommendation headline and detail,
- the sentence "No attendance claim can be made from this report."

The report is copyable. It is not saved server-side. It is a diagnostic artifact.

## 20. The two-phone TX/RX link and its planning arithmetic

The acoustic lab tests one phone's loopback. The two-phone pages test an actual speaker-to-microphone link, with a paired run ID and conditions.

### Run ID

```js
const RUN_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RUN_ID_LENGTH = 6;
```

The alphabet excludes `I` and `O` to avoid confusion with `1` and `0`. It has 24 letters + 8 digits = **32 symbols**. Six symbols give:

$$
32^6 = 1{,}073{,}741{,}824
$$

possible run IDs. The validator accepts 4–12 characters from the same alphabet:

```js
/^[A-HJ-NP-Z2-9]{4,12}$/
```

### Transmission plan

Given a key, repeats, and gap:

$$
\text{slotMs} = T_{\text{frame}} + \text{gapMs} = 1320 + \text{gapMs}
$$

For repeat index $i$ (0-based):

$$
\text{startMs} = i \cdot \text{slotMs}
$$

$$
\text{endMs} = i \cdot \text{slotMs} + 1320
$$

Total duration:

$$
T_{\text{total}} = R \cdot 1320 + (R-1)\cdot \text{gapMs}
$$

Limits:

- repeats: 1–100
- gap: 100–5000 ms
- amplitude: >0 and ≤1

Default gap is 450 ms. The plan includes the data digits, tone sequence and check digits, so the TX report can be compared with the RX report.

### Counting started frames

During playback, the number of frames that should have started by elapsed time $t$ is:

$$
\text{started} = \left\lfloor \frac{t}{\text{slotMs}} \right\rfloor + 1
$$

clamped to $[0, R]$. This is used for progress display, not for proof.

### Decode rate

$$
\text{rate} = \frac{\text{decoded}}{\text{planned}}
$$

with `planned > 0`. The report shows one decimal place. A rate above 100% is possible only if the receiver counts duplicates incorrectly; the code clamps decoded to ≥0 but does not clamp the ratio to 1, because a duplicate count would be a useful signal of a bug.

### Receiver link

`buildReceiverSearch` carries the run ID and conditions (distance, room, notes) into the receiver URL. `readReceiverConditions` reads them back. This prevents the common mistake of a TX report saying "5 m" while the RX report says "1 m". The conditions are limited to 500 characters each.

### Transmit key prefill

The check-in teacher screen opens `/acoustic-tx?key=<decimal>&from=checkin`. `readTransmitKey` accepts **decimal digits only**:

```js
if (!/^\d+$/.test(text)) return null;
```

It rejects hex, exponent, signs and whitespace. It checks the key range 0–170,859,374. A malformed value becomes "no prefill" rather than a broken transmission.

## 21. Every formula in the signal path, in one place

| Quantity | Formula | Code location |
| --- | --- | --- |
| Tone frequency | $f_i = 18000 + 110i$ | `fsk.toneFrequency` |
| Symbol samples | $N = \operatorname{round}(f_s \cdot 0.120)$ | `fsk.encodeFrame` |
| Fade samples | $F = \max(1, \operatorname{round}(f_s \cdot 0.006))$ | `fsk.encodeFrame` |
| Frame duration | $11 \cdot 120 = 1320$ ms | `fsk.SYMBOL_COUNT * SYMBOL_DURATION_MS` |
| Key space | $15^7 = 170{,}859{,}375$ | `checkInSession.KEY_SPACE` |
| Value to digits | repeated `% 15`, `floor(/15)` | `fsk.valueToDigits` |
| Digits to value | Horner base 15 | `fsk.digitsToValue` |
| Checksum | $S = \sum w_i d_i \bmod 225$ | `fsk.checkDigitsFor` |
| Check split | $c_0 = \lfloor S/15\rfloor$, $c_1 = S \bmod 15$ | `fsk.checkDigitsFor` |
| Tone walk | $\text{slot} = (\text{prev}+1+d)\bmod 16$ | `fsk.frameTones` |
| Walk inverse | $d = ((\text{slot}-\text{prev}-1)\bmod 16 + 16)\bmod 16$ | `fsk.decodeToneSequence` |
| Envelope | raised cosine over $F$ samples | `fsk.symbolEnvelope` |
| Synthesis | $A e[n]\sin(2\pi f n/f_s)$ | `fsk.encodeFrame` |
| Goertzel recurrence | $s[n] = x[n] + k s[n-1] - s[n-2]$ | `fsk.singleTonePowerDb` |
| Goertzel coefficient | $k = 2\cos(2\pi f/f_s)$ | `fsk.singleTonePowerDb` |
| Magnitude squared | $s_1^2 + s_2^2 - k s_1 s_2$ | `fsk.singleTonePowerDb` |
| Normalised power | $\max(|X|^2/N^2, 10^{-12})$ | `fsk.singleTonePowerDb` |
| Level dB | $10\log_{10}(P)$ | `fsk.singleTonePowerDb` |
| Margin | $L_{\max} - \operatorname{median}(L)$ | `fsk.measureTones` |
| Decision window | $\max(512, \operatorname{round}(0.35N))$ | `fsk.decodeAtStart` |
| Search hop | $\operatorname{round}(f_s \cdot 0.010)$ | `fsk.decodeFrame` |
| Marker minimum span | $1.5N$ | `fsk.decodeFrame` |
| Frame start estimate | $\operatorname{round}((\text{first}+\text{last}+W)/2 - N)$ | `fsk.decodeFrame` |
| Nyquist | $f_s/2$ | lab / physics |
| Alias fold | $\left|f - f_s \cdot \operatorname{round}(f/f_s)\right|$ | `labConfig.aliasedFrequency` |
| Lab baseline | median of windows | `labConfig.computeBaseline` |
| Lab peak | median after 20% trim | `labConfig.computeTonePeak` |
| Lab margin | $P_f - B_f$ | lab UI |
| Lab verdict | ≥12 strong, ≥6 tentative, else weak | `labConfig.getVerdict` |
| Meter percent | $(L+100)/100 \cdot 100$ after clamp | `labConfig.dbToMeterPercent` |
| TX slot | $1320 + \text{gap}$ | `transmitPlan.buildTransmissionPlan` |
| TX total | $R\cdot1320 + (R-1)\cdot\text{gap}$ | same |
| Decode rate | decoded / planned | `transmitPlan.decodeRate` |

---
# Part III — Architecture

## 22. The shape of the system

### In plain words

Bio Attend is a **single web service** with three layers:

1. A React single-page app served from the same origin.
2. An Express API under `/api/v1`.
3. A MongoDB database.

The browser talks to the API with cookies. In production, the API also serves the built React files. This one-origin layout keeps the session cookie first-party, avoids CORS complexity and prevents the frontend and backend from drifting apart during a deploy.

There is no message queue, no Redis, no background worker service and no paid third-party service. Background work is done by small in-process timers or lazily on request. That is appropriate for a single Render instance and a capstone pilot, not for a large multi-instance deployment.

```text
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (phone/laptop)                    │
│                                                                  │
│  React 19 SPA                                                     │
│  ├── pages: landing, dashboards, check-in, admin, lab, ...        │
│  ├── acoustic helpers: fsk, receiver, useCheckInAudio             │
│  ├── device key: P-256 private key in IndexedDB                   │
│  ├── service worker: offline shell only                           │
│  └── fetch/axios with credentials                                 │
│                                                                  │
│  Microphone ──> AudioWorklet ──> PCM chunks ──> Goertzel decode   │
│  Speaker    <── OscillatorNode / encoded buffers                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS, HttpOnly cookie
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Single Node/Express service                     │
│                                                                  │
│  security headers → CORS → cookies → JSON limit → origin guard    │
│  → routes → auth → role guard → controller → Mongoose             │
│  → error middleware                                               │
│                                                                  │
│  static React build (same origin)                                 │
│  in-process rate limiters, query sweeper, audit chain queue       │
└──────────────────────────────┬───────────────────────────────────┘
                               │ mongodb+srv
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         MongoDB Atlas                             │
│  users, classes, enrollments, rooms, sessions, proofs,            │
│  attendance records, queries, audit logs, notifications,          │
│  timetable, settings, passkeys, WebAuthn challenges,              │
│  device-binding requests                                          │
└──────────────────────────────────────────────────────────────────┘
```

### Why one service?

- **Cookies:** a first-party cookie is simpler and safer. `SameSite=Lax` works without `SameSite=None` and its wider cross-site surface.
- **No CORS drift:** the frontend calls `/api/v1` on its own origin. In development, CRA's proxy forwards to port 4000; in production, Express serves the build.
- **One deploy:** the API and UI version together. There is no window where the frontend expects a route the backend has not deployed.
- **Cost:** one free Render service plus an Atlas M0 cluster. No card-required paid tier.
- **Simplicity:** no infrastructure to explain in a capstone.

The tradeoff is that a single process is a single point of failure and a scaling ceiling. The in-memory rate limiters and audit chain queue assume one instance. The deployment docs say this explicitly. A future multi-instance deployment needs a shared limiter (Redis or similar) and a database transaction or distributed lock for the audit chain.

### The frontend stack

- **React 19** with Create React App 5 (`react-scripts`).
- **React Router 7** for client-side routing.
- **Axios** for most API calls; some public hooks use `fetch`.
- **react-icons** for icons.
- **@simplewebauthn/browser** for passkey registration and assertions.
- Plain CSS files per feature plus a small UI component library.

Create React App is legacy build tooling and has known dependency audit findings. The project keeps it because it works and migrating to Vite is a separate slice. The production build is still green.

### The backend stack

- **Node.js ≥ 22.13** (PDF.js 6 requires it; Node 24 is the documented deployment runtime).
- **Express 4** for routing and middleware.
- **Mongoose 8** for MongoDB models and queries.
- **google-auth-library** for Google ID token verification.
- **jsonwebtoken** for HS256 session and step-up tokens.
- **cookie-parser** for cookie sessions.
- **multer** for in-memory PDF uploads.
- **pdfjs-dist** for deterministic PDF text extraction.
- **pdfkit** for PDF exports.
- **exceljs** for Excel exports.
- **@simplewebauthn/server** for passkey verification.
- No ORM migrations; Mongoose builds indexes at startup.

### The database

MongoDB stores documents. The main collections are:

- `users`
- `rooms`
- `classes`
- `enrollments`
- `checkinsessions`
- `checkinproofs`
- `attendancerecords`
- `attendancequeries`
- `auditlogs`
- `notifications`
- `timetables`
- `systemsettings`
- `adminpasskeys`
- `webauthnchallenges`
- `devicebindingrequests`

Mongoose model names are singular (`User`, `CourseClass`, etc.) and map to pluralised collections.

## 23. The request lifecycle, middleware by middleware

The order in `app.js` is deliberate. Each layer runs before the next, and the order prevents specific classes of bugs.

### 1. `app.disable("x-powered-by")`

Removes the `X-Powered-By: Express` header. It is a small fingerprinting reduction, not a security boundary.

### 2. Security headers

Every response gets:

| Header | Value | Why |
| --- | --- | --- |
| `Content-Security-Policy` | strict policy from `buildCsp()` | Limits scripts, frames, workers and connections |
| `X-Content-Type-Options` | `nosniff` | Stops MIME sniffing |
| `X-Frame-Options` | `DENY` | Stops clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), geolocation=(self), microphone=(self)` | Camera off; mic and location only for this origin |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks legacy Flash/PDF cross-domain policy |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Isolates browsing context while allowing Google popups |
| `Cross-Origin-Resource-Policy` | `same-origin` | Stops other origins embedding resources |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Production only; never pins local HTTP |

The CSP is:

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' https://accounts.google.com;
style-src 'self' 'unsafe-inline' https://accounts.google.com;
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://accounts.google.com;
frame-src https://accounts.google.com;
worker-src 'self' blob:;
manifest-src 'self';
media-src 'self' blob:;
upgrade-insecure-requests (production)
```

`style-src 'unsafe-inline'` is allowed because React writes inline style attributes and Google Identity Services injects a stylesheet. There is **no** `script-src 'unsafe-inline'`. The dark-theme bootstrap is an external file (`theme-init.js`), not an inline script. This is important: an XSS payload needs script execution to call the device-signing function.

### 3. API no-store

Every path starting with `/api` gets:

```
Cache-Control: no-store
```

API responses contain session keys, proofs and personal data. A shared cache must never store them. Route-level `noStore` middleware remains for direct router tests.

### 4. CORS

The CORS policy allows:

- No `Origin` header (curl, server-to-server, dev proxy).
- Exact origins in `CLIENT_URL`, `CLIENT_URLS`, or the development defaults `http://localhost:3000` and `http://127.0.0.1:3000`.
- In non-production only, `https://<random>.trycloudflare.com` for quick phone tunnels.

Production has no default origins. A production process must list its frontend origin explicitly, unless it is single-service (same origin, no CORS needed). Credentials are allowed. Methods are GET/HEAD/PUT/PATCH/POST/DELETE. Allowed request headers are `Content-Type` and `Authorization`.

CORS is **not** the CSRF defence. It controls whether a browser exposes a response; it does not stop a cross-site form POST. The origin guard handles that.

### 5. Cookie parser

Parses the `token`, `admin_token` and `admin_step_up` cookies. The token can also arrive as a `Bearer` header for future mobile/API clients.

### 6. JSON body limit

`express.json({ limit: "200kb" })`. A 200 kB cap is generous for JSON and small enough to stop memory abuse. PDFs do not go through JSON; they use multipart with a 10 MB multer limit, held in memory only.

### 7. Trust proxy

`app.set("trust proxy", 1)`. Render terminates TLS at exactly one proxy hop. Trusting every hop would let a client spoof `X-Forwarded-For` and defeat IP rate limiting. With one hop, `req.ip` is the trusted client address as seen by Render.

### 8. Origin guard

For unsafe methods (POST, PUT, PATCH, DELETE), the guard:

- Allows safe methods untouched.
- Allows requests with no `Origin` header, unless `Sec-Fetch-Site: cross-site` is present.
- Allows an origin equal to the request's own origin (`req.protocol://host`), which handles single-service hosting.
- Allows configured origins.
- Allows the shared Cloudflare tunnel origin outside production.
- Otherwise returns **403** `{ success: false, message: "Cross-origin request blocked" }`.

This happens **before** authentication and controllers, so a cross-site form cannot mutate state even if the browser sends the teacher's cookie.

### 9. Routes

All routes are mounted under `/api/v1`, in this order:

1. `userRoute` — health, islogin, logout, profile.
2. `classRoute` — rooms, classes, rosters.
3. `checkInSessionRoute` — sessions, proofs, student discovery, location.
4. `googleAuthRoute` — Google sign-in, device binding, device reviews.
5. `attendanceRoute` — registers, analytics, history, audit.
6. `queryRoute` — queries.
7. `notificationRoute` — notifications.
8. `timetableRoute` — timetable and PDF preview.
9. `exportRoute` — PDF/Excel.
10. `adminRoute` — console.
11. `devAuthRoute` — only when development/test and `DEV_AUTH_ENABLED=true`.

Order matters for a few reasons:

- The admin route defines `/admin/stop-impersonation` **before** the `/admin` super-admin guard, so an impersonated cookie can still end impersonation.
- The health route is before the auth middleware, so it is public.
- The student active-session routes are more specific than `/check-in-sessions/:sessionId`, and are kept separate because the caller is a student, not the owning teacher.
- The dev routes are mounted last and only conditionally, so production has no such paths at all (404, not 403).

### 10. Static frontend

If `attendance-frontend/build/index.html` exists, Express serves it:

- Files under `build/static/` get `Cache-Control: public, max-age=31536000, immutable` because CRA content-hashes bundle names.
- Everything else (including `index.html`) gets `no-cache`, so a new deploy is visible.
- Any non-API GET falls back to `index.html` for client-side routing.
- A GET under `/api/*` is passed over by the SPA fallback. There is no API-specific 404 handler, so an unmatched API path reaches Express's default 404: a plain `text/html` `Cannot GET /api/...` response, not the React shell and not the JSON error envelope. The `/api` middleware still sets `Cache-Control: no-store` before routing, so even that default response is not cached.

### 11. Error middleware

The error handler:

- Converts malformed JSON (`entity.parse.failed` or a `SyntaxError` with `.body`) to **400** `Invalid JSON body`, without echoing parser text.
- Normalises status from `statuscode`, `statusCode`, `status` or 500.
- Converts Mongoose `CastError` to **400** `resource not found <path>`.
- Converts duplicate-key (`11000`) to **400** `Duplicate <fields> entered`.
- Converts `JsonWebTokenError` to **401**.
- Converts `TokenExpiredError` to **401**.
- Returns `{ success: false, message }`, plus `code` when the error has a string code.
- Keeps numeric Mongo codes private.

The error handler is the last middleware. Nothing after it.

## 24. Startup, database readiness and shutdown

### The startup sequence

`index.js` does the following, in order:

1. Load `config/config.env` with dotenv, **only outside production**. In production, Render supplies environment variables directly.
2. Run `assertProductionEnv()`. In production it refuses to start if:
   - `JWT_SECRET` is missing, a known placeholder, or shorter than 32 characters.
   - `JWT_SECRET_PREVIOUS` is set but invalid or equal to the current secret.
   - `DB_URI` / `MONGODB_URI` is not a `mongodb://` or `mongodb+srv://` string.
   - `COOKIE_EXPIRE` is not positive.
   - `SUPER_ADMIN_SESSION_HOURS` is outside 1–72.
   - `COOKIE_SAMESITE` is not lax/strict/none.
   - `ALLOW_TEST_ROSTER_EMAILS` is truthy.
   - WebAuthn origins are missing or not HTTPS.
   - `WEBAUTHN_RP_ID` is not a suffix of every origin host.
   It warns if `GOOGLE_CLIENT_ID` is missing, `SUPER_ADMIN_EMAILS` is empty, or `COOKIE_SAMESITE=none` is used without `CLIENT_URL(S)`.
3. Run `assertSafeDevConfiguration()`: refuses `DEV_AUTH_ENABLED=true` in production.
4. Run `assertSafeTestAccountConfig()`: validates exact-match test lists, no college addresses in test lists, no Gmail in `TEACHER_EMAILS`, no overlap with `SUPER_ADMIN_EMAILS`, max 10 entries per test list, and `ALLOW_TEST_ROSTER_EMAILS` only outside production with at least one test student.
5. Load the app and all routes/models.
6. Connect to MongoDB, build **every registered model's indexes**, and wait for them.
7. Only then open the HTTP listener.
8. Start a five-minute query sweeper interval.
9. Register signal handlers.

Why build indexes before listening? If the listener opens first, a burst of requests can create documents that a unique index would have rejected. On a fresh database, duplicate rows can make the later unique-index build fail forever. The explicit order is:

```
connect → initIndexes → log readiness → listen
```

If connect, index build or listen fails, the process logs and exits 1. It never serves traffic with an unprepared database.

### Liveness vs readiness

- `GET /api/v1/health` always returns 200 while the process is alive. It does not touch MongoDB.
- `GET /api/v1/health/ready` returns 200 when Mongoose `readyState === 1`, otherwise **503** with `checks.database: false`.

Render's health check should use `/health/ready` so a deploy with a broken database does not receive traffic. A liveness probe should use `/health` so a transient database blip does not restart the process.

### Graceful shutdown

On `SIGTERM` (Render deploy/restart) or `SIGINT` (Ctrl-C):

1. Set `shuttingDown` to avoid double handling.
2. Stop the query sweeper.
3. Stop accepting connections with `server.close()`.
4. Close idle keep-alive connections.
5. Close Mongoose.
6. Exit with code 0 for a signal, 1 for an uncaught exception/rejection.
7. A 10-second force timer exits if a connection is stuck.

`uncaughtException` and `unhandledRejection` also trigger shutdown with exit 1. This is fail-fast: an unknown state should not keep serving.

### The query sweeper

Every five minutes:

```js
expireStaleQueries().catch(...)
```

The sweeper expires pending queries whose `expiresAt <= now`. It is `unref()`ed so it does not keep the process alive by itself. The API also expires lazily before reads, so a query is never shown as pending past its deadline just because the timer has not fired.

### Why not a TTL index for queries?

MongoDB's TTL index deletes documents, but the product needs to **change status to expired**, write an audit entry and notify the student and teacher. A TTL index cannot do that. The sweep uses atomic `findOneAndUpdate` transitions.

### Proof retention

Proof documents have a TTL index (roughly one day) so raw evidence does not accumulate. The attendance record keeps an aggregate evidence counter and wave list, which survives the proof expiry. This is a deliberate privacy/retention choice: the durable register remains, the detailed proof does not.

## 25. Configuration and environment variables

### Backend variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | development / production / test | Production enables strict startup checks and cookies |
| `PORT` | HTTP port | Render supplies it |
| `DB_URI` or `MONGODB_URI` | MongoDB connection | `mongodb+srv://...` in production |
| `JWT_SECRET` | HS256 signing secret | 32+ chars in production; stable across restarts |
| `JWT_SECRET_PREVIOUS` | Verification-only rotation secret | Remove after normal session lifetime |
| `JWT_EXPIRE` | JWT lifetime (default `5d` in docs) | Super-admin override applies |
| `COOKIE_EXPIRE` | Cookie lifetime in days (default 7) | Super-admin uses hours instead |
| `COOKIE_SAMESITE` | `lax`, `strict`, `none` | Default lax; none only for split hosting |
| `GOOGLE_CLIENT_ID` | OAuth Web client ID | Backend verifies audience |
| `CLIENT_URL` / `CLIENT_URLS` | Allowed frontend origins | Comma-separated, exact, no trailing slash |
| `TEACHER_EMAILS` | College addresses that bootstrap teacher accounts | Exact match, comma-separated |
| `SUPER_ADMIN_EMAILS` | Exact addresses granted superadmin | Must not overlap teacher/test lists |
| `SUPER_ADMIN_SESSION_HOURS` | Admin JWT/cookie lifetime | 1–72, default 12 |
| `TEST_STUDENT_EMAILS` | Non-college rehearsal students | Max 10; empty for a real class |
| `TEST_TEACHER_EMAILS` | Non-college rehearsal teachers | Max 10; empty for a real class |
| `ALLOW_TEST_ROSTER_EMAILS` | Admit test students to rosters | Non-production only; refused in production |
| `DEV_AUTH_ENABLED` | Mount dev personas | Refused in production |
| `WEBAUTHN_ORIGINS` | Exact passkey origins | HTTPS in production |
| `WEBAUTHN_RP_ID` | Relying party ID | Defaults to first origin hostname |
| `WEBAUTHN_RP_NAME` | Passkey display name | Default `Bio Attend` |
| `RENDER_EXTERNAL_URL` | Render's own URL | Fallback for WebAuthn origin |
| `REACT_APP_*` | Frontend build-time values | Baked at build, not runtime |

### Frontend variables

| Variable | Purpose |
| --- | --- |
| `REACT_APP_API_URL` | API base; default `http://localhost:4000/api/v1`; production `/api/v1` |
| `REACT_APP_GOOGLE_CLIENT_ID` | Google Identity Services client ID |
| `REACT_APP_GOOGLE_HOSTED_DOMAIN` | Optional hosted-domain hint; empty for Gmail super-admin |
| `REACT_APP_VERSION` | Optional version string in reports |

`REACT_APP_*` is a Create React App convention: only variables with that prefix are exposed to the browser. They are **build-time**, so changing one requires a rebuild, not just a restart.

### Secret handling

- `config/config.env` is gitignored. It must never be committed.
- `JWT_SECRET` must not be a placeholder (`secret`, `changeme`, etc.) or shorter than 32 characters in production.
- The JWT is never returned in JSON for cookie sessions. Returning it would let page scripts read and exfiltrate it, defeating `HttpOnly`.
- The `admin_token` cookie used for impersonation is `HttpOnly`.
- The step-up token is `HttpOnly` and scoped to `/api/v1/admin`.
- `GOOGLE_CLIENT_ID` is public (it is in the frontend bundle); the client **secret** is not used because this is the Google Identity Services credential flow, not a redirect flow.

## 26. The PWA and static-file strategy

### Manifest

`public/manifest.json` declares:

- name: "Bio Attend — classroom attendance"
- short name: "Bio Attend"
- start URL `/`
- scope `/`
- standalone display
- portrait orientation
- theme `#4F46E5`, background `#F8FAFC`
- 192 and 512 px icons, including a maskable 512

The manifest makes the app installable. It does not make it a native app and does not give background audio.

### Service worker

`public/sw.js` caches **only the static shell**:

```
/,
/index.html,
/manifest.json,
/theme-init.js,
/icon-192.png,
/icon-512.png,
/apple-touch-icon.png
```

Rules:

- Only GET requests.
- Only same-origin requests.
- Never cache API paths or any URL containing `check-in-sessions`, `attendance`, `queries`, `notifications` or `islogin`.
- Navigations use network-first, fall back to cached `index.html` or `/`.
- `/static/*` and shell files use cache-first, then network.
- On install, it calls `skipWaiting()`.
- On activate, it deletes old caches and calls `clients.claim()`.

Why this design? Attendance and query data must always come from the server. A cached register could show stale presence; a cached proof response could mislead a student. The shell can be cached because it contains no personal data. The static bundles are content-hashed, so cache-first is safe.

### Cache headers

- `index.html` and deep links: `no-cache`, so a new deploy is seen.
- `static/*`: one-year immutable, because the filename hash changes with content.
- API: `no-store`.

### Offline behaviour

If the network is down:

- The shell loads from cache.
- API calls fail; the UI shows errors or empty states.
- A check-in cannot be submitted.
- No attendance is fabricated or queued.

This is intentional. Offline attendance would need a carefully designed signed queue and conflict resolution; it is not part of this build.

### Theme bootstrap

`public/theme-init.js` runs early and applies the saved light/dark theme before React renders. Keeping it external preserves the no-inline-script CSP. The script reads localStorage and sets a `data-theme` attribute. It does not contain secrets or network calls.

---
# Part IV — The data model

## 27. How MongoDB and Mongoose are used

### In plain words

MongoDB stores JSON-like documents in collections. A **document** is one record, such as one attendance row. A **collection** is a group of records, such as all attendance rows. Unlike a relational database, MongoDB does not require a fixed table schema; Mongoose adds one in application code, with types, defaults, validators and indexes.

Bio Attend uses Mongoose for:

- **Schema validation** — a wave must be an integer, an email is lowercased, a status is one of a fixed set.
- **References** — `student` holds a user id, `session` holds a session id.
- **Indexes** — uniqueness and query speed.
- **Middleware** — the timetable end-time check runs before validation.
- **Timestamps** — `createdAt` and `updatedAt` on most models.
- **Population** — replacing ids with selected fields from another collection.

The database is the source of truth. The frontend never computes attendance percentages from local state; it asks the API, which reads the records.

### Why both references and snapshots?

A pure relational design would join everything live. Bio Attend deliberately **snapshots** identity and class data:

- A session stores `classSnapshot` (course code, title, section, room number).
- An attendance record stores `studentEmail`, `studentName`, `rollNumber`, `classSnapshot`.
- A query stores the same snapshots.

Why? History must not change when a class is renamed, a room number changes, a student changes their display name, or a roster entry is removed. If an old register showed the current name instead of the name at the time, an audit would be misleading. The snapshot is the historical record; the reference is for navigation and notifications.

### Why denormalise evidence counts?

Proof documents expire after about one day. Attendance records survive the term. If the register computed "proof count" by querying proofs, the count would drop to zero after retention. Instead, the proof submission path increments `evidence.proofCount` and adds the wave to `evidence.waves` on the attendance record. The detailed proof remains the audit trail while it exists; the aggregate survives.

This is a deliberate tradeoff: the aggregate can drift if a proof update fails, and the code logs that failure rather than failing the whole proof. The proof itself is still stored; the aggregate is a convenience.

## 28. Every model, field by field

### User (`userModels.js`)

One document per account.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `name` | String | required | Display name |
| `email` | String | required, unique | Sign-in identity; not lowercased by the schema, but sign-in policy normalises it |
| `role` | String | enum student/teacher/superadmin, default student, indexed | Authorisation role |
| `status` | String | enum active/disabled, default active, indexed | Disabled accounts cannot sign in or use old sessions |
| `tokenVersion` | Number | default 0, min 0 | Session epoch; incrementing revokes all old JWTs |
| `authProvider` | String | enum google/dev, default google | How the account was created |
| `googleSubject` | String | unique, sparse | Google `sub` claim, prevents identity swapping |
| `isDemo` | Boolean | default false, indexed | Demo data marker |
| `demoLabel` | String | max 80 | Human label for demo accounts |
| `phoneLabel` | String | max 80 | User-editable device label |
| `rollNumber` | String | max 40 | Optional roll number |
| `deviceBinding.fingerprint` | String | — | SHA-256 of the canonical public JWK |
| `deviceBinding.publicKeyJwk` | Mixed | — | P-256 public key only (`kty`, `crv`, `x`, `y`) |
| `deviceBinding.approvedAt` | Date | — | When a teacher/dev flow approved |
| `deviceBinding.lastSeenAt` | Date | — | Last claim of the same binding |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Methods:

```js
userSchema.methods.getJWTtoken = function (options = {}) {
  const { expiresIn = process.env.JWT_EXPIRE || "5d", ...extraClaims } = options;
  return jwt.sign(
    { id: this._id, tokenVersion: this.tokenVersion || 0, ...extraClaims },
    process.env.JWT_SECRET,
    { expiresIn, algorithm: "HS256" }
  );
};
```

The JWT payload contains the user id, the session version and any extra claims (impersonator id/version, or step-up scope). It does **not** contain the role or email; the auth middleware loads the user on every request, so a role change or disable takes effect immediately, subject to `tokenVersion`.

### Room (`roomModels.js`)

A room is just a name.

| Field | Type | Rules |
| --- | --- | --- |
| `roomNo` | String | required, unique, trim, max 40 |
| `createdAt`, `updatedAt` | Date | timestamps |

The legacy GPS room-corner model was removed. Rooms no longer define a geofence; location is optional query evidence.

### CourseClass (`classModels.js`)

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `courseCode` | String | required, trim, uppercase, max 40 | e.g. `CS301` |
| `title` | String | required, trim, max 120 | e.g. "Operating Systems" |
| `section` | String | default "", max 40 | e.g. `A` |
| `teacher` | ObjectId → User | required, indexed | Owner |
| `defaultRoom` | ObjectId → Room | required | Room used when a session starts |
| `isDemo` | Boolean | default false, indexed | Demo marker |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Unique index:

```js
{ teacher: 1, courseCode: 1, section: 1 }
```

A teacher cannot create two classes with the same code and section. Different teachers can reuse a code.

### Enrollment (`enrollmentModels.js`)

One roster row.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `class` | ObjectId → CourseClass | required, indexed | Which class |
| `email` | String | required, trim, lowercase | Roster identity; the key |
| `name` | String | default "", max 120 | Optional display name |
| `identity.loginId` | String | — | Email local part |
| `identity.batch` | String | — | First four digits, e.g. `2023` |
| `identity.programmeBranch` | String | — | Letters, uppercased, e.g. `UGCS` |
| `identity.rollNumber` | String | — | Trailing digits |
| `student` | ObjectId → User | default null, indexed | Linked account once it exists |
| `phoneLabel` | String | default "", max 80 | Optional |
| `status` | String | enum active/inactive, default active, indexed | Roster membership |
| `rosterUpdatedAt` | Date | default now | Last change |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Unique index:

```js
{ class: 1, email: 1 }
```

The email is the roster key, so a roster can be uploaded before the student ever signs in. When the student signs in, the snapshot code links `student` by email. The link is a convenience for notifications and student views, not the membership test; membership is `email + status: "active"`.

### CheckInSession (`checkInSessionModels.js`)

One live or closed check-in.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `courseClass` | ObjectId → CourseClass | required, indexed | Class |
| `teacher` | ObjectId → User | required, indexed | Owner |
| `room` | ObjectId → Room | required | Room at start |
| `status` | String | enum active/closed, default active, indexed | Live state |
| `wave` | Number | default 0, min 0, max 1,000,000, integer validator | Wave number |
| `key` | Number | required, min 0, max 170,859,374 | Current key |
| `keyIssuedAt` | Date | required | When minted |
| `keyExpiresAt` | Date | required | Two minutes later |
| `keyHistory` | Array of `{wave, key, keyIssuedAt, keyExpiresAt}` | default [] | Archived waves, bounded to 20 |
| `startedAt` | Date | required, default now | Start time |
| `closedAt` | Date | default null | Close time |
| `teacherLocation` | Location | default null | Session-start reference |
| `classSnapshot` | `{courseCode, title, section, roomNo}` | defaults "" | Historical identity |
| `rosterCount` | Number | default 0, min 0 | Snapshot row count |
| `attendanceFinalized` | Boolean | default false, indexed | Register published |
| `attendanceFinalizedAt` | Date | default null | First finalisation time |
| `attendanceFinalizedBy` | ObjectId → User | default null | Who finalised |
| `queryWindowEndsAt` | Date | default null | Close + configured hours |
| `isDemo` | Boolean | default false, indexed | Demo marker |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Indexes:

```js
{ courseClass: 1 } unique partial { status: "active" }
{ courseClass: 1, startedAt: -1 }
```

The partial unique index is the real guard against two active sessions for one class. The controller checks first for a friendly 409, but two simultaneous taps can both pass the check; the index makes one fail with duplicate key 11000, which the controller translates to the same 409.

### CheckInProof (`checkInProofModels.js`)

One signed evidence record.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `session` | ObjectId → CheckInSession | required, indexed | Session |
| `courseClass` | ObjectId → CourseClass | required, indexed | Class snapshot reference |
| `student` | ObjectId → User | required, indexed | Submitter |
| `studentEmail` | String | required, trim, lowercase | Snapshot |
| `deviceFingerprint` | String | required | Binding used |
| `wave` | Number | required, 0–1,000,000 | Wave |
| `key` | Number | required, 0–170,859,374 | Decoded key |
| `signature` | String | required, matches 86-char base64 + `==` | 64-byte P-256 signature |
| `protocolVersion` | String | required, default `bioattend-proof:v1` | Protocol |
| `location` | `{latitude, longitude, accuracy, capturedAt, source}` | optional | Attempt location |
| `createdAt`, `updatedAt` | Date | timestamps | `createdAt` is the recorded time |

Indexes:

```js
{ session: 1, student: 1, wave: 1 } unique
{ session: 1, wave: 1 }
{ createdAt: 1 } expireAfterSeconds: 86400
```

The unique index makes retries idempotent at one proof per student per wave. The TTL index deletes the proof after **24 hours** (86,400 seconds). There is deliberately no attendance, score or status field.

### AttendanceRecord (`attendanceRecordModels.js`)

One durable register row per student per session.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `session` | ObjectId → CheckInSession | required, indexed | Session |
| `courseClass` | ObjectId → CourseClass | required, indexed | Class |
| `teacher` | ObjectId → User | required, indexed | Owner |
| `student` | ObjectId → User | default null, indexed | Linked account |
| `studentEmail` | String | required, trim, lowercase | Snapshot key |
| `studentName` | String | default "" | Snapshot |
| `rollNumber` | String | default "" | Snapshot |
| `classSnapshot` | Object | defaults "" | Snapshot |
| `status` | String | enum pending/present/absent/excused, default pending, indexed | Decision |
| `source` | String | enum pending/manual/query/override/demo/auto, default pending | Why |
| `markedBy` | ObjectId → User | default null | Who |
| `markedByEmail` | String | default "" | Snapshot |
| `markedAt` | Date | — | When |
| `decisionNote` | String | max 500 | Note |
| `query` | ObjectId → AttendanceQuery | default null | Linked query |
| `attemptLocation` | Location | default null | Student's check-in attempt |
| `teacherLocation` | Location | default null | Teacher at start |
| `evidence.proofCount` | Number | default 0, min 0 | Aggregate |
| `evidence.waves` | [Number] | default [] | Waves seen |
| `evidence.firstProofAt` | Date | — | First proof |
| `evidence.lastProofAt` | Date | — | Last proof |
| `isDemo` | Boolean | default false, indexed | Demo |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Indexes:

```js
{ session: 1, studentEmail: 1 } unique
{ courseClass: 1, studentEmail: 1, session: 1 }
{ student: 1, createdAt: -1 }
{ courseClass: 1, status: 1, createdAt: -1 }
```

The unique index is the guard against duplicate roster rows. The snapshot is created idempotently with `$setOnInsert`, so a retried start cannot duplicate.

### AttendanceQuery (`attendanceQueryModels.js`)

One student correction request.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `session` | ObjectId → CheckInSession | required, indexed | Session |
| `courseClass` | ObjectId → CourseClass | required, indexed | Class |
| `teacher` | ObjectId → User | required, indexed | Owner |
| `student` | ObjectId → User | required, indexed | Requester |
| `attendance` | ObjectId → AttendanceRecord | default null | Linked row |
| `studentEmail` | String | required, trim, lowercase | Snapshot |
| `studentName` | String | default "" | Snapshot |
| `classSnapshot` | Object | defaults "" | Snapshot |
| `reason` | String | required, trim, max 1000 | Why |
| `status` | String | enum pending/approved/rejected/expired, default pending, indexed | State |
| `teacherLocation` | Location | default null | Reference |
| `attemptLocation` | Location | default null | From attendance row |
| `studentLocation` | Location | default null | From query |
| `locationNote` | String | max 300 | Note |
| `distanceMeters` | Number | default null | Haversine distance |
| `withinRadius` | Boolean | default null | Distance ≤ radius |
| `radiusMeters` | Number | default 30 | Snapshot |
| `expiresAt` | Date | required, indexed | Deadline |
| `decidedBy` | ObjectId → User | default null | Reviewer |
| `decidedByEmail` | String | default "" | Snapshot |
| `decidedAt` | Date | — | When |
| `decisionNote` | String | max 500 | Note |
| `reopenedAt` | Date | — | Last reopen |
| `reopenedBy` | ObjectId → User | default null | Who |
| `reopenCount` | Number | default 0, min 0 | Count |
| `expiredAt` | Date | — | Expiry time |
| `isDemo` | Boolean | default false, indexed | Demo |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Indexes:

```js
{ session: 1, studentEmail: 1 }
{ teacher: 1, status: 1, createdAt: -1 }
{ student: 1, createdAt: -1 }
{ status: 1, expiresAt: 1 }
```

There is no unique index on `session + studentEmail`, because the controller enforces one query per session per student and a reopen reuses the same document. A unique index would be reasonable, but it is not present; the code checks `findOne` before creating.

### AuditLog (`auditLogModels.js`)

Append-only audit entry.

| Field | Type | Rules | Meaning |
| --- | --- | --- | --- |
| `action` | String | required, indexed, must be in `AUDIT_ACTIONS` | What happened |
| `entityType` | String | required, indexed, max 60 | What kind of thing |
| `entityId` | String | default "", indexed | Which id |
| `actor` | ObjectId → User | default null, indexed | Who |
| `actorEmail` | String | default "" | Snapshot |
| `actorRole` | String | default "" | Snapshot |
| `impersonator` | ObjectId → User | default null | Admin behind impersonation |
| `impersonatorEmail` | String | default "" | Snapshot |
| `summary` | String | max 500 | Human summary |
| `before` | Mixed | default null | Previous state |
| `after` | Mixed | default null | New state |
| `metadata` | Mixed | default null | Extra detail |
| `ip` | String | default "" | `req.ip` |
| `userAgent` | String | max 500 | Browser |
| `isDemo` | Boolean | default false, indexed | Demo |
| `seq` | Number | sparse unique | Chain sequence |
| `prevHash` | String | default "" | Previous hash |
| `hash` | String | default "" | This entry's SHA-256 |
| `createdAt`, `updatedAt` | Date | timestamps | — |

Indexes:

```js
{ createdAt: -1 }
{ actor: 1, createdAt: -1 }
{ seq: 1 } unique sparse
```

The `AUDIT_ACTIONS` list is a closed enum. Adding a new audited action requires adding it to this list; an unknown action is rejected at validation. This prevents typo'd actions from polluting the log and makes the audit view filterable.

### Notification (`notificationModels.js`)

| Field | Type | Rules |
| --- | --- | --- |
| `user` | ObjectId → User | required, indexed |
| `type` | String | enum of 11 types, default system, indexed |
| `title` | String | required, max 160 |
| `message` | String | max 600 |
| `link` | String | max 300 |
| `data` | Mixed | default null |
| `readAt` | Date | default null, indexed |
| `isDemo` | Boolean | default false, indexed |
| `createdAt`, `updatedAt` | Date | timestamps |

Index: `{ user: 1, readAt: 1, createdAt: -1 }`.

Types: session started/closed, attendance finalized, query created/approved/rejected/expired/reopened, device approved/rejected, system.

### Timetable (`timetableModels.js`)

| Field | Type | Rules |
| --- | --- | --- |
| `courseClass` | ObjectId → CourseClass | required, indexed |
| `teacher` | ObjectId → User | required, indexed |
| `room` | ObjectId → Room | default null |
| `dayOfWeek` | Number | required, 0–6, indexed |
| `startTime` | String | required, matches `^([01]\d|2[0-3]):[0-5]\d$` |
| `endTime` | String | same pattern |
| `term` | String | max 80, default "" |
| `active` | Boolean | default true, indexed |
| `isDemo` | Boolean | default false, indexed |
| `createdAt`, `updatedAt` | Date | timestamps |

Days are `["Sunday", "Monday", ..., "Saturday"]`. The pre-validate hook rejects `startTime >= endTime`. Times are **strings** in 24-hour `HH:MM`, so lexicographic comparison works for same-day slots. Overnight slots are not supported.

Indexes: `{ teacher, dayOfWeek, startTime }` and `{ courseClass, dayOfWeek, startTime }`.

### SystemSetting (`systemSettingModels.js`)

A singleton document with `key: "global"`.

| Field | Type | Default | Range |
| --- | --- | --- | --- |
| `queryWindowHours` | Number | 24 | 1–168 |
| `geofenceRadiusMeters` | Number | 30 | 1–1000 |
| `lateGraceMinutes` | Number | 10 | 0–120 |
| `requireQueryLocation` | Boolean | false | — |
| `allowStudentQueries` | Boolean | true | — |
| `demoModeEnabled` | Boolean | true | — |
| `termName` | String | "Autumn 2026" | max 80 |
| `termStart` | Date | null | — |
| `termEnd` | Date | null | — |
| `updatedBy` | ObjectId → User | null | — |

`getSettings()` upserts the singleton with defaults if it does not exist. `updateSettings()` filters allowed keys, builds a `$set` patch and a `$setOnInsert` default patch that **excludes keys already in `$set`**, because MongoDB rejects an update where both operators touch the same path.

### AdminPasskey (`adminPasskeyModels.js`)

| Field | Type | Rules |
| --- | --- | --- |
| `user` | ObjectId → User | required, indexed |
| `credentialId` | String | required, unique |
| `publicKey` | String | required, base64url |
| `counter` | Number | default 0, min 0 |
| `transports` | [String] | — |
| `deviceType` | String | default "" |
| `backedUp` | Boolean | default false |
| `lastUsedAt` | Date | — |
| `createdAt`, `updatedAt` | Date | timestamps |

Index: `{ user: 1, createdAt: 1 }`.

The private key never leaves the authenticator. The server stores only the public credential and a signature counter.

### WebAuthnChallenge (`webauthnChallengeModels.js`)

| Field | Type | Rules |
| --- | --- | --- |
| `user` | ObjectId → User | required, indexed |
| `kind` | String | enum registration/authentication |
| `challenge` | String | required |
| `expiresAt` | Date | required |
| `createdAt`, `updatedAt` | Date | timestamps |

Indexes: `{ user, kind, createdAt: -1 }` and a TTL index on `expiresAt` with `expireAfterSeconds: 0`. A challenge is short-lived; abandoning the browser prompt does not leave a usable challenge forever.

### DeviceBindingRequest (`deviceBindingRequestModels.js`)

| Field | Type | Rules |
| --- | --- | --- |
| `student` | ObjectId → User | required, indexed |
| `fingerprint` | String | required |
| `publicKeyJwk` | Mixed | required |
| `status` | String | enum pending/approved/rejected, default pending, indexed |
| `reviewedBy` | ObjectId → User | — |
| `reviewedAt` | Date | — |
| `createdAt`, `updatedAt` | Date | timestamps |

Unique index: `{ student: 1, fingerprint: 1 }`. A student can have at most one request per browser fingerprint. A new browser creates a new request. Approval supersedes other pending requests for the same student by marking them rejected.

## 29. Relationships and the life of a record

### The class graph

```
User (teacher)
  └── CourseClass
        ├── defaultRoom → Room
        ├── Enrollment (many, by email)
        │     └── student → User (optional link)
        ├── CheckInSession (many)
        │     ├── room → Room
        │     ├── CheckInProof (many, 24h TTL)
        │     ├── AttendanceRecord (one per active roster email)
        │     └── AttendanceQuery (many)
        └── Timetable (many)
```

### Starting a session

1. `CourseClass` is loaded and ownership checked.
2. `CheckInSession` is created with a class/room snapshot and a key.
3. `Enrollment.find({class, status: "active"})` reads the roster.
4. `User.find({email in roster})` links accounts by email.
5. `AttendanceRecord.bulkWrite` upserts one pending row per roster email with `$setOnInsert`.
6. `CheckInSession.rosterCount` is set to the actual row count.
7. `Notification` rows are inserted for linked students.

### Submitting a proof

1. `CheckInSession` is loaded (status, wave, key, expiry).
2. `Enrollment.exists` verifies active membership.
3. `User.deviceBinding` is checked.
4. `DeviceBindingRequest.exists({student, status: "pending"})` blocks a pending change.
5. `CheckInProof` is created with a unique `(session, student, wave)`.
6. `AttendanceRecord` is updated with `$inc proofCount`, `$addToSet waves`, `$min firstProofAt`, `$max lastProofAt`.
7. No status change.

### Closing and finalising

1. `CheckInSession.status = closed`, `closedAt` set once, `queryWindowEndsAt = closedAt + hours`.
2. Notifications to linked students.
3. Teacher marks rows.
4. Finalise: pending rows become absent, `attendanceFinalized = true`, `attendanceFinalizedAt` set once, `attendanceFinalizedBy` set once, notifications, audit.

### Raising a query

1. Session must be closed and inside the window.
2. Student must be enrolled, have an attendance row, and not be present.
3. No existing query for the session/student.
4. Location is normalised and compared with the teacher's session location.
5. `AttendanceQuery` is created and the attendance row's `query` field points to it.
6. Audit and notification to the teacher.

### Deciding a query

1. Query must be pending or expired (already decided is 409).
2. Reviewer must be the owning teacher or a super-admin.
3. Decision must be approved/rejected.
4. Query is updated with decider, time and note.
5. Attendance row is found (or created if missing) and updated:
   - approved → present, source query
   - rejected → if it was present from a query, revert to absent/pending
6. Audit and notification to the student.

### Retention

| Data | Retention | Mechanism |
| --- | --- | --- |
| Roster / enrollment | Term | Manual edits; no automatic deletion |
| Attendance records | Term | No TTL |
| Queries | Term | No TTL; status changes to expired |
| Audit logs | Indefinite | No TTL |
| Proof evidence | ~1 day | TTL index `expireAfterSeconds: 86400` |
| WebAuthn challenges | Short | TTL index at `expiresAt` |
| Device-binding requests | Indefinite | No TTL (open question) |
| Notifications | Indefinite | No TTL |
| Sessions | Indefinite | No TTL; closed sessions remain history |

The plan flags device-binding retention as an open question: should it follow the one-day evidence promise? The current code keeps binding requests so teachers can review and audit device changes.

## 30. Indexes, uniqueness and concurrency guards

### Why indexes matter

An index is a sorted data structure that lets MongoDB find documents without scanning the whole collection. Bio Attend's hot queries are:

- Active session for a class: `{ courseClass, status }`.
- Proofs for a session and wave: `{ session, wave }`.
- Attendance rows for a session: `{ session }`.
- Student attendance history: `{ student, createdAt }`.
- Queries by teacher/status: `{ teacher, status, createdAt }`.
- Notifications by user/read state: `{ user, readAt, createdAt }`.
- Audit by time/actor: `{ createdAt }`, `{ actor, createdAt }`.

### The important unique indexes

| Collection | Index | Protects against |
| --- | --- | --- |
| User | `email` | Duplicate accounts |
| User | `googleSubject` sparse | Two accounts for one Google identity |
| Room | `roomNo` | Duplicate room names |
| CourseClass | `teacher + courseCode + section` | Duplicate class |
| Enrollment | `class + email` | Duplicate roster row |
| CheckInSession | `courseClass` partial active | Two active sessions for one class |
| CheckInProof | `session + student + wave` | Duplicate evidence |
| AttendanceRecord | `session + studentEmail` | Duplicate register row |
| DeviceBindingRequest | `student + fingerprint` | Duplicate device request |
| AdminPasskey | `credentialId` | Same authenticator enrolled twice |
| AuditLog | `seq` sparse | Two writers forking the chain |

### The concurrency patterns

1. **Check-then-create:** the controller checks for an existing active session, then creates. The partial unique index is the real guard. A duplicate-key error is translated to 409.
2. **Atomic compare-and-set:** wave advancement matches `{ _id, teacher, status: active, wave: session.wave }` and updates only if the wave has not changed. The loser gets 409.
3. **Upsert with `$setOnInsert`:** roster snapshot and session creation are idempotent. A retry does not duplicate.
4. **Unique index plus retry:** proof creation catches duplicate key 11000, re-reads the existing proof, and returns duplicate success if the key matches, conflict if it does not.
5. **Atomic query expiry:** `findOneAndUpdate({ _id, status: pending, expiresAt: { $lte: now } }, ...)` ensures only one worker counts the transition.

### Why no transactions?

MongoDB supports multi-document transactions on replica sets, but the app is designed for a single Atlas cluster and mostly avoids cross-document atomicity. Where it matters, it uses unique indexes and conditional updates. The audit chain uses an in-process queue because a transaction would be needed for multi-instance safety. This is documented as a limitation, not hidden.

## 31. Retention and deletion

### Proof TTL

The TTL index:

```js
checkInProofSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60, name: "proof_retention_1_day" }
);
```

MongoDB's TTL monitor runs about every 60 seconds and deletes documents whose `createdAt` is older than 24 hours. It is not instantaneous. The attendance aggregate survives.

### Session deletion

There is no automatic session deletion. Closed sessions remain for history and exports. The admin demo reset deletes demo sessions and related records.

### Attendance deletion

A super-admin can delete one attendance record with `{ confirm: "DELETE" }`. The audit entry stores the before state, so the deletion is visible even though the row is gone.

### Account deletion

There is no user-deletion endpoint. Disabling is the supported action. This preserves attendance history and audit integrity. The `actor` and `student` references may remain; snapshots keep the old email and name.

### Demo data

Demo records use `@demo.invalid` emails and `isDemo: true`. Reset deletes demo users, classes, enrollments, sessions, proofs, attendance, queries, notifications, timetable entries and audit entries associated with demo data, while preserving the signed-in admin. Real data is not touched.

---
# Part V — Identity, security and trust

This part explains who is allowed to do what, how a browser proves that it is still the same trusted browser, how a super-admin approves a destructive action with a passkey, and how the audit chain makes silent edits detectable. The guiding rule is simple: **authentication proves an account; it does not prove a person or a device.** Bio Attend therefore adds a second, narrower proof for attendance (the bound device key) and a second, fresher proof for destructive admin work (the passkey step-up).

## 32. Google sign-in and the sign-in policy

### In plain words

Bio Attend has no password field. A user signs in with Google, and the server decides whether that Google identity is allowed to enter, and with which role. The browser never sends a password to Bio Attend, and Bio Attend never stores one. The Google Identity Services button returns a signed **ID token** (a JWT issued by Google). The React app posts that token to `POST /api/v1/auth/google`. The server verifies it with Google's public keys, checks the claims, looks up or creates the local user, and then sets Bio Attend's own session cookie.

There are two separate gates:

1. **The Google gate** — is this a real, verified Google identity from an allowed domain or an explicit test address?
2. **The authorisation gate** — once the identity is known, is this person a super-admin, teacher or student, and are they on a roster if they are a student?

Both gates must pass. Passing the first does not imply the second.

### The exact checks

The controller calls `googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })`. Google's library verifies the signature against Google's published keys, the issuer, the audience and the expiry. If that throws, the response is **401** `"Google sign-in token could not be verified"`.

After verification the controller applies the policy in `utils/signInPolicy.js`:

| Condition | Required value | Why |
| --- | --- | --- |
| `payload.sub` | a non-empty string | Stable Google identity; used to prevent account swapping |
| `email_verified` | exactly the boolean `true` | A truthy string is not accepted |
| `email` | normalised to lowercase | Case-insensitive identity |
| Workspace email | ends with `@nitjsr.ac.in` | The college domain |
| Workspace `hd` claim | exactly `nitjsr.ac.in` | Proves the account belongs to the hosted domain, not just that the address looks right |
| Test student | exact match in `TEST_STUDENT_EMAILS` | Non-college pilot account |
| Test teacher | exact match in `TEST_TEACHER_EMAILS` | Non-college pilot account |
| Super-admin | exact match in `SUPER_ADMIN_EMAILS` | Environment-granted highest privilege |
| Dev address | must end in `@dev.invalid` and is always rejected by Google | Dev personas cannot become real accounts |

The rule `isAllowedGoogleSignIn` deliberately has **no wildcard and no domain suffix shortcut** for test lists. An address is either present exactly or it is not. A Gmail address placed in `TEACHER_EMAILS` is rejected at startup because `TEACHER_EMAILS` requires the Workspace domain. This prevents a typo or a copied environment variable from granting teacher power to an ordinary Gmail account.

### How the role is resolved

`resolveSignInRole` is an ordered decision. Order matters because a person could match more than one list by accident; startup validation forbids overlaps, but the order still defines the behaviour if the configuration is bypassed.

1. **Super-admin** — if the email is in `SUPER_ADMIN_EMAILS`, return `superadmin`. This wins over every other role.
2. **Test teacher** — if the email is in `TEST_TEACHER_EMAILS`, return `teacher`. This can promote an existing student account, and it is audited.
3. **Existing Workspace teacher** — if the email is on the college domain and the stored role is already `teacher`, keep `teacher`. Removing the address from `TEACHER_EMAILS` does not demote an existing college teacher.
4. **New provisioned teacher** — if the email is on the college domain, the account does not exist yet, and the email is in `TEACHER_EMAILS`, return `teacher`. `TEACHER_EMAILS` bootstraps a new account only; it never promotes an existing student.
5. **Test student or rostered student** — if the email is in `TEST_STUDENT_EMAILS`, or `Enrollment.exists({ email, status: "active" })` is true, return `student`.
6. **Otherwise** — refuse with **403** `"Your college account is not on an active class roster"`.

A subtle but important point: **a real Workspace account cannot use a test list to bypass the roster.** `isTestStudent` and `isTestTeacher` both return `false` for `@nitjsr.ac.in` addresses. A college account belongs on a roster or in `TEACHER_EMAILS`.

### Account linking and lifecycle

Google's `sub` claim is stored as `googleSubject`. If a local user with the same email already has a different `googleSubject`, the sign-in is refused with **403** `"This account is already linked to a different Google identity"`. This stops an attacker who can control the same email string at a different identity provider from taking over the local account.

A disabled account is refused before any role resolution. Google re-authentication never re-activates a disabled account; only an administrator can do that.

If two tabs race the very first sign-in, the unique email index picks one winner. The loser catches MongoDB error `11000`, checks which field collided, and re-reads the user. A `googleSubject` collision is **not** retried: it means a different local account already claims that Google identity, so it is refused. An `email` collision is a safe retry.

Super-admin promotion is audited as `auth.superadmin.granted` only after the user document is saved. Test sign-ins are logged to the server console but are not security audit events.

### Startup configuration validation

`validateTestAccountConfig` runs at startup. It rejects:

- an invalid email syntax;
- an `@dev.invalid` address in any allowlist;
- a non-Workspace address in `TEACHER_EMAILS`;
- a Workspace address in `TEST_STUDENT_EMAILS` or `TEST_TEACHER_EMAILS` (except `SUPER_ADMIN_EMAILS`);
- duplicate addresses within one list;
- the same address in two lists;
- more than ten addresses in a test list;
- `ALLOW_TEST_ROSTER_EMAILS=true` with no `TEST_STUDENT_EMAILS`.

A misconfiguration stops the process instead of silently granting or denying access. This is a fail-closed design: a broken allowlist is more dangerous than a server that refuses to start.

### Re-checking on every request

The JWT contains only the user id and session version. The auth middleware loads the user document and calls `isSessionAllowed(user)`. That function re-checks the live environment lists:

- disabled account → false;
- dev account → only while the dev gate is open;
- super-admin → must still be in `SUPER_ADMIN_EMAILS` (or a demo account while dev mode is open);
- Google account → must still be an allowed sign-in email;
- non-college teacher → must still be in `TEST_TEACHER_EMAILS`.

This means removing an address from the environment takes effect on the **next request**, not when the JWT expires. It does not rewrite the stored role. If an account was promoted and then removed from a test list, the stored role may remain `teacher`, but the session is rejected. The admin should demote or delete the account if that matters.

This check covers environment allowlists, account status and authentication provider. It does **not** query `Enrollment`, so removing a student from a class roster does not invalidate an existing cookie by itself. Class-bound endpoints enforce active enrollment where they need it, as described below.

### What can go wrong

- **Google client ID missing** → `503` before any token is checked.
- **Token expired** → Google's library throws → `401`.
- **Wrong audience** (token minted for another app) → `401`.
- **Email verified not exactly true** → `403`.
- **Workspace email without `hd`** → `403`.
- **Gmail address not on a test list** → `403`.
- **Roster entry removed while a session is live** → the cookie stays valid. `isSessionAllowed` re-checks environment allowlists, status and provider, not roster membership, so roster removal is not a session revocation. Class-bound student reads still derive their class list from active `Enrollment` rows, so the removed class disappears from attendance and session history; proof submission, query creation and live-session lookup re-check `Enrollment.exists` and refuse the removed student. If full immediate revocation is required, disable the account or bump `tokenVersion`.
- **Allowlist typo** → startup refuses to boot, which is intentional.

## 33. Roles, sessions and the JWT cookie

### The three roles

| Role | How it is granted | What it can do |
| --- | --- | --- |
| `student` | Roster entry, `TEST_STUDENT_EMAILS`, or dev persona | Discover live sessions for their classes, submit proof from an approved device, view their own attendance, create queries, read notifications, use the acoustic lab |
| `teacher` | `TEACHER_EMAILS` for a new Workspace account, `TEST_TEACHER_EMAILS`, or an admin role change | Own classes, rosters, rooms, check-in sessions, registers, analytics, exports, device reviews, queries for their classes |
| `superadmin` | `SUPER_ADMIN_EMAILS`, or a dev/demo grant while dev mode is open | Everything a teacher can do through admin routes, plus user/class/settings administration, audit verification, impersonation and demo reset |

Roles are stored as a string enum on the user document. There is no numeric hierarchy in the code. A route that needs a teacher lists `"teacher"` explicitly; a route that needs an admin uses the separate `authorizeSuperAdmin` guard. This separation exists so a route cannot accidentally grant admin power by listing only `"teacher"`.

### What a JWT contains

`user.getJWTtoken()` signs an HS256 token with `JWT_SECRET`:

```json
{
  "id": "<Mongo user id>",
  "tokenVersion": 0,
  "iat": 1730000000,
  "exp": 1730432000
}
```

Optional claims used only for short-lived special tokens:

| Claim | Used by | Meaning |
| --- | --- | --- |
| `impersonatorId` | impersonation token | The super-admin who started impersonation |
| `impersonatorVersion` | impersonation token | The admin's `tokenVersion` at issue time |
| `stepUp: true` | step-up token | This is a passkey approval, not a normal session |
| `scope: "admin"` | step-up token | The token is valid only for the admin API |

The token has an expiry by default (`JWT_EXPIRE`, default `5d`). A token without an expiry would remain valid forever if it leaked; that is why `expiresIn` is always set. The algorithm is pinned to `HS256` so a future library default cannot reinterpret the token under a different JWT family.

`verifyJwt` accepts either the current `JWT_SECRET` or `JWT_SECRET_PREVIOUS`. Signing always uses the current secret. The previous secret is verification-only, so a deploy can rotate the secret without signing every user out at once. If the token expires, the expiry error is preserved so the caller can say "your session expired" instead of "invalid token".

### The cookie

`sendToken` puts the JWT in an **httpOnly** cookie named `token` and returns only the user profile in JSON. The token is never echoed in the response body. If it were, any script on the page could read it and exfiltrate it, which would defeat the cookie flags.

Cookie options come from `utils/cookieOptions.js`:

| Attribute | Value | Why |
| --- | --- | --- |
| `httpOnly` | always true | JavaScript cannot read the cookie |
| `secure` | true in production, or when SameSite=None | The cookie is only sent over HTTPS |
| `sameSite` | `lax` by default; `strict` or `none` configurable | Lax blocks most cross-site sends while keeping normal navigation usable |
| `path` | `/` | Sent to the whole site |
| `expires` | normal: `COOKIE_EXPIRE` days (default 7); super-admin: `SUPER_ADMIN_SESSION_HOURS` (default 12, max 72) | Bounds the browser's copy |

`COOKIE_SAMESITE` is validated against `lax`, `strict`, `none`. SameSite=None is only honoured by browsers when Secure is also set, and the code forces Secure in that case. The default is Lax because the React build and API are normally served from one origin; a split deployment is a deliberate, explicit choice.

The JWT lifetime and the cookie lifetime are not identical. For an ordinary user the JWT defaults to 5 days and the cookie to 7 days, so the server-side expiry wins. For a super-admin the JWT and cookie both use the configured admin hours, with a hard ceiling of 72 hours. A shorter admin session limits the damage from a stolen admin cookie.

### The authentication middleware

`middleware/auth.js` runs on every protected route:

1. Read `req.cookies.token`; if absent, read an `Authorization: Bearer <token>` header. The bearer path exists for API tooling and a future mobile client; both resolve to the same user document.
2. If there is no token, return **401** `"please login to access it"`.
3. `verifyJwt` verifies the signature, algorithm and expiry.
4. Load the user by `decoded.id`. If the user no longer exists, **401**. If the account is disabled, **401** with a specific message.
5. `assertSessionVersion(decoded, user)` — compare the token's `tokenVersion` with the user's current value. A mismatch means the session was revoked.
6. If the token has `impersonatorId`, load the impersonator. The impersonator must still be a non-disabled super-admin, must still pass `isSessionAllowed`, and must still match `impersonatorVersion`. Otherwise **401**.
7. Otherwise, call `isSessionAllowed(user)`. This is where environment allowlist removal and the dev gate are enforced.
8. Attach `req.user`, `req.impersonator`, `req.impersonating` and `req.authClaims`, then continue.

Expired tokens become **401** `"Your session has expired. Please sign in again."` Malformed or forged tokens become **401** `"Invalid session token. Please sign in again."` A valid token for a role that is not allowed on a route becomes **403** `"You do not have permission to perform this action"`.

### Why both a JWT and a database lookup?

A pure JWT design trusts the token until it expires. That would make disabling an account, changing a role, or removing an allowlist entry take effect only after the token lifetime. Bio Attend loads the user on every authenticated request and re-checks eligibility. The cost is one database read per request; the benefit is immediate revocation and immediate policy enforcement. The JWT still carries the identity, so the database lookup does not need to re-verify a password or a Google token.

### What can go wrong

- **Cookie stolen** — the attacker can act as the user until the cookie expires or `tokenVersion` changes. HttpOnly prevents page-script theft, but malware or a compromised browser can still copy cookies.
- **JWT secret leaked** — an attacker can forge any session. The secret must be long, random and stored only in the server environment; `JWT_SECRET_PREVIOUS` must be removed after the rotation window.
- **Clock skew** — `jsonwebtoken` allows a small default tolerance; a badly wrong server clock can reject fresh tokens.
- **Cookie size** — the JWT is small, but adding many claims would approach browser limits. The design keeps claims minimal.
- **Split deployment with SameSite=None** — this widens the cross-site request surface. The origin guard and CORS still apply, but the safer choice is single-origin hosting.

## 34. Session revocation and impersonation

### Session versioning in plain words

Every user document has a `tokenVersion` integer, starting at 0. Every JWT carries the version that was current when it was issued. When the account's version is incremented, every token with the old number becomes invalid on its next request. This is a **session epoch**: one counter revokes all devices without storing a list of sessions.

### What increments the version

| Event | Code path | Why |
| --- | --- | --- |
| User disables their own sessions | `POST /profile/sessions/revoke` | "Sign out everywhere" |
| Admin disables an account | `admin.updateUser` when `status` changes | A disabled account must not keep a live session |
| Admin changes a role | `admin.updateUser` when `role` changes | A demoted teacher must not keep teacher power in an old token |
| Admin revokes a user's sessions | `POST /admin/users/:userId/revoke-sessions` | Incident response |
| A device binding is replaced | `decideDeviceReview` when the student already had a device | The old browser must not keep submitting proof |
| Admin starts impersonation | The impersonation token is short-lived and carries the admin's version; it does not increment the target | Impersonation is a separate token, not a takeover |

The self-revoke route increments by user id and clears the current cookie. The response is a normal success; the user must sign in again.

### Why role changes bump the version

A JWT says "this is user X". The role is read from the database on every request, so a role change already affects authorisation. The version bump is still useful because it invalidates the token outright. That closes the window where a stolen token could be used by an attacker who is relying on the old token's claims, and it makes the revocation visible to the client as a 401 rather than a confusing 403.

### Impersonation

A super-admin can start impersonation from the admin console. The goal is support: see exactly what a student or teacher sees, without asking for their password. The design is deliberately constrained.

`POST /api/v1/admin/users/:userId/impersonate` requires a valid super-admin session **and** a fresh passkey step-up. It refuses:

- invalid or missing target id → **404**;
- target is a super-admin → **403**;
- target is disabled → **409**;
- target is the caller → **409**.

On success it creates a **15-minute** token for the target with:

```json
{
  "id": "<target id>",
  "tokenVersion": "<target tokenVersion>",
  "impersonatorId": "<admin id>",
  "impersonatorVersion": "<admin tokenVersion>"
}
```

If the request used a cookie session, the server stores the admin's original cookie in a separate `admin_token` cookie for **30 minutes**, then replaces `token` with the short impersonation token. The response never contains the token in JSON for a cookie session. For a bearer/tooling client, the token is returned because there is no cookie to hold it.

`POST /api/v1/admin/stop-impersonation` is mounted **before** the super-admin guard and is authenticated by `admin_token`, not by the impersonated user's cookie. That is intentional: if the target account is disabled or its sessions are revoked mid-impersonation, the owner must still be able to leave. The route:

1. Reads `admin_token`.
2. Verifies it; if expired, clears it and returns **401**.
3. Loads the admin, checks role, status, `isSessionAllowed` and session version.
4. Decodes the current target token only to identify the target for the audit entry. A missing or expired target token does not block the exit.
5. Restores `token` to the original admin token with its **real remaining expiry**, clears `admin_token`, audits `admin.impersonation.stopped`, and returns the admin profile.

Restoring the original expiry matters. A fixed 24-hour cookie could outlive the admin token and leave the browser holding a dead session.

### What the auth middleware does during impersonation

When `impersonatorId` is present, the middleware validates the **impersonator** first:

- the admin must still exist;
- the admin must still be a super-admin;
- the admin must not be disabled;
- the admin must still pass `isSessionAllowed`;
- `impersonatorVersion` must match the admin's current `tokenVersion`.

If any check fails, the impersonation ends with **401**. The target's own eligibility rules (including the dev gate) are deliberately **not** applied to the impersonated account, because the super-admin's live grant is the authority for the short session. This is a conscious tradeoff: support can inspect a target that would otherwise be blocked, but only for 15 minutes and only while the admin's own account remains valid.

### Audit trail

Impersonation start and stop are both audited:

- `admin.impersonation.started` records the target, the admin as actor, and `isDemo` if the target is demo data;
- `admin.impersonation.stopped` records the target id (or the admin id if the target token is unreadable) and returns the admin as actor.

Actions taken during impersonation are audited with the target as `actor` and the admin as `impersonator` (`impersonatorEmail` is stored too). That means the audit can answer both "which account did this?" and "which human was driving?".

### What can go wrong

- **Admin closes the tab during impersonation** — `admin_token` remains until it expires (30 minutes) or the admin returns. The target token expires in 15 minutes. The browser may need a fresh sign-in after that.
- **Target account deleted** — the impersonation token's user lookup fails → **401**; the admin can still stop impersonation via `admin_token`.
- **Admin demoted mid-impersonation** — the impersonator checks fail → **401**; stop-impersonation also refuses because the original admin is no longer valid.
- **Cookie limits** — two cookies are set; both are small. A proxy that strips cookies will break the flow.
- **Bearer clients** — they receive the short token in JSON by design and must store it themselves. The server cannot set a cookie for a non-browser client.

## 35. Device binding and the teacher review queue

### Why bind a device?

A session cookie proves "this browser is signed in as student X". It does not prove "this is the phone that has been approved to submit attendance evidence". If a cookie leaks, an attacker could submit proof from another machine. Device binding adds a cryptographic key that exists only in the browser that was approved.

The browser generates a **P-256 ECDSA** key pair. The private key never leaves the browser. The public key is uploaded as a JWK. The server stores the public key and a SHA-256 fingerprint of its canonical form. When the phone submits proof, it signs the exact evidence string with the private key; the server verifies the signature with the stored public key.

### Public-key hygiene

`sanitizePublicKeyJwk` accepts only:

```json
{ "kty": "EC", "crv": "P-256", "x": "<43 base64url chars>", "y": "<43 base64url chars>" }
```

It rejects:

- a missing or non-object value;
- a different key type or curve;
- coordinates that are not exactly 43 unpadded base64url characters (32 bytes);
- any `d` field (private key material).

Rejecting `d` is not just hygiene. If a browser bug or a malicious client uploaded a private key, the server database would become a key-theft target and the "private key never leaves the device" claim would be false. The controller also checks for `d` explicitly and returns **400** `"Private key material must never be uploaded."`

The fingerprint is:

```text
fingerprint = SHA-256( JSON.stringify( canonical public JWK ) )
```

where `canonical` means exactly `{kty, crv, x, y}` in that insertion order after sanitisation. The fingerprint is stored on the user and on every proof, so a later key change does not rewrite history.

### The claim endpoint

`POST /api/v1/device-bindings/claim` is authenticated and **student-only**. A teacher or admin gets **400** `"Only student devices need attendance binding"`.

The controller has three paths:

**1. Dev or test auto-approval.** If the account is a dev persona while the dev gate is open, or the email is in `TEST_STUDENT_EMAILS`, the binding is saved immediately with `approvedAt = now`, and the response is **201** with `status: "approved"`. This exists so a two-phone rehearsal does not need a teacher to approve every browser. Both conditions are environment-controlled and must be emptied before a real pilot.

**2. First binding for a normal student.** If the user has no `deviceBinding.fingerprint`, the request is stored as a `DeviceBindingRequest` with `status: "pending"`, keyed by `(student, fingerprint)`. The response is **202** with `status: "review"`, `firstBinding: true`, and a request id. There is **no trust-on-first-use**. A stolen session cookie cannot turn itself into a trusted device without a teacher decision.

**3. Changed binding.** If the fingerprint matches the current binding, `lastSeenAt` is updated and the response is **200** `status: "approved"`. If it differs, a pending request is created and the response is **202** `status: "review"`. The old binding remains approved until a teacher approves the new one, but proof submission is blocked while any pending change exists (see below).

The upsert uses `findOneAndUpdate({ student, fingerprint }, { $set: { publicKeyJwk, status: "pending" }, $setOnInsert: { student, fingerprint } }, { upsert: true, new: true })`. The unique index on `(student, fingerprint)` prevents duplicate rows. The `$set` on an existing pending row refreshes the key if the browser regenerated it.

### The status endpoint

`GET /api/v1/device-bindings/status` returns:

| Value | Meaning |
| --- | --- |
| `"review"` | A pending request exists (newest pending wins) |
| `"approved"` | No pending request and a fingerprint is stored |
| `"unbound"` | No pending request and no fingerprint |

The frontend uses this to decide whether to show the check-in page, a "waiting for teacher approval" panel, or a "bind this browser" prompt.

### The teacher review queue

`GET /api/v1/device-reviews` is teacher-only. It builds the list of students the teacher may review:

- all emails with an active `Enrollment` in any class owned by the teacher;
- plus every address in `TEST_STUDENT_EMAILS`, because test accounts are never on a roster.

It then finds student users with those emails and returns pending `DeviceBindingRequest` rows, oldest first, populated with `name` and `email`.

`POST /api/v1/device-reviews/:reviewId` accepts `{ decision: "approved" | "rejected" }`. The teacher must be allowed to review that student (`teacherCanReviewStudent`): the student must exist, and either be a test student or share an active enrollment in one of the teacher's classes. Otherwise the response is **404** (not 403), so a teacher cannot probe which review ids exist.

On **approve**:

1. Load the student. If missing → **404**.
2. Remember whether the student already had a device (`hadDevice`).
3. Replace `deviceBinding` with the review's fingerprint and public key, set `approvedAt` and `lastSeenAt`.
4. If `hadDevice`, increment `tokenVersion`. Replacing a trusted device invalidates the old browser's sessions.
5. Save the student.
6. Mark every **other** pending request for that student as `rejected`, with `reviewedBy` and `reviewedAt`. A student may have requested several browsers before review; once one is approved, the others must not keep blocking proof submission.
7. Audit `device.binding.approved` with the fingerprint, whether it was the first binding, and how many requests were superseded.

On **reject**:

1. Audit `device.binding.rejected`.
2. Set the review's `status`, `reviewedBy` and `reviewedAt`.
3. Save.

The review document is saved after the audit. If the audit write fails, the audit helper logs and returns null; the review still completes. Auditing must not make the primary action fail after the database write.

### Why a pending change blocks proof

The proof controller checks:

```js
const pendingChange = await DeviceBindingRequest.exists({
  student: req.user._id,
  status: "pending",
});
if (pendingChange) return 403;
```

Without this check, a student could request a new browser and keep submitting from the old one while the teacher reviews. That would allow two live devices for one account. The rule is: **one trusted device at a time; a pending change freezes proof submission until it is resolved.** The student can still read attendance and raise queries.

### The recovery boundary

If a student loses their phone, they cannot sign the proof from the old key. They sign in on a new browser, request a new binding, and a teacher approves it. Approval bumps `tokenVersion`, which signs out the old browser and invalidates its key. This is the intended recovery path.

The open limitation is the **first binding**: a stolen session cookie on a never-bound account can request a binding. It cannot self-approve (unless it is a test/dev account), so a teacher must still approve it. But the teacher sees only an email and a fingerprint, not a strong identity proof. A real deployment should add a second factor or an in-person check for first bindings. This is listed in the limitations chapter.

### What can go wrong

- **Browser clears its key** — the next claim has a new fingerprint, creating a pending change; proof is blocked until approval.
- **Student opens two browsers** — two pending requests; approving one rejects the other.
- **Teacher has no classes** — the queue is empty except for test students.
- **Test account left in production** — auto-approval would let any browser bind. Empty `TEST_STUDENT_EMAILS` and disable dev auth before a pilot.
- **Malformed stored key** — `verifyProofSignature` catches the crypto error and fails closed (returns false), so the request is a 403 rather than a 500.
- **Fingerprint collision** — SHA-256 collision is computationally infeasible; the fingerprint is an identifier, not a security primitive by itself. The public key is what verifies signatures.

## 36. Passkeys and super-admin step-up

### In plain words

A super-admin session is powerful: it can disable accounts, change roles, delete attendance, reset demo data and impersonate users. A stolen admin cookie should not be enough for those actions. Bio Attend therefore requires a **fresh WebAuthn assertion** — a passkey approval — for destructive admin work. The approval is stored in a short-lived, narrowly scoped cookie so the admin does not have to touch the authenticator for every click in a five-minute window.

WebAuthn has two ceremonies:

- **Registration** — create a credential (usually a platform passkey protected by Touch ID, Windows Hello, or a security key). The server stores the credential id and public key.
- **Authentication (assertion)** — the authenticator signs a server challenge with the private key. The server verifies the signature and increments the signature counter.

The private key never leaves the authenticator. The server stores only the public key.

### Configuration

`webauthnConfig()` resolves:

- **origins** — `WEBAUTHN_ORIGINS`, else `CLIENT_URL`/`CLIENT_URLS`, else Render's `RENDER_EXTERNAL_URL`, else localhost in development, else an empty list in production;
- **rpID** — `WEBAUTHN_RP_ID`, else the hostname of the first origin;
- **rpName** — `WEBAUTHN_RP_NAME`, default `"Bio Attend"`.

Origins are server-side configuration, never taken from a request header. A forged `Origin` header cannot redefine what the assertion is checked against. If no origin or rpID is configured, the passkey endpoints return **503** with a configuration message rather than silently accepting a weaker check.

### First passkey: trust on first use

`POST /api/v1/admin/webauthn/register/options` allows the **first** passkey without a step-up. This is trust-on-first-use: a brand-new super-admin has no passkey, so requiring one would deadlock enrollment. The admin is already authenticated as a super-admin via Google and the environment allowlist.

For **additional** passkeys, `requireStepUpForAdditionalPasskey` requires a valid step-up. The response is **428** `step_up_required` with a reason. This prevents a stolen admin cookie from silently enrolling an attacker's authenticator alongside the real one.

### Registration flow

1. `GET /api/v1/admin/webauthn/status` returns whether the account has passkeys, the count, safe metadata, whether step-up is currently valid, and the step-up lifetime.
2. `POST /admin/webauthn/register/options` generates registration options with `attestationType: "none"`, `residentKey: "preferred"`, `userVerification: "required"`, and `excludeCredentials` for every existing passkey. The challenge is stored in `WebAuthnChallenge` with a **5-minute** expiry. Previous challenges of the same kind for the same user are deleted first.
3. The browser calls `navigator.credentials.create()` and posts the response to `POST /admin/webauthn/register/verify`.
4. The server deletes the challenge atomically with `findOneAndDelete({ user, kind, expiresAt: { $gt: now } })`. If none exists, the challenge expired → **400**.
5. `verifyRegistrationResponse` checks the challenge, origin, rpID and user verification.
6. If verified, the server checks the credential id is not already registered (**409**), stores `credentialId`, base64url public key, counter, transports, device type and backup flag. The private key is never sent.
7. Registration is itself a fresh user-verified ceremony, so the server sets the step-up cookie immediately.
8. Audit `admin.webauthn.registered`.

The challenge is single-use. Deleting it before verification means a replayed response cannot be verified twice, even if the signature is still valid.

### Step-up flow

1. `POST /admin/webauthn/step-up/options` loads the admin's passkeys. If there are none, **409** `passkey_not_enrolled`.
2. It generates authentication options with `allowCredentials` for those passkeys and `userVerification: "required"`, stores the challenge for 5 minutes, and returns the options.
3. The browser calls `navigator.credentials.get()` and posts the assertion to `POST /admin/webauthn/step-up/verify`.
4. The server deletes the challenge; if missing → **400**.
5. It finds the passkey by `(user, credentialId)`. If not found → **400**.
6. It verifies the assertion against the stored public key and counter, with the expected challenge, origin and rpID.
7. On success it updates the counter, `lastUsedAt`, device type and backup flag, then sets the step-up cookie and audits `admin.webauthn.step_up`.

A cloned authenticator that does not increment the counter can be detected by the library's counter check. Some authenticators do not implement a counter; the library handles the zero-counter case, so the check is not a universal clone detector.

### The step-up token

`signStepUpToken` signs a JWT with:

```json
{
  "id": "<admin id>",
  "tokenVersion": "<admin tokenVersion>",
  "stepUp": true,
  "scope": "admin",
  "iat": "...",
  "exp": "..."
}
```

The lifetime is **5 minutes**. The cookie is named `admin_step_up`, HttpOnly, Secure in production, SameSite as configured, and its `path` is **`/api/v1/admin`**. The path restriction means the rest of the site cannot read or replay it, even though it is already HttpOnly. A bearer-style `x-admin-step-up` header is also accepted for tooling; the cookie wins if both are present.

`stepUpState(req)` validates, in order:

| Check | Failure reason |
| --- | --- |
| Token present | `missing` |
| Signature/expiry valid | `invalid-token` |
| `stepUp === true` and `scope === "admin"` | `wrong-scope` |
| `decoded.id` equals `req.user._id` | `wrong-user` |
| User is a non-disabled super-admin | `account-not-eligible` |
| `tokenVersion` matches | `stale-session` |
| `exp - iat <= 300` seconds | `lifetime-too-long` |

The lifetime check is defence in depth. Even if an attacker could mint a token with the right claims, a token valid for an hour would be rejected. The check also catches a configuration mistake where the expiry is accidentally set too long.

### Which routes require step-up

| Route | Guard |
| --- | --- |
| `PATCH /admin/users/:userId` | `requireAdminStepUpForUserChange` — only if the body contains `role` or `status` |
| `POST /admin/users/:userId/revoke-sessions` | `requireAdminStepUp` |
| `PATCH /admin/attendance/:recordId` | `requireAdminStepUp` |
| `DELETE /admin/attendance/:recordId` | `requireAdminStepUp` |
| `PATCH /admin/settings` | `requireAdminStepUp` |
| `POST /admin/impersonate/:userId` | `requireAdminStepUp` |
| `POST /admin/demo/reset` | `requireAdminStepUp` |
| Additional passkey enrollment | `requireStepUpForAdditionalPasskey` |

Profile-only edits (name, phone label) do **not** require step-up. Role and status changes do, because they can disable an account or grant teacher powers. The middleware checks the parsed body with `Object.prototype.hasOwnProperty`, so a body that merely inherits a `role` property does not trigger the guard; only an explicit field does.

### The 428 contract

When step-up is missing or stale, the response is:

```json
{
  "success": false,
  "code": "step_up_required",
  "message": "Approve this action with your passkey.",
  "reason": "missing"
}
```

HTTP **428 Precondition Required** is used instead of 403 because the session is valid; the action merely needs a fresher approval. The admin UI catches 428, opens the passkey prompt, and retries the original request. This is why the route guard runs **before** the controller: no state change may happen until the assertion is verified.

### What can go wrong

- **Admin loses all passkeys** — there is no self-service recovery. Another super-admin must be granted via `SUPER_ADMIN_EMAILS`; if none exists, the environment must be changed and the account recovered operationally. This is a deliberate security tradeoff, but it is an operational risk.
- **Passkey synced to a cloud keychain** — the passkey may be usable on multiple devices. That is a feature of platform passkeys, not a bug, but it widens the set of devices that can approve.
- **Origin mismatch** — a deployment behind a different hostname than `WEBAUTHN_ORIGINS` will fail verification with **400**. Fix the configuration; do not weaken the check.
- **Challenge expired** — the user took longer than 5 minutes at the authenticator prompt. Retry the flow.
- **Step-up cookie not sent** — the cookie path is `/api/v1/admin`; a request to `/api/v1/admin/...` must include it. A reverse proxy that rewrites paths can break the match.
- **Clock skew** — the `exp - iat` check and JWT expiry both depend on reasonable server time.
- **First-passkey race** — two tabs could both see zero passkeys and both enroll without step-up. The unique credential id prevents the same credential twice, but two different authenticators could both be enrolled. This is a narrow TOFU window; an admin should enroll the first passkey immediately after the account is created.

## 37. The audit hash chain

### In plain words

An audit log is a list of "who did what, when". A normal database table can be edited by anyone with database access, so it is not tamper-evident. A hash chain makes each entry depend on the one before it. If someone changes an old entry, its hash changes, and every later entry's `prevHash` no longer matches. Verification recomputes the whole chain and reports the first break.

It is the same idea as a blockchain, without the distributed consensus, mining or tokens. One server, one chain, one SHA-256 hash per entry.

### The fields that are chained

`CHAINED_FIELDS` is the canonical list:

```text
seq, prevHash, action, entityType, entityId, actor, actorEmail, actorRole,
impersonator, impersonatorEmail, summary, before, after, metadata, ip,
userAgent, isDemo, createdAt
```

`hash` itself is excluded (it is the output). Everything that must not change after append is included. If a field is added to the audit document but not to this list, it is not protected; the list is the contract.

### Canonicalisation

Databases return values in different shapes: a Mongoose document, a lean object, a `Date`, an `ObjectId`, a `Buffer`, an array, `undefined`. Hashing raw JSON would produce different hashes for the same logical entry. `normalise` therefore:

- `undefined` and `null` → `null`;
- `Date` → ISO string;
- `Buffer` → base64 string;
- an object with `toHexString` (ObjectId) → hex string;
- an array → recursively normalised array;
- a plain object → keys **sorted alphabetically**, values recursively normalised;
- everything else → unchanged.

`auditPayload` builds an object with every chained field, substituting `null` for `undefined`, and coercing `isDemo` to a boolean. `canonicalJson` is `JSON.stringify(normalise(payload))`.

The hash is:

```text
hash = SHA-256( canonicalJson(entry) )
```

encoded as lowercase hex. SHA-256 is a one-way function: given a hash, you cannot reconstruct the entry, and finding a different entry with the same hash is computationally infeasible.

### Appending

`appendAuditEntry(fields)` runs inside a module-level promise queue:

1. Wait for the previous append to finish.
2. Find the last entry with a non-empty `hash`, sorted by `seq` descending, and read its `seq` and `hash`.
3. `seq = last.seq + 1`; `prevHash = last.hash` (or `""` for the first).
4. `createdAt` is the supplied date or now.
5. Build the entry, compute the hash, and `AuditLog.create({ ...entry, hash })`.
6. Resolve the queue. If the append fails, log it and keep the queue usable.

The queue prevents two concurrent requests from reading the same previous hash and forking the chain. It works because the current deployment is a single Node process. A multi-instance deployment would need a database transaction, a unique sequence reservation or a distributed lock. The code comments say this explicitly.

The unique sparse index on `seq` is the second guard: even if two writers bypass the queue, one insert fails with a duplicate key rather than creating two entries with the same sequence.

### Verifying

`verifyAuditEntries(entries)` is pure and takes an ordered list. It tracks:

- `previousHash = ""`;
- `expectedSeq = 1`;
- `checked = 0`;
- `firstSeq`, `lastSeq`.

For each entry:

1. `seq` must be a positive integer, else `invalid-sequence`.
2. `seq` must equal `expectedSeq`, else `sequence-gap`.
3. Recompute the hash; it must equal the stored `hash`, else `hash-mismatch` (the expected hash is returned for diagnosis).
4. `prevHash` must equal `previousHash`, else `prev-hash-mismatch`.
5. Advance `previousHash`, `firstSeq`, `lastSeq`, `checked`, `expectedSeq`.

If the list is empty, verification succeeds with `checked: 0`. That is correct for a fresh database, but it does not prove that no entries were deleted. The `legacy` count and the sequence gap check catch deletion in the middle; deletion of a suffix is not detectable without an external anchor.

`verifyAuditChain()` loads all entries with a non-empty `hash`, sorted by `seq` ascending, and counts entries with a missing or empty hash as `legacy`. Legacy entries predate the chain and are not rewritten; they are reported separately. The admin endpoint returns this result.

### What is audited

The `AUDIT_ACTIONS` enum is the authoritative list:

```text
session.created, session.closed, session.advanced, session.attendance.finalized,
session.revoked_all, attendance.marked, attendance.override, attendance.deleted,
query.created, query.approved, query.rejected, query.expired, query.reopened,
export.attendance.pdf, export.attendance.xlsx, export.queries.pdf,
export.queries.xlsx, export.session.pdf, export.session.xlsx,
export.users.xlsx, export.audit.xlsx, device.reviewed,
device.binding.first_requested, device.binding.change_requested,
device.binding.approved, device.binding.rejected, admin.user.created,
admin.user.updated, admin.user.sessions_revoked, admin.class.created,
admin.class.updated, admin.settings.updated, admin.impersonation.started,
admin.impersonation.stopped, admin.webauthn.registered,
admin.webauthn.step_up, admin.demo.seeded, admin.demo.reset,
auth.superadmin.granted, timetable.created, timetable.updated, timetable.deleted
```

A Mongoose validator rejects any other action string. This prevents a typo from creating an unqueryable audit row, and it keeps the set of consequential events explicit.

### The audit writer's failure policy

`writeAudit(req, entry)`:

1. Returns `null` if the database is not ready.
2. Snapshots the actor (`_id`, lowercased email, role) and impersonator.
3. Reads the IP from `req.ip` (which Express resolves through the trusted one-hop proxy) and the user agent from the header, truncated to 500 characters.
4. Calls `appendAuditEntry`.
5. On error, logs `[audit] failed to write <action>: <message>` and returns `null`.

It deliberately does **not** throw. The primary action has usually already been written; making the request fail would leave the user believing nothing happened while the database says otherwise. The tradeoff is that an audit write can be lost. The server log is the fallback. A production system with stronger compliance needs would use an outbox or a transactional write.

### What the chain proves and does not prove

**Proves:**

- An entry was not changed after it was appended, assuming the attacker cannot recompute the entire later chain.
- No entry was removed from the middle, because the sequence gap and `prevHash` break.
- The order of entries.

**Does not prove:**

- That the server wrote the truth in the first place. A malicious server can append a false entry with a valid hash.
- That a suffix was not deleted. Removing the last N entries leaves a valid prefix.
- That the database was not replaced wholesale with a recomputed chain. An attacker with full database and code access can recompute every hash.
- That the audit log is complete if `writeAudit` failed silently.

For stronger guarantees, periodically publish the latest `seq` and `hash` to an external append-only store, or sign the chain head with a key the server does not hold. Neither is built.

### What can go wrong

- **Two processes** — the in-process queue does not coordinate across instances; the unique `seq` index will reject one writer, and the failed action may still have succeeded. Scale-out needs a distributed lock.
- **Clock skew** — `createdAt` is part of the hash. Two servers with different clocks produce different hashes for the same logical time; that is fine for tamper evidence but bad for ordering. Sequence is the ordering key, not time.
- **Large `before`/`after` payloads** — they are hashed and stored; a huge diff increases storage and verification time. The code trusts callers to keep them bounded.
- **Legacy rows** — they are excluded from the chain and reported as `legacy`; they cannot be verified.
- **Verification cost** — it loads the entire chain into memory. A very large audit log would need pagination or a rolling checkpoint.

## 38. Rate limits, origin checks, CSP and other hardening

### Rate limits

`createRateLimiter` is a small in-memory fixed-window counter. It is deliberately dependency-free. Each process has its own `Map`, keyed by IP or user id. On a single Render instance that is enough to stop credential guessing and accidental loops. On multiple instances, each instance would allow the full quota; a shared Redis store would be needed for a global limit.

The algorithm:

```text
key = keyFor(req) or "unknown"
now = Date.now()
bucket = buckets.get(key)
if bucket missing or bucket.resetAt <= now:
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
    sweep(now)
bucket.count += 1
remaining = max(0, max - bucket.count)
set RateLimit-Limit, RateLimit-Remaining
if bucket.count > max:
    Retry-After = ceil((bucket.resetAt - now) / 1000)
    return 429
next()
```

`sweep` runs when the map reaches `maxKeys` (default 5000). It first deletes expired buckets. If the map is still full, it deletes the oldest insertion-order entries to keep memory bounded. This is a coarse eviction policy: under a flood, a live bucket can be evicted and its count reset. That is acceptable for a small deployment; a production-grade limiter would use a TTL cache with a proper eviction policy.

The configured limits:

| Endpoint group | Window | Max | Key |
| --- | --- | --- | --- |
| `POST /auth/google` | 10 min | 30 | IP |
| `POST /auth/dev/login` | 10 min | 60 | IP |
| `POST /check-in-sessions/:sessionId/proofs` | 1 min | 60 | user id or IP |
| Admin passkey endpoints | 10 min | 20 | user id or IP |
| Attendance/query exports | 10 min | 30 | user id or IP |
| Admin exports | 10 min | 30 | user id or IP |
| Roster PDF preview | 10 min | 20 | user id or IP |
| Timetable PDF preview | 10 min | 20 | user id or IP |

The PDF limiter is created per router by `createPdfPreviewLimiter()`, so each route has its own bucket. The cap is per route, account and IP.

The response on limit is **429** with `{ success: false, message }` and a `Retry-After` header. The limiter sets `RateLimit-Limit` and `RateLimit-Remaining` on every response, including allowed ones, so a client can back off before it is blocked.

### The origin guard

CORS is not an access-control boundary. A cross-site HTML form can still POST to the API and the browser will send the teacher's cookie; the browser merely refuses to let the attacking page read the response. The mutation still happens. The origin guard closes that hole.

For every **unsafe** method (`POST`, `PUT`, `PATCH`, `DELETE`):

1. If there is no `Origin` header:
   - if `Sec-Fetch-Site: cross-site`, block with **403** `"Cross-origin request blocked"`;
   - otherwise allow. This is for curl, server-to-server and tests, which are not browser cross-site requests.
2. If `Origin` equals the request's own origin (`req.protocol://req.host`), allow. This is the single-service deployment.
3. If `Origin` is in the configured allowlist (`CLIENT_URL`, `CLIENT_URLS`, and localhost defaults in development), allow.
4. Outside production only, allow `https://<random>.trycloudflare.com` for phone testing.
5. Otherwise block with **403**.

Safe methods (`GET`, `HEAD`, `OPTIONS`) are not checked. They must not mutate state; logout is POST-only for exactly this reason. A GET logout would be triggerable by an `<img>` tag or a link preview.

The guard runs **before** authentication and before any controller. A blocked request never reaches the code that would change state. It is mounted in `app.js` before all route mounts, and the app-wiring test asserts that order.

### CORS

`cors` is configured with an explicit origin callback:

- no origin → allow (curl, proxy, server-to-server);
- origin in `allowedOrigins` → allow;
- non-production trycloudflare origin → allow;
- anything else → `callback(null, false)`, which means no CORS headers, so the browser blocks the response.

`credentials: true` is required for cookies. `allowedHeaders` is `Content-Type` and `Authorization`. The default methods are `GET, HEAD, PUT, PATCH, POST, DELETE`.

CORS and the origin guard serve different purposes. CORS tells the browser whether to expose a response. The origin guard decides whether the server will act on the request at all. Both are needed.

### Security headers

`app.js` sets these on every response:

| Header | Value | What it does |
| --- | --- | --- |
| `Content-Security-Policy` | see below | Restricts where scripts, styles, frames, workers and connections can come from |
| `X-Content-Type-Options` | `nosniff` | Stops the browser from guessing a different content type |
| `X-Frame-Options` | `DENY` | Stops the site being framed (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), geolocation=(self), microphone=(self)` | Camera off; geolocation and microphone only for this origin |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks old Flash/PDF cross-domain policy files |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Isolates the browsing context while allowing Google's popup |
| `Cross-Origin-Resource-Policy` | `same-origin` | Stops other origins embedding resources |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) | Pins HTTPS for a year |

HSTS is omitted in development so local HTTP is never pinned to HTTPS. A developer who once loaded a production build on localhost would otherwise be unable to use HTTP again without clearing the browser's HSTS state.

The microphone and geolocation permissions are intentionally allowed for self. The acoustic lab needs the microphone; an attendance query can attach a one-shot location snapshot. Camera stays disabled because nothing in the product uses it.

### Content-Security-Policy

`buildCsp()` returns:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' https://accounts.google.com;
style-src 'self' 'unsafe-inline' https://accounts.google.com;
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://accounts.google.com;
frame-src https://accounts.google.com;
worker-src 'self' blob:;
manifest-src 'self';
media-src 'self' blob:;
upgrade-insecure-requests   (production only)
```

Why each choice:

- **`default-src 'self'`** — everything not explicitly listed falls back to the same origin.
- **`script-src 'self' https://accounts.google.com`** — only our bundles and Google Identity Services. No inline scripts, no `eval`. The dark-theme bootstrap is in `public/theme-init.js` instead of an inline `<script>` for this reason.
- **`style-src 'unsafe-inline'`** — React writes inline `style` attributes. This is weaker than a nonce-based style policy, but it is much better than allowing inline scripts, which are the path an XSS payload needs to call the device-signing function.
- **`img-src data: blob:`** — the logo and generated report images; blob URLs are used for local previews.
- **`worker-src 'self' blob:`** — the audio worklet and service worker.
- **`media-src blob:`** — the acoustic lab may create blob audio URLs.
- **`frame-src https://accounts.google.com`** — the Google sign-in button iframe.
- **`object-src 'none'`** — no plugins.
- **`base-uri 'self'`** — an injected `<base>` cannot redirect relative URLs.
- **`form-action 'self'`** — forms cannot post to another origin.
- **`frame-ancestors 'none'`** — no framing.

`X-Frame-Options: DENY` duplicates `frame-ancestors 'none'` for older browsers.

### Request body and upload limits

`express.json({ limit: "200kb" })` bounds JSON. Attendance payloads are small: a session id, a wave, a key, a 64-byte signature and an optional location. A large JSON body is rejected by Express with **413**.

Roster and timetable PDFs go through `multer.memoryStorage()` with:

- `fileSize: MAX_PDF_BYTES` (10 MB);
- `files: 1`;
- `fields: 0`.

The file is kept in memory only, parsed for preview, and discarded. It is never written to disk or stored in MongoDB. A file over 10 MB becomes **413** `pdf_too_large`. A wrong count or a non-file field becomes **400** `pdf_upload_invalid`. Multer's own errors are translated into stable codes.

### Cache control

Every response under `/api` gets `Cache-Control: no-store`. API responses carry sessions, keys and evidence; a shared cache must never keep them. The static frontend uses a different policy:

- content-hashed files under `build/static/` → `public, max-age=31536000, immutable`;
- everything else, including `index.html` → `no-cache`.

The immutable cache is safe because a changed bundle gets a new filename. `index.html` must be revalidated or a new deploy would be invisible. Deep links return the shell with `no-cache` so the app is checked before each load.

### Trust proxy

`app.set("trust proxy", 1)` tells Express to trust exactly one proxy hop. Render terminates TLS at one hop and forwards HTTP to the app. Trusting every hop would let a client spoof `X-Forwarded-For` and defeat IP-based rate limiting. `req.ip` is used for rate limits and audit entries; reading `X-Forwarded-For` directly would be insecure for the same reason.

### Other hardening

- `app.disable("x-powered-by")` removes the `X-Powered-By: Express` header, which is a small fingerprinting reduction.
- The dev auth router is only mounted when `NODE_ENV` is `development` or `test` **and** `DEV_AUTH_ENABLED=true`. Production is always false. Even if the router were mounted by mistake, both handlers re-check the gate.
- Dev personas must end in `@dev.invalid`. Google sign-in rejects that suffix. `assertSafeDevConfiguration` refuses `DEV_AUTH_ENABLED=true` in production.
- The session cookie is HttpOnly, so an XSS payload cannot read it. It can still make authenticated requests from the page, which is why CSP and output encoding matter.
- The frontend is served from the same origin as the API in the single-service deployment, so cookies are first-party and SameSite=Lax is sufficient.

### What can go wrong

- **In-memory limiter on multiple instances** — each instance allows its own quota. Scale-out needs Redis.
- **Limiter eviction under flood** — a live bucket can be evicted, resetting its count.
- **Proxy misconfiguration** — if there are two proxy hops and `trust proxy` is 1, `req.ip` is the wrong address; rate limits and audit IPs become less meaningful.
- **CSP breaks a legitimate feature** — adding a new third-party script or a blob worker requires updating the policy; otherwise the browser blocks it silently in the console.
- **`style-src 'unsafe-inline'`** — a style-based injection is possible, though script execution is still blocked.
- **Origin guard and `CLIENT_URLS` drift** — a new frontend origin must be added explicitly; otherwise its mutations get 403.
- **Trycloudflare regex in development** — any `*.trycloudflare.com` origin is accepted outside production. That is a deliberate convenience for phone testing, not a production policy.

## 39. The threat model in plain language

### What we are protecting

| Asset | Why it matters |
| --- | --- |
| Attendance records | They affect a student's academic standing; false presence is the core attack |
| Session keys | A leaked current key lets an off-site phone submit a valid proof |
| Device private keys | A stolen key lets an attacker sign as the student's phone |
| Session cookies | A stolen cookie gives access to the account's data and actions |
| Rosters and enrollment data | Personal data; exports are audited and rate-limited |
| Audit log | The record of who changed what; tampering must be detectable |
| Super-admin capability | Can disable accounts, change roles, delete records, impersonate |
| Passkey credentials | The second factor for destructive admin actions |

### Who might attack

| Actor | Capability | Motivation |
| --- | --- | --- |
| Absent student | A phone, a classmate's recording, a shared key | Get marked present without attending |
| Student in a nearby room | A phone that can hear through a wall or door | Submit a valid proof without being in the room |
| Cookie thief | Malware, a shared computer, a proxy log | Act as the student or teacher |
| Malicious insider | Teacher or admin credentials | Change attendance, hide evidence, export data |
| External attacker | Network access, phishing, credential stuffing | Account takeover, data theft, denial of service |
| Curious tester | Browser devtools, replayed requests | Bypass the UI and call the API directly |

### Attack by attack

#### 1. Submit a proof without being in the room

**Attack:** the student obtains the current key from a friend, a recording, or a forwarded message and posts it from home.

**Mitigations:**

- The key is minted server-side, short-lived (2 minutes), and never returned to the student through the API. The student learns it only by decoding the acoustic signal.
- The proof must be signed by the student's approved device key. A copied key string alone is not enough.
- The proof must match the current wave and the current key; an old wave is rejected.
- The server checks that the student is on the class roster.
- The teacher sees the evidence and makes the final decision; a suspicious single proof can be ignored.
- The 9 dB detection rule and the acoustic lab make it harder to fake a decode from silence, though a recorded tone can still be replayed.

**Residual risk:** a student who is close enough to hear the tone (next room, open door, corridor) can submit a valid proof. A student who receives a live recording can replay it on a second phone. The design treats the proof as evidence, not proof beyond doubt. A future slice could add challenge-response across waves, but it is not built.

#### 2. Steal a session cookie

**Attack:** malware or a shared browser copies the `token` cookie.

**Mitigations:**

- HttpOnly prevents page scripts from reading it.
- Secure prevents transmission over HTTP in production.
- SameSite=Lax blocks most cross-site sends.
- `tokenVersion` lets the owner or an admin revoke all sessions immediately.
- Device binding means a stolen cookie cannot submit proof unless the attacker also has the private key. On a never-bound account, the attacker can request a binding, but a teacher must approve it.
- Super-admin actions need a passkey, so a stolen admin cookie cannot disable accounts or change roles.

**Residual risk:** a stolen cookie can still read the account's data, view attendance, create queries, and act as the account until revocation. A stolen teacher cookie can mark attendance; that is why the audit trail and query process exist.

#### 3. Replay a proof

**Attack:** resend a previously accepted proof request.

**Mitigations:**

- The unique index `(session, student, wave)` makes the first proof the only one.
- A retry with the same wave and key returns **200** with `duplicate: true`; it does not create a second record.
- A different key for the same wave returns **409**. The server does not overwrite evidence.
- A proof for a closed session returns **409**.
- A proof for a non-current wave returns **409**.
- An expired key returns **409** before the key equality check, so an attacker cannot use the error code to guess the correct key after expiry.

**Residual risk:** the same key can be submitted by multiple students if they all heard it. That is expected: one wave can produce many proofs. The evidence is per student, not per key.

#### 4. Forge a proof signature

**Attack:** submit a random 64-byte signature or a signature from a different key.

**Mitigations:**

- The server rebuilds the exact message from the session id, wave, key and student id. It does not trust a client-supplied message.
- The signature must be a canonical 64-byte base64 ECDSA signature (`ieee-p1363`).
- The public key must be a valid P-256 JWK; `d` is rejected.
- `crypto.verify` with the stored public key fails closed on a malformed key.

**Residual risk:** if the browser's private key is extracted (malware, rooted device, a compromised browser extension), the attacker can sign. Device binding is not a hardware attestation. There is no `userVerification` requirement for the proof key, so possession of the key is enough.

#### 5. Cross-site request forgery

**Attack:** a malicious page causes the browser to POST to the API with the user's cookie.

**Mitigations:**

- The origin guard checks `Origin` on every unsafe method and blocks unknown origins before authentication.
- `Sec-Fetch-Site: cross-site` without an Origin is blocked.
- SameSite=Lax prevents most cross-site cookie sends.
- State changes are POST/PATCH/DELETE, never GET. Logout is POST-only.
- CORS does not expose responses to unknown origins, though the origin guard is the real control.

**Residual risk:** a same-site subdomain compromise or a browser bug could bypass SameSite. The origin allowlist must be kept exact.

#### 6. Cross-site scripting

**Attack:** inject a script that calls the API as the user or reads data from the page.

**Mitigations:**

- React escapes text by default; the code does not use `dangerouslySetInnerHTML` for user data.
- CSP disallows inline scripts and `eval`; only same-origin bundles and Google Identity Services run.
- HttpOnly cookies cannot be read by scripts.
- `X-Content-Type-Options: nosniff` and a strict `Content-Type` reduce content sniffing.
- The device private key is stored in IndexedDB, not in a cookie; a script running on the origin could still use it to sign. CSP is the main barrier.

**Residual risk:** a dependency compromise or a CSP bypass could run script on the origin. The device key is not marked non-extractable in all browsers; if it is extractable, a script could export it. This is a limitation of browser key storage, not of the server check.

#### 7. Brute-force sign-in

**Attack:** replay Google credentials or guess dev keys.

**Mitigations:**

- Google ID tokens are signed and short-lived; a replayed token is still valid until expiry, but the audience and signature checks prevent forgery.
- `POST /auth/google` is limited to 30 attempts per IP per 10 minutes.
- Dev sign-in is limited to 60 per IP per 10 minutes and is unavailable in production.
- Test lists are exact-match and capped at ten addresses.
- There is no password to guess.

**Residual risk:** a stolen Google ID token can be replayed until it expires. Google's token lifetime is short, and the server does not keep a one-time nonce. TLS and Google's own protections are assumed.

#### 8. Privilege escalation

**Attack:** a student tries to call teacher or admin routes; a teacher tries to call admin routes.

**Mitigations:**

- Every route lists its allowed roles explicitly.
- `authorizeSuperAdmin` is separate from `authorizeRoles("teacher")`.
- Class-owned routes check ownership in the controller, not just the role. A teacher cannot read another teacher's class by guessing an id.
- The admin console cannot promote an ordinary account to super-admin; that grant is environment-only (`SUPER_ADMIN_EMAILS`).
- `TEACHER_EMAILS` cannot promote an existing student; it only bootstraps a new Workspace account.
- A test teacher can be promoted only by an exact test-list entry, which is audited.

**Residual risk:** a compromised teacher account can mark attendance for its own classes. The audit chain and the query process are the detective controls. A compromised super-admin can do anything the console allows, but destructive actions need a passkey and are audited.

#### 9. Tamper with the audit log

**Attack:** edit or delete audit rows directly in MongoDB.

**Mitigations:**

- Each row's hash covers all chained fields and the previous hash.
- A changed field breaks the hash; a removed middle row breaks the sequence and `prevHash`.
- The admin verification endpoint reports the first break with the sequence and expected hash.
- The unique `seq` index makes a duplicate sequence impossible.

**Residual risk:** an attacker with full database and code access can recompute the whole chain or delete a suffix. There is no external anchor and no server-side signing key outside the database. The chain is tamper-evident against casual edits, not against a determined insider with root access.

#### 10. Abuse the PDF preview

**Attack:** upload a huge file, a zip bomb, a malformed PDF, or many files to exhaust memory or CPU.

**Mitigations:**

- Multer caps the file at 10 MB and one file.
- The file is kept in memory only; it is never written to disk.
- The preview limiter allows 20 uploads per 10 minutes per user/IP per route.
- The parser has page and text bounds (`MAX_PDF_PAGES`, `MAX_PDF_TEXT_CHARS`) and stable error codes.
- Only authenticated staff can call the route.
- The preview is read-only: no roster save, no class creation, no attendance change.

**Residual risk:** a crafted PDF can still consume CPU or trigger a parser bug. The process is single-tenant; a crash would be a denial of service. Running the parser in a worker with a hard timeout would be stronger, but it is not built.

#### 11. Scrape data through exports

**Attack:** a compromised teacher session downloads every class register repeatedly.

**Mitigations:**

- Exports are authenticated and role-checked.
- Class-owned exports check ownership.
- A 30-per-10-minute limiter is keyed by user id.
- Every successful export writes an audit entry with the format and scope.
- Admin exports of all users and the audit log are super-admin only.

**Residual risk:** a teacher can export their own classes repeatedly within the limit. The audit trail records it, but there is no data-loss-prevention control.

#### 12. Impersonate another account

**Attack:** a stolen super-admin cookie tries to take over a teacher or student account.

**Mitigations:**

- Impersonation requires a fresh passkey step-up.
- The target cannot be a super-admin, disabled, or the caller.
- The impersonation token is 15 minutes and carries the admin's id and version.
- The admin's eligibility and session version are re-checked on every request.
- Start and stop are audited, and actions during impersonation record both identities.
- The admin cannot silently change the target's password (there is no password) or promote the target to super-admin through the UI.

**Residual risk:** a super-admin with a valid passkey can read anything the target can read. That is the intended support capability. The audit trail is the accountability mechanism.

#### 13. Denial of service

**Attack:** flood the API, the sign-in route, or the PDF parser.

**Mitigations:**

- Rate limits on the expensive and sensitive routes.
- 200 KB JSON body limit.
- 10 MB PDF limit and bounded page/text extraction.
- `maxKeys` bounds the limiter's memory.
- Single-process deployment means one crash takes the service down; Render restarts it.

**Residual risk:** there is no global request-rate limit, no WAF, and no queue. A sustained flood can exhaust the single instance. A production deployment should put a CDN/WAF in front and use a shared rate-limit store.

#### 14. Physical coercion or collusion

**Attack:** a student asks a friend in the room to submit, or a teacher marks a friend present.

**Mitigations:**

- The proof is tied to the student's device key, so a friend cannot submit **as** the student without the student's key. The friend can, however, relay the key.
- The teacher sees the evidence and can query it.
- Students can raise a query if a mark is wrong.
- The audit chain records teacher actions.

**Residual risk:** collusion is not technically preventable. The system provides evidence, not certainty. This is the core reason for the evidence-only design.

### Trust boundaries

| Boundary | What crosses it | What is trusted on the other side |
| --- | --- | --- |
| Browser ↔ API | Cookies, JSON, PDFs, signatures | TLS; the browser is not trusted to enforce policy |
| API ↔ MongoDB | Documents, queries | The database is trusted for storage; the audit chain detects some tampering |
| API ↔ Google | ID token verification | Google's signature and claims |
| Browser ↔ authenticator | WebAuthn challenge/assertion | The authenticator enforces user verification |
| Phone speaker ↔ phone microphone | Acoustic FSK | The physics; the decoder is untrusted code but its output is signed |
| Teacher ↔ register | Human judgement | The teacher is accountable; the audit records the action |

The most important boundary is the last one. Bio Attend does not try to replace the teacher's judgement with a score. It gives the teacher better evidence and records what the teacher decided.

### The honest summary

The system is strong against:

- remote proof submission without the key;
- stolen cookies alone (for proof submission);
- silent admin actions (passkey + audit);
- casual audit edits;
- cross-site state changes;
- obvious brute force.

It is weak against:

- a student who can hear the tone from outside the room;
- a relayed live audio stream;
- malware on the student's device that extracts the private key;
- a determined insider with database and code access;
- a compromised dependency;
- physical collusion.

Those weaknesses are documented rather than hidden. The next part turns to the routes themselves, so every claim above can be traced to a specific endpoint and guard.
# Part VI — Every route

This part is the route contract. It lists every frontend page and every API endpoint in the working tree, with the guard that protects it, the main inputs, the main outputs, and the failure codes that a client must handle. The deeper narrative for each flow is in Part VII; this part is the map.

## 40. Route conventions and access labels

### Base path and format

The API is mounted at **`/api/v1`**. Every path in this part is relative to that prefix. Every matched API endpoint returns JSON except the PDF and Excel downloads. An unmatched `/api/*` path falls through to Express's built-in 404, which is `text/html`, not the JSON envelope and not the React shell. Every `/api` response, including that default 404, carries `Cache-Control: no-store` from the `/api` middleware.

A successful response always contains `success: true`. A failed response contains:

```json
{
  "success": false,
  "message": "A human-readable explanation",
  "code": "an_optional_stable_string"
}
```

The `message` is for people. The `code` is for code. Only a small number of errors carry a `code`, because most failures are not recoverable in a programmatic way:

| Code | HTTP | Where |
| --- | --- | --- |
| `step_up_required` | 428 | Any super-admin route that needs a fresh passkey |
| `passkey_not_enrolled` | 409 | Step-up options when the admin has no passkey |
| `pdf_missing` | 400 | PDF preview with no file |
| `pdf_too_large` | 413 | File over 10 MB |
| `pdf_invalid` | 400 | Buffer lacks a `%PDF-` header |
| `pdf_too_many_pages` | 422 | More than 20 pages |
| `pdf_too_much_text` | 422 | More than 200,000 characters |
| `pdf_password_protected` | 422 | Encrypted PDF |
| `pdf_unreadable` | 422 | Damaged or unsupported PDF |
| `pdf_no_text_layer` | 422 | Scanned/image-only PDF |
| `pdf_upload_invalid` | 400 | Wrong upload shape or more than one file |

### Access labels

| Label | Meaning |
| --- | --- |
| **Public** | No session required |
| **Signed in** | Any valid student, teacher or super-admin session |
| **Student** | `role: "student"` only |
| **Teacher** | `role: "teacher"` only; class-owned routes also check ownership |
| **Staff** | Teacher or super-admin |
| **Super-admin** | `role: "superadmin"` only |
| **Super-admin + step-up** | Super-admin and a fresh WebAuthn assertion; otherwise **428** |
| **Dev-only** | Mounted only when `NODE_ENV=development|test` and `DEV_AUTH_ENABLED=true` |

A missing or expired session returns **401**. A valid session with the wrong role or class ownership returns **403**. A valid super-admin session without a recent passkey approval returns **428** on step-up routes.

Teacher-owned routes deliberately **do not** accept a super-admin. The admin console uses the `/admin/*` routes, so the audit trail names the right authority and the teacher-scoped queries stay scoped. The exception is the read-only analytics routes marked **Staff**, which explicitly allow a super-admin to inspect a class without becoming its owner.

### Middleware order

`app.js` mounts middleware in this order:

1. Security headers (CSP, HSTS, permissions, etc.).
2. `Cache-Control: no-store` for `/api`.
3. CORS.
4. `cookieParser`.
5. `express.json({ limit: "200kb" })`.
6. `trust proxy` = 1.
7. Origin guard (unsafe methods only).
8. Route groups: user, class, check-in session, Google auth/device, attendance, query, notification, timetable, export, admin.
9. Dev auth, only if the gate is open.
10. Static frontend, if a build exists.
11. Error middleware.

Inside each route, the guard order is typically `isAuthenticated` → role guard → rate limiter → upload parser → controller. The proof route is an exception in appearance only: it is `noStore` → student role → proof limiter → controller, so anonymous and teacher requests still get their 401/403 instead of a 429.

### Route matching notes

Express matches routes in mount order. A few deliberate orderings matter:

- `/classes/:classId/check-in-sessions/active` is declared **before** `/check-in-sessions/:sessionId`, so `active` is not captured as a session id.
- `/admin/stop-impersonation` is declared **before** `router.use("/admin", isAuthenticated, authorizeSuperAdmin)`, because the impersonated cookie may no longer pass the super-admin guard.
- `/admin/audit/verify` is declared **before** `/admin/audit`, so `verify` is not treated as a filter or a missing id.
- `/admin/demo/status` and `/admin/demo/seed` are declared before `/admin/demo/reset`; the reset route has the step-up guard.
- Timetable PDF preview is declared before `POST /timetable`; the paths do not conflict, but the order keeps the upload route explicit.

### Bounded queries

List endpoints have hard limits rather than pagination:

| Endpoint | Limit |
| --- | --- |
| Class sessions | 50 |
| Student active sessions | 20 |
| Session proofs | 500 |
| Session queries | 200 |
| Student attendance records | 300 |
| Student closed-session history | 80 |
| Teacher session history | 80 default, 200 max |
| Query list (mine/review/all) | 200 / 300 / 500 |
| Audit (teacher) | 100 default, 500 max |
| Audit (admin, with offset) | 100 default, 1,000 max |
| Admin users | 100 default, 500 max |
| Admin sessions | 200 |
| Notifications | 40 default, 100 max |

These are safety bounds, not a complete pagination design. A production system with years of data would need cursors. The current prototype is designed for a semester of use.

### Idempotency

Some routes are deliberately idempotent:

- `POST /check-in-sessions/:sessionId/proofs` — a repeat of the same wave and key returns **200** `duplicate: true`, not a second record.
- `POST /check-in-sessions/:sessionId/close` — closing twice returns the same closed session and does not change `closedAt`.
- `POST /check-in-sessions/:sessionId/attendance/finalize` — finalising twice returns success; the first finalisation timestamp is kept.
- `POST /notifications/:id/read` — marking an already-read notification is a no-op success.
- Device claim with the same fingerprint updates `lastSeenAt` and returns approved.

Writes that are not idempotent (create query, mark attendance, admin actions) rely on unique indexes, status checks or explicit conflict responses.

## 41. Frontend page routes

The React app is a single-page app. Direct navigation returns the shell; each page then checks `/islogin` through its session hook. The access column describes where the page sends you, not a server-side redirect. The server still enforces every API call, so hiding a page is a usability measure, not a security boundary.

| Route | Access | What it is for |
| --- | --- | --- |
| `/` | Public | Landing page. A signed-in visitor gets a role-aware dashboard action instead of sign-in links. |
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

### Why the acoustic lab is public

The lab is a measurement tool. It does not read attendance, does not need a session, and does not expose student data. Requiring sign-in would make it harder to test a phone before the college accounts are configured. The transmitter can accept a key from a teacher's check-in screen, but the key is already visible to the teacher; the public page does not grant access to the session.

### Redirect behaviour

The page components use role-aware hooks:

- a signed-out visitor on a protected page is sent to `/login`;
- a student on a teacher page is sent to `/student-dashboard`;
- a teacher on a student page is sent to `/teacher-dashboard`;
- a non-super-admin on `/admin` is sent to their role dashboard;
- `/login` with an existing session is sent to the role dashboard.

These redirects are client-side. The API still returns **401** or **403** if a caller ignores the UI.

## 42. Health, session and profile routes

These routes live in `routes/userRoute.js`, except Google auth, which lives in `routes/googleAuthRoute.js`, and dev auth, which is mounted conditionally.

### `GET /health` — Public

Liveness probe. Returns **200** `{ success: true, status: "ok" }` while the process is alive. It deliberately does not check MongoDB, so a restart loop and a database outage are distinguishable in monitoring.

### `GET /health/ready` — Public

Readiness probe. Calls `isDbReady()`:

```json
{ "success": true, "status": "ready", "checks": { "database": true } }
```

with **200** when connected, or **503** with `status: "not-ready"` and `checks.database: false` otherwise. Render can use this to avoid routing traffic before MongoDB is connected. The app still starts when the database is down; the readiness probe is the signal, not a hard startup gate.

### `GET /islogin` — Public (401 without a session)

Resolves the cookie or bearer token and returns the current user plus impersonation context:

```json
{
  "success": true,
  "user": { "...": "presentUser fields" },
  "impersonating": false,
  "impersonator": null
}
```

Without a session, expired token or disallowed account, returns **401**. This is the endpoint every frontend page uses to decide whether to render, redirect or show the login screen. It duplicates the auth checks rather than calling the middleware, because the middleware would reject before the handler could return a helpful response.

### `POST /logout` — Public

Clears the `token` and `admin_token` cookies with the same flags used to set them. Returns **200** `{ success: true, message: "Logged out successfully" }`. It does not revoke the token server-side; the cookie is gone, but a copied token remains valid until expiry or a version bump. This is why "revoke all sessions" exists.

### `GET /logout` — Public

Returns **405** with `Allow: POST`. This exists so a link, an image or a prefetch cannot end a session. A GET request must not change state.

### `POST /auth/google` — Public, rate limited

Body:

```json
{ "credential": "<Google ID token>" }
```

Verifies the Google token, applies the sign-in policy, creates or updates the user, and sets the session cookie. Responses:

| Status | Meaning |
| --- | --- |
| 200 | Signed in; `{ success, user }` and a `token` cookie |
| 400 | `credential` missing |
| 401 | Google token could not be verified |
| 403 | Disabled account, wrong domain, no `hd`, not on a roster, or identity already linked |
| 503 | `GOOGLE_CLIENT_ID` is not configured |

The response never contains the JWT. The rate limit is 30 attempts per IP per 10 minutes.

### `GET /profile` — Signed in

Returns `{ success, user, impersonating, impersonator }`. `impersonator` is `{ id, name, email }` when the session is an impersonation, otherwise `null`.

### `PATCH /profile` — Signed in

Accepts any subset of:

| Field | Rule |
| --- | --- |
| `name` | Trimmed, non-empty, max 80 characters |
| `phoneLabel` | Trimmed, max 80 characters |
| `rollNumber` | Trimmed, max 40 characters |

The role, email, status and device binding cannot be changed here. Returns **200** with the updated `user`. A missing or empty name returns **400**. The profile update is not audited, because it does not change authorisation or attendance.

### `POST /profile/sessions/revoke` — Signed in

Increments the caller's `tokenVersion`, writes `session.revoked_all`, clears both cookies, and returns:

```json
{ "success": true, "message": "All sessions have been revoked. Sign in again." }
```

If the user document disappeared, returns **404**.

### `GET /auth/dev/accounts` — Dev-only

Returns `{ success: true, accounts: [{ key, role, name }] }`. The email is deliberately not returned; the sign-in body uses the key. In production or with the gate closed, the router is not mounted, so the path is **404**.

### `POST /auth/dev/login` — Dev-only, rate limited

Body `{ "key": "<persona key>" }`. Finds or creates a `@dev.invalid` user with `authProvider: "dev"`, `isDemo: true`, and the configured role, then sets the session cookie. If the email already belongs to a real sign-in method, returns **409**. Unknown key returns **404**. Rate limit is 60 per IP per 10 minutes.

## 43. Device-binding routes

These routes live in `routes/googleAuthRoute.js`.

### `POST /device-bindings/claim` — Signed in (student only)

Body:

```json
{
  "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
}
```

The controller rejects a non-student with **400**, private key material with **400**, and an invalid key with **400**. Responses:

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{ success: true, status: "approved", devAutoApproved, testAutoApproved }` | Dev/test auto-approval |
| 202 | `{ success: true, status: "review", requestId, firstBinding: true }` | First binding needs teacher review |
| 202 | `{ success: true, status: "review", requestId }` | Changed binding needs review |
| 200 | `{ success: true, status: "approved", firstBinding: false }` | Same fingerprint; `lastSeenAt` refreshed |

The endpoint is not rate-limited separately; the session is required, and the unique index prevents duplicate pending rows.

### `GET /device-bindings/status` — Signed in

Returns one of:

```json
{ "success": true, "status": "review" }
{ "success": true, "status": "approved" }
{ "success": true, "status": "unbound" }
```

The newest pending request wins over an approved binding, because a pending change must block proof submission.

### `GET /device-reviews` — Teacher

Returns pending requests for students in the teacher's active classes, plus `TEST_STUDENT_EMAILS` accounts:

```json
{ "success": true, "reviews": [ { "_id": "...", "student": { "name": "...", "email": "..." }, "fingerprint": "...", "publicKeyJwk": { "...": "..." }, "status": "pending", "createdAt": "..." } ] }
```

The response includes the public key so the teacher UI can show a fingerprint, but not the student's private key (which never exists on the server).

### `POST /device-reviews/:reviewId` — Teacher

Body `{ "decision": "approved" | "rejected" }`.

- Invalid decision → **400**.
- Review not found, not pending, or student not reviewable → **404** (deliberately not 403, to avoid probing).
- Success → **200** `{ success: true, status: decision }`.

Approval may bump the student's `tokenVersion` and rejects other pending requests. Both outcomes write an audit entry.

## 44. Room, class and roster routes

These routes live in `routes/classRoute.js`. All are teacher-scoped except rooms, which are staff-readable.

### `GET /rooms` — Staff

Returns `{ success: true, rooms: [{ _id, roomNo, createdAt }] }`, sorted by `roomNo`. Rooms are shared across teachers; any staff member can read them.

### `POST /rooms` — Staff

Body `{ "roomNo": "C-101" }`.

| Case | Response |
| --- | --- |
| Missing room number | 400 |
| Longer than 40 characters | 400 |
| Duplicate room number | 409 |
| Created | 201 `{ success: true, room }` |

The room number is trimmed but not uppercased; the unique index is on the exact string.

### `GET /classes` — Teacher

Returns only classes owned by the signed-in teacher, populated with `defaultRoom`, sorted newest first, plus `activeStudentCount` from an aggregation. A super-admin cannot use this route; the admin console uses `/admin/classes`.

### `POST /classes` — Teacher

Body:

```json
{ "courseCode": "CS301", "title": "Databases", "section": "A", "roomId": "<room id>" }
```

`courseCode`, `title` and `roomId` are required. The room must exist. The class is created with `teacher = req.user._id`. Returns **201** with the populated class. The course code is not normalised here; the admin create route uppercases it.

### `POST /classes/:classId/roster/preview` — Teacher

Body `{ "rosterText": "..." }`. Calls `parseRosterText` and returns:

```json
{
  "success": true,
  "preview": {
    "entries": [ { "name": "...", "email": "...", "identity": { "rollNumber": "..." } } ],
    "errors": [ { "line": 3, "message": "..." } ],
    "counts": { "accepted": 40, "rejected": 2, "total": 42 }
  }
}
```

No database write. The exact parser rules are in chapter 86. If the class is not owned, **404**.

### `POST /classes/:classId/roster/pdf/preview` — Teacher, rate limited

Multipart with field `file`. One PDF, max 10 MB. The route is `guards → pdfImportLimiter → acceptPdfUpload → previewRosterPdf`.

The controller first checks class ownership, then requires `req.file`. It calls `extractPdfText(req.file.buffer)` and returns:

```json
{
  "success": true,
  "extraction": {
    "text": "...",
    "pageCount": 2,
    "extractedPages": 2,
    "lineCount": 48,
    "charCount": 3100,
    "hasText": true,
    "institutionalEmailCount": 37,
    "fileName": "roster.pdf"
  }
}
```

`institutionalEmailCount` counts `@nitjsr.ac.in` addresses in the extracted text. It is a convenience signal, not a validation of the roster. The route never saves a roster.

Failure codes: `pdf_missing` (400), `pdf_too_large` (413), `pdf_invalid` (400), `pdf_too_many_pages` (422), `pdf_too_much_text` (422), `pdf_password_protected` (422), `pdf_unreadable` (422), `pdf_no_text_layer` (422), `pdf_upload_invalid` (400). Rate limit: 20 per 10 minutes per account/IP.

### `PUT /classes/:classId/roster` — Teacher

Body `{ "rosterText": "..." }`. Parses the roster and **replaces** the class roster:

1. If parse errors exist, **400** `"Fix roster validation errors before saving"`.
2. If no entries, **400** `"A class must have at least one student"`.
3. For each entry, `Enrollment.bulkWrite` upserts by `(class, email)`, setting `name`, `identity`, `status: "active"`, `rosterUpdatedAt`.
4. Any enrollment for the class whose email is not in the new list is set to `status: "inactive"`.
5. Returns `{ success: true, message: "Roster saved", activeStudentCount }`.

This is a full replacement, not a merge. Removing a student from the text marks the enrollment inactive; it does not delete the historical enrollment or attendance records. This is intentional for history.

### `GET /classes/:classId/roster` — Teacher

Returns `{ success: true, enrollments: [...] }` for active enrollments, sorted by `identity.rollNumber` then email. Inactive enrollments are omitted.

## 45. Check-in session and proof routes

These routes live in `routes/checkInSessionRoute.js` and, for location, `routes/attendanceRoute.js`.

### `GET /classes/:classId/check-in-sessions` — Teacher

Lists sessions for one owned class, newest first, limit 50, each with an attendance summary. The response includes the current key for an active session because the caller owns the class. Returns **404** if the class is not owned.

### `POST /classes/:classId/check-in-sessions` — Teacher

Body (optional):

```json
{ "teacherLocation": { "latitude": 22.78, "longitude": 86.14, "accuracy": 12 } }
```

Starts a session:

1. Class must be owned and have a `defaultRoom`, else **409**.
2. If an active session already exists for the class, **409**.
3. Mints wave 0 and a two-minute key via `buildInitialSession()`.
4. Snapshots the roster into `AttendanceRecord` rows.
5. Sets `rosterCount`, populates class/room/teacher.
6. Notifies enrolled students with a `user` reference.
7. Audits `session.created`.
8. Returns **201** `{ success, session }`.

The response includes the key because the teacher's screen must display it. It is never returned to a student.

### `GET /classes/:classId/check-in-sessions/active` — Student

Returns the active session for one class **if the student is enrolled**, using the key-free student view. If there is no active session, returns **200** with `session: null`; this is an ordinary waiting state, not a 404. If the student is not enrolled, **403**. Invalid class id or missing class, **404**.

### `GET /student/check-in-sessions/active` — Student

Discovers all live sessions across the student's active enrollments, newest first, limit 20, key-free. Returns `{ success: true, sessions: [] }` when there is nothing live.

### `POST /check-in-sessions/:sessionId/proofs` — Student, 60/min

Body:

```json
{
  "wave": 0,
  "key": 123456789,
  "signature": "<86 base64 chars + '=='>",
  "location": { "latitude": 22.78, "longitude": 86.14, "accuracy": 12 }
}
```

The signature is over:

```text
bioattend-proof:v1|session=<sessionId>|wave=<wave>|key=<key>|student=<studentId>
```

The route is evidence-only. It never marks attendance, never assigns a score, never runs an ID round. Responses:

| Status | Body | Meaning |
| --- | --- | --- |
| 201 | `{ success: true, recorded: true, duplicate: false, attendanceDecided: false, proof }` | New evidence stored |
| 200 | `{ success: true, recorded: true, duplicate: true, attendanceDecided: false, proof }` | Same wave/key already stored |
| 400 | Error | Malformed body, wrong key for the current wave, bad message |
| 403 | Error | Not enrolled, no approved binding, pending device change, bad signature |
| 404 | Error | Session id invalid or not found |
| 409 | Error | Session closed, wave not current, key expired, different proof already stored |
| 429 | Error | More than 60 submissions in a minute |

The order of checks is important: the server validates the body, normalises the optional location, loads the session, checks enrollment, checks the device binding, rejects a pending change, rebuilds the message, verifies the signature, looks for an existing proof, then evaluates session status/wave/freshness/key. Full detail is in chapters 54 and 82.

### `GET /check-in-sessions/:sessionId/proofs` — Teacher

Read-only evidence for the owning teacher. Returns:

```json
{
  "success": true,
  "sessionId": "...",
  "attendanceDecided": false,
  "total": 12,
  "byWave": [ { "wave": 0, "count": 7 }, { "wave": 1, "count": 5 } ],
  "proofs": [ { "id": "...", "studentEmail": "...", "wave": 0, "recordedAt": "..." } ]
}
```

No key, signature, protocol version or fingerprint is selected. `attendanceDecided` reflects whether the register has been finalised, not whether this evidence proves presence.

### `GET /check-in-sessions/:sessionId/queries` — Teacher

Returns queries attached to one owned session, newest first, limit 200. It runs `expireStaleQueries()` first. This is separate from `GET /queries/review` so a teacher can see the queries for a specific session even after the global queue has moved on.

### `GET /check-in-sessions/:sessionId` — Teacher

Returns the full teacher view of the session, including the current key and key-free wave history (`keyHistory` contains the old keys server-side, but the teacher view exposes only waves/times). Includes an attendance summary. Only the owning teacher can call it; a super-admin uses the admin session route.

### `POST /check-in-sessions/:sessionId/advance` — Teacher

Advances the wave **only if the current wave has at least one accepted proof**. If not, **409** `"No phone has recorded evidence for this wave yet. Wait for a proof before advancing."` If the session is closed, **409**.

The update is conditional on `_id`, `teacher`, `status: "active"` and the wave the request read. Two concurrent taps can both mint keys, but only one update matches; the loser gets **409** `"The session changed before the wave could advance. Refresh and try again."` The old key is archived in `keyHistory` with `$slice: -20`. Audit `session.advanced`.

### `POST /check-in-sessions/:sessionId/close` — Teacher

Closes the session and sets `queryWindowEndsAt = closedAt + queryWindowHours`. Closing twice is harmless: the first `closedAt` is kept, no second audit entry is written, and the same closed session is returned. Notifies students with a `user` reference and audits `session.closed`.

### `POST /check-in-sessions/:sessionId/location` — Student

Body `{ "location": { "latitude": ..., "longitude": ..., "accuracy": ... } }`.

Stores the attempt location on the student's attendance row for the session. It is deliberately separate from proof submission so a denied GPS permission never blocks the acoustic proof. Missing or invalid coordinates → **400**. Invalid session id → **404**. No attendance row for the student → **403**. Success → **200** with the normalised location and `recordedAt`.

The location is evidence only. It expires with the proof? No — the attendance row's `attemptLocation` survives with the record, while the proof's own optional location expires with the proof document after 24 hours. The query view uses the record/session locations.

## 46. Attendance, analytics and audit routes

These routes live in `routes/attendanceRoute.js`.

### `GET /check-in-sessions/:sessionId/attendance` — Teacher

Opens the session register. Returns:

```json
{
  "success": true,
  "session": { "...": "teacher session view", "attendanceSummary": {}, "geofenceRadiusMeters": 30 },
  "records": [ { "...": "attendanceRecordView", "query": null, "attemptDistanceMeters": 12.4 } ],
  "summary": { "total": 40, "present": 30, "absent": 2, "pending": 8, "excused": 0, "percentage": 93.8 },
  "queries": [ { "id": "...", "studentEmail": "...", "status": "pending", "reason": "..." } ],
  "settings": { "queryWindowHours": 24, "geofenceRadiusMeters": 30, "requireQueryLocation": false }
}
```

One row per roster student snapshotted at session start. The route is teacher-only; a super-admin uses `/admin/sessions/:sessionId/attendance`.

### `PATCH /check-in-sessions/:sessionId/attendance` — Teacher

Body:

```json
{
  "records": [
    { "recordId": "...", "status": "present", "note": "Roll call" },
    { "studentEmail": "student@nitjsr.ac.in", "status": "absent", "note": "" }
  ]
}
```

Each entry may identify the row by `recordId` or `studentEmail`. Status must be `pending`, `present`, `absent` or `excused`. At least one entry is required; more than 500 is **400**. A row that is not in the session roster is **404**. The write is a `bulkWrite`, then audit `attendance.marked` with the from/to changes. Marking is allowed while the session is live.

### `POST /check-in-sessions/:sessionId/attendance/finalize` — Teacher

Requires the session to be **closed**, else **409**. It turns every remaining `pending` row into `absent` with `source: "auto"` and a note, marks the session `attendanceFinalized`, sets the timestamp/actor (first finalisation wins), notifies students, and audits `session.attendance.finalized` with the summary and `autoAbsent` count. Finalising twice is idempotent: no new auto-absent rows, the first timestamp/actor is kept, and a second audit entry records the re-finalisation. The 24-hour query window is tied to **session close**, not to finalisation.

### `GET /attendance/me` — Student

Returns the student's own attendance across active enrollments:

- `summary` with `present`, `absent`, `pending`, `excused`, `total`, `percentage`;
- `classes` with the same counters per class plus a `sessions` array;
- `recent` (last 30 records) with class snapshot, status, source, session id and finalised flag;
- `queries` (last 50) with status, reason, expiry and decision note.

Percentages count **decided** records only: `percentage = round(present / (present + absent) * 1000) / 10`. Pending and excused are excluded from the denominator. This is deliberate: a pending roll-call should not look like an absence. A class with no decided records has `percentage: null`.

### `GET /attendance/me/sessions` — Student

Returns closed sessions for the student's active enrollments, newest first, limit 80. For each session:

- class snapshot and room;
- `startedAt`, `closedAt`, `queryWindowEndsAt`, `windowOpen`;
- the student's attendance row (status, source, note, whether a location exists);
- any existing query (status, reason, expiry, decision, distance, radius check);
- `canRaiseQuery` — true only if a row exists, the student is not present, no query exists, the window is open and queries are enabled.

This is the data source for the query screen. If the student has no active enrollments, it returns an empty list, not a 404.

### `GET /attendance/sessions` — Staff

Teacher session history across classes, newest first, limit 80 default / 200 max. A teacher is scoped to their own sessions. A super-admin sees all, optionally filtered by `teacherId`, `classId`, `status`, `from`, `to`. Each item includes class, room, status, wave, timestamps, finalisation, query window, roster count, attendance summary and query counts.

### `GET /attendance/classes/:classId/overview` — Staff

Class analytics. A teacher must own the class; a super-admin can inspect any class. Optional query parameters `from`, `to`, `term` are passed to `resolveTermRange`. Returns:

- `class` identity;
- `term` range and name;
- `summary` totals, decided, percentage and class average;
- `students` sorted by roll number then email, each with counters and percentage;
- `sessions` with per-session summaries;
- `trend` for closed sessions only, with a short date label, percentage, present/absent/pending;
- `queries` counts by status.

If the class has no attendance records, the student list is empty rather than an error. An unowned class is **404**.

### `GET /attendance/classes/:classId/students/:studentId` — Staff

`:studentId` accepts either a 24-character Mongo user id or an email address. Returns the student's records in that class, newest first, limit 300, plus a summary and all queries for that student in the class. If no records exist, **404**. A teacher must own the class; a super-admin can inspect any.

### `GET /audit/me` — Teacher

Returns the signed-in teacher's own audit entries, newest first, limit 100 default / 500 max. Optional filters `action` and `entityType`. It filters by `actor: req.user._id`, so a teacher sees their own actions, not every teacher's. A super-admin uses `/admin/audit`.

## 47. Query routes

These routes live in `routes/queryRoute.js`. A query is a student's request to correct attendance for a closed session.

### `POST /queries` — Student

Body:

```json
{
  "sessionId": "<id>",
  "reason": "I was present but my phone did not decode the tone.",
  "studentLocation": { "latitude": ..., "longitude": ..., "accuracy": ... },
  "locationNote": "Seated at the back"
}
```

Validation and conflict rules:

| Case | Status |
| --- | --- |
| Queries disabled by settings | 403 |
| Missing/invalid session id | 400 |
| Reason shorter than 10 chars | 400 |
| Reason longer than 1000 chars | 400 |
| Session not found | 404 |
| Student not on the class roster | 403 |
| Session still live | 409 |
| Query window closed | 409 |
| A query already exists for this session | 409 |
| No attendance row for the student | 403 |
| Already marked present | 409 |
| Location required by settings but missing/invalid | 400 |
| Created | 201 `{ success, query }` |

On success it computes the distance between the teacher's session location and the student's location (or the attempt location), compares it to `geofenceRadiusMeters`, stores `withinRadius`, links the query to the attendance row, audits `query.created`, and notifies the teacher.

### `GET /queries/mine` — Student

Returns the caller's own queries, newest first, limit 200, including all location fields and decisions.

### `GET /queries/review` — Teacher

Returns queries for classes the teacher owns, newest first, limit 300. Optional `status`, `classId`, `sessionId`. Also returns counts by status (`pending`, `approved`, `rejected`, `expired`). A super-admin uses `/admin/queries`, not this route.

### `GET /queries/:queryId` — Signed in

Access rule:

- the student who owns the query can view it;
- the teacher who owns the class can view it;
- a super-admin can view any query;
- anyone else gets **403**.

Returns the query plus the last 30 audit entries for that query. Invalid or missing id → **404**.

### `GET /queries/:queryId/audit` — Signed in

Same access rule, last 50 audit entries. This is the query-specific trail: created, approved/rejected, reopened, expired.

### `POST /queries/:queryId/decision` — Staff

Body:

```json
{ "decision": "approved" | "rejected", "note": "..." }
```

A teacher can decide only a query they own; a super-admin can decide any. Rules:

| Case | Status |
| --- | --- |
| No permission | 403 |
| Decision not approved/rejected | 400 |
| Already approved/rejected | 409 |
| Pending or expired | Allowed (an expired query can still be decided) |

Approval:

- sets the query to `approved`, records the decider/email/time/note;
- loads the attendance row by `query.attendance`, falls back to `(session, studentEmail)`, creates an absent row if missing;
- sets the row to `present`, `source: "query"`, `markedBy`, `markedByEmail`, `markedAt`, `decisionNote`, `query`;
- audits `query.approved` with the note, whether it was expired, and the student's original reason;
- notifies the student.

Rejection:

- sets the query to `rejected`;
- sets the row's `decisionNote` and `query`;
- if the row was `present` with `source: "query"` (i.e. an earlier approval), it reverts to `absent`/`pending`;
- audits `query.rejected`;
- notifies the student.

Returns `{ success, query, attendance: { id, status, source } }`.

### `POST /queries/:queryId/reopen` — Staff

Body `{ "note": "..." }`. A teacher can reopen only their own query; a super-admin any. If the query is already pending, **409**. Reopening sets:

- `status: "pending"`;
- `reopenedAt`, `reopenedBy`, `reopenCount + 1`;
- `expiresAt = now + queryWindowHours` (a fresh window);
- clears `decidedAt`, `decidedBy`, `decidedByEmail`, `decisionNote`;
- stores the reopen note in `decisionNote`.

It audits `query.reopened` with the previous status, note and new expiry, and notifies the student. It does **not** change the attendance row. A later decision will.

## 48. Notification and timetable routes

### Notifications (`routes/notificationRoute.js`)

All require a signed-in session and are scoped to `req.user._id`.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/notifications` | query `limit` (1–100, default 40), `unread=true` | `{ success, unread, notifications }` |
| POST | `/notifications/read-all` | — | `{ success, updated }` |
| POST | `/notifications/:notificationId/read` | — | `{ success, notification }` |
| DELETE | `/notifications/read` | — | `{ success, deleted }` |

A notification belongs to exactly one user. `markRead` uses `findOneAndUpdate({ _id, user: req.user._id })`; a notification that exists but belongs to someone else is **404**, not 403. `clearRead` deletes only rows with a non-null `readAt`. Notifications are best-effort: `createNotification` catches failures and logs them, so a notification failure never fails the primary action.

### Timetable (`routes/timetableRoute.js`)

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/timetable` | Signed in | Read visible slots |
| POST | `/timetable/pdf/preview` | Staff, rate limited | Extract text layer only; no row parsing |
| POST | `/timetable` | Staff | Create a slot |
| PATCH | `/timetable/:entryId` | Staff | Edit a slot |
| DELETE | `/timetable/:entryId` | Staff | Delete a slot |

`GET /timetable` filters by role:

- student → classes where the student has an active enrollment;
- teacher → entries where `teacher = req.user._id`;
- super-admin → all entries.

Optional `classId` narrows further. Only `active: { $ne: false }` entries are returned. The response includes `term`, the `DAYS` array and entries with class/room/teacher views. A student never sees another class's slots.

`POST /timetable` body:

```json
{
  "classId": "<id>",
  "dayOfWeek": 1,
  "startTime": "09:30",
  "endTime": "10:50",
  "roomId": "<optional room id>",
  "term": "Even Semester 2026",
  "active": true
}
```

`parseEntry` enforces:

- class id valid and class exists;
- teacher owns the class, or caller is a super-admin;
- `dayOfWeek` integer 0–6;
- `startTime`/`endTime` match `^([01]\d|2[0-3]):[0-5]\d$`;
- `startTime < endTime` (string comparison works for zero-padded 24-hour times);
- room id valid if provided, else the class default room;
- term truncated to 80 characters, defaulting to the settings term name.

The model also has a pre-validate hook that rejects an end time not after the start time, so the rule is enforced twice. A slot is created with `teacher = courseClass.teacher`, so reassigning a class later does not silently move old slots. Audit `timetable.created`.

`PATCH /timetable/:entryId` merges the body with the existing values, re-runs the same validation, and audits `timetable.updated`. Only the owning teacher or a super-admin can edit. `DELETE` removes the slot and audits `timetable.deleted`. Deleting a slot never touches attendance.

`POST /timetable/pdf/preview` is **preview-only**. It requires staff, one PDF field `file`, max 10 MB, max 20 pages, max 200,000 characters, 20 requests per 10 minutes. It returns `{ success, extraction: { text, pageCount, extractedPages, lineCount, charCount, hasText, fileName } }`. It does **not** parse rows, match classes, create slots or create classes. A PDF with no text layer returns **422** `pdf_no_text_layer` with a message that local OCR is not built.

## 49. Export routes

All export routes require **Staff** and share a 30-per-10-minute limiter keyed by user id. Each successful download writes an audit entry. The file is generated on the server from the same records as the on-screen views, not from client state.

| Method | Path | Access | Output |
| --- | --- | --- | --- |
| GET | `/exports/attendance.pdf` | Staff | Class register PDF |
| GET | `/exports/attendance.xlsx` | Staff | Class register workbook |
| GET | `/exports/queries.pdf` | Staff | Query evidence PDF |
| GET | `/exports/queries.xlsx` | Staff | Query workbook |
| GET | `/exports/sessions/:sessionId.pdf` | Staff | One session sheet PDF |
| GET | `/exports/sessions/:sessionId.xlsx` | Staff | One session sheet workbook |
| GET | `/admin/export/users.xlsx` | Super-admin | User directory workbook |
| GET | `/admin/export/audit.xlsx` | Super-admin | Audit log workbook |

The class exports accept a `classId` (and optional term/date filters). The session exports accept a session id. The admin exports are mounted under `/admin` and use the admin limiter; the route is still guarded by the super-admin router.

Responses are binary with:

- `Content-Type: application/pdf` or the Excel MIME type;
- `Content-Disposition: attachment; filename="..."`;
- `Cache-Control: no-store`.

A failure before the first byte uses the JSON error envelope. A failure after streaming begins cannot change the status code; the client sees a truncated file. The controllers therefore build the document in memory or write to the response only after validation. The exact generation logic is in chapter 65.

Scope rules:

- a teacher can export only classes they own;
- a super-admin can export any class/session;
- the user directory and audit workbook are super-admin only;
- every export is audited with its format and filters, so "who took data out" is recorded.

## 50. Super-admin routes

These routes live in `routes/adminRoute.js`. All except `stop-impersonation` pass through `isAuthenticated` and `authorizeSuperAdmin`.

### Passkeys

| Method | Path | Guard | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/webauthn/status` | Super-admin | Passkey summary and step-up state |
| POST | `/admin/webauthn/register/options` | Super-admin, 20/10 min | Start registration |
| POST | `/admin/webauthn/register/verify` | Super-admin, 20/10 min | Verify and store |
| POST | `/admin/webauthn/step-up/options` | Super-admin, 20/10 min | Start assertion |
| POST | `/admin/webauthn/step-up/verify` | Super-admin, 20/10 min | Verify assertion, set cookie |

`status` returns `{ enrolled, count, passkeys, stepUp, stepUpExpiresIn: 300 }`. Registration and step-up are described in chapter 36.

### Overview, users and classes

| Method | Path | Guard | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/overview` | Super-admin | Counts, recent audit, production/demo flags |
| GET | `/admin/users` | Super-admin | Search/filter users |
| POST | `/admin/users` | Super-admin | Create a student or teacher |
| PATCH | `/admin/users/:userId` | Super-admin, step-up for role/status | Update account |
| POST | `/admin/users/:userId/revoke-sessions` | Super-admin + step-up | Bump `tokenVersion` |
| GET | `/admin/classes` | Super-admin | Every class with teacher |
| POST | `/admin/classes` | Super-admin | Create a class and assign a teacher |
| PATCH | `/admin/classes/:classId` | Super-admin | Reassign/update a class |

`GET /admin/overview` runs `expireStaleQueries()` and returns counts for users, teachers, students, super-admins, classes, sessions, pending queries, finalised sessions, demo users, attendance by status, attendance percentage, `production`, `demoEnabled`, and the last 8 audit entries.

`GET /admin/users` filters by `role`, `status`, `demo=true|false`, and `q` (case-insensitive regex on name/email/roll). Limit 100 default / 500 max. The user view includes `deviceApproved` and `lastSeenAt`.

`POST /admin/users` accepts `name`, `email`, `role` (student/teacher only), `isDemo`, `demoLabel`, `phoneLabel`, `rollNumber`. Super-admin is an environment grant, never created here. A demo account cannot be created in production (**403**). Duplicate email → **409**.

`PATCH /admin/users/:userId` accepts `name`, `status`, `phoneLabel`, `demoLabel`, `rollNumber`, `role`. It refuses to change a super-admin's role or disable a super-admin from the UI, and refuses to let a super-admin demote or disable **themselves**. A status or role change increments `tokenVersion`. Audit `admin.user.updated` includes `before`, `after` and `sessionsRevoked`.

`POST /admin/users/:userId/revoke-sessions` increments the target's `tokenVersion` and audits `admin.user.sessions_revoked`. It is the incident-response lever for a compromised account.

`POST /admin/classes` requires a valid teacher (active, role teacher) and room. `PATCH /admin/classes/:classId` can change title, section, teacher and room. Both audit.

### Sessions and attendance

| Method | Path | Guard | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/sessions` | Super-admin | Sessions across all teachers |
| GET | `/admin/sessions/:sessionId/attendance` | Super-admin | Any session register |
| PATCH | `/admin/attendance/:recordId` | Super-admin + step-up | Override a row |
| DELETE | `/admin/attendance/:recordId` | Super-admin + step-up | Delete a row |

`GET /admin/sessions` filters by `classId`, `teacherId`, `status`, limit 200, and includes attendance/query summaries. `GET /admin/sessions/:sessionId/attendance` returns the same register shape as the teacher route.

`PATCH /admin/attendance/:recordId` body includes `status` and a required `note`. The override sets `source: "admin"`, `markedBy`, `markedByEmail`, `markedAt`, `decisionNote` and audits `attendance.override` with the before/after status and the note. A missing note is **400**; an invalid id or row is **404**; an invalid status is **400**.

`DELETE /admin/attendance/:recordId` requires `{ "confirm": "DELETE", "note": "..." }`. Without the literal confirm string it returns **400**. It deletes the row and audits `attendance.deleted` with the deleted row snapshot. It does not delete the session or the proofs.

### Queries, audit and settings

| Method | Path | Guard | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/queries` | Super-admin | All queries |
| GET | `/admin/audit` | Super-admin | Filterable audit log |
| GET | `/admin/audit/verify` | Super-admin | Recompute the chain |
| GET | `/admin/settings` | Super-admin | Read settings |
| PATCH | `/admin/settings` | Super-admin + step-up | Update settings |
| POST | `/admin/impersonate/:userId` | Super-admin + step-up | Start impersonation |
| POST | `/admin/stop-impersonation` | Signed in via `admin_token` | End impersonation |

`GET /admin/queries` is `queryController.listAll`: filters by `status`, `teacherId`, `classId`, limit 500. It returns the same query view as the teacher route.

`GET /admin/audit` filters by `action`, `entityType`, `actor`, `from`, `to`, `seq` and a text search. It returns `toAuditView` rows with `seq`, `hash` and `prevHash`. Limit 100 default / 200 max. The `verify` route returns `{ ok, checked, reason, brokenSeq, brokenHash, expectedHash, firstSeq, lastSeq, lastHash, legacy }`.

`GET /admin/settings` returns the settings view: term name, term start/end, query window hours, geofence radius, require-query-location, allow-student-queries, demo mode, and the defaults. `PATCH` accepts a subset, validates ranges, saves, and audits `admin.settings.updated` with before/after.

`POST /admin/impersonate/:userId` and `POST /admin/stop-impersonation` are described in chapter 34.

### Demo data

| Method | Path | Guard | Purpose |
| --- | --- | --- | --- |
| GET | `/admin/demo/status` | Super-admin, non-production | Demo record counts |
| POST | `/admin/demo/seed` | Super-admin, non-production | Create demo data |
| POST | `/admin/demo/reset` | Super-admin + step-up, non-production | Remove demo data |

`requireDemoMode` returns **404** in production and **403** if `settings.demoModeEnabled` is false. The status route counts demo users/classes/sessions/queries/records. Seeding creates a demo teacher `teacher@demo.invalid`, eight students, a room `DEMO-101`, a class, sessions and queries, with `isDemo: true` throughout. Reset removes demo data while preserving the signed-in admin, and audits `admin.demo.reset`. The exact seed is in chapter 68.

## 51. A complete route index

This is the compact index. The access column uses the labels from chapter 40.

### Frontend pages

| Path | Access |
| --- | --- |
| `/` | Public |
| `/login` | Public |
| `/student-dashboard` | Student |
| `/student/check-in` | Student |
| `/teacher-dashboard` | Teacher |
| `/teacher/classes` | Teacher |
| `/teacher/check-in` | Teacher |
| `/teacher/sessions` | Staff |
| `/attendance` | Signed in |
| `/queries` | Signed in |
| `/exports` | Staff |
| `/admin` | Super-admin |
| `/notifications` | Signed in |
| `/profile` | Signed in |
| `/timetable` | Signed in |
| `/help` | Signed in |
| `/acoustic-lab` | Public |
| `/acoustic-tx` | Public |
| `/acoustic-rx` | Public |
| `*` | Public |

### API — health, auth and profile

| Method | Path | Access |
| --- | --- | --- |
| GET | `/health` | Public |
| GET | `/health/ready` | Public |
| GET | `/islogin` | Public (401 without session) |
| POST | `/logout` | Public |
| GET | `/logout` | Public (405) |
| POST | `/auth/google` | Public |
| GET | `/profile` | Signed in |
| PATCH | `/profile` | Signed in |
| POST | `/profile/sessions/revoke` | Signed in |
| GET | `/auth/dev/accounts` | Dev-only |
| POST | `/auth/dev/login` | Dev-only |

### API — device binding

| Method | Path | Access |
| --- | --- | --- |
| POST | `/device-bindings/claim` | Signed in |
| GET | `/device-bindings/status` | Signed in |
| GET | `/device-reviews` | Teacher |
| POST | `/device-reviews/:reviewId` | Teacher |

### API — rooms, classes and rosters

| Method | Path | Access |
| --- | --- | --- |
| GET | `/rooms` | Staff |
| POST | `/rooms` | Staff |
| GET | `/classes` | Teacher |
| POST | `/classes` | Teacher |
| POST | `/classes/:classId/roster/preview` | Teacher |
| POST | `/classes/:classId/roster/pdf/preview` | Teacher |
| PUT | `/classes/:classId/roster` | Teacher |
| GET | `/classes/:classId/roster` | Teacher |

### API — check-in sessions and evidence

| Method | Path | Access |
| --- | --- | --- |
| GET | `/classes/:classId/check-in-sessions` | Teacher |
| POST | `/classes/:classId/check-in-sessions` | Teacher |
| GET | `/classes/:classId/check-in-sessions/active` | Student |
| GET | `/student/check-in-sessions/active` | Student |
| POST | `/check-in-sessions/:sessionId/proofs` | Student |
| GET | `/check-in-sessions/:sessionId/proofs` | Teacher |
| GET | `/check-in-sessions/:sessionId/queries` | Teacher |
| GET | `/check-in-sessions/:sessionId` | Teacher |
| POST | `/check-in-sessions/:sessionId/advance` | Teacher |
| POST | `/check-in-sessions/:sessionId/close` | Teacher |
| POST | `/check-in-sessions/:sessionId/location` | Student |

### API — attendance, analytics and audit

| Method | Path | Access |
| --- | --- | --- |
| GET | `/check-in-sessions/:sessionId/attendance` | Teacher |
| PATCH | `/check-in-sessions/:sessionId/attendance` | Teacher |
| POST | `/check-in-sessions/:sessionId/attendance/finalize` | Teacher |
| GET | `/attendance/me` | Student |
| GET | `/attendance/me/sessions` | Student |
| GET | `/attendance/sessions` | Staff |
| GET | `/attendance/classes/:classId/overview` | Staff |
| GET | `/attendance/classes/:classId/students/:studentId` | Staff |
| GET | `/audit/me` | Teacher |

### API — queries

| Method | Path | Access |
| --- | --- | --- |
| POST | `/queries` | Student |
| GET | `/queries/mine` | Student |
| GET | `/queries/review` | Teacher |
| GET | `/queries/:queryId` | Signed in |
| GET | `/queries/:queryId/audit` | Signed in |
| POST | `/queries/:queryId/decision` | Staff |
| POST | `/queries/:queryId/reopen` | Staff |

### API — notifications and timetable

| Method | Path | Access |
| --- | --- | --- |
| GET | `/notifications` | Signed in |
| POST | `/notifications/read-all` | Signed in |
| POST | `/notifications/:notificationId/read` | Signed in |
| DELETE | `/notifications/read` | Signed in |
| GET | `/timetable` | Signed in |
| POST | `/timetable/pdf/preview` | Staff |
| POST | `/timetable` | Staff |
| PATCH | `/timetable/:entryId` | Staff |
| DELETE | `/timetable/:entryId` | Staff |

### API — exports

| Method | Path | Access |
| --- | --- | --- |
| GET | `/exports/attendance.pdf` | Staff |
| GET | `/exports/attendance.xlsx` | Staff |
| GET | `/exports/queries.pdf` | Staff |
| GET | `/exports/queries.xlsx` | Staff |
| GET | `/exports/sessions/:sessionId.pdf` | Staff |
| GET | `/exports/sessions/:sessionId.xlsx` | Staff |
| GET | `/admin/export/users.xlsx` | Super-admin |
| GET | `/admin/export/audit.xlsx` | Super-admin |

### API — super-admin

| Method | Path | Access |
| --- | --- | --- |
| POST | `/admin/stop-impersonation` | Signed in via `admin_token` |
| GET | `/admin/webauthn/status` | Super-admin |
| POST | `/admin/webauthn/register/options` | Super-admin |
| POST | `/admin/webauthn/register/verify` | Super-admin |
| POST | `/admin/webauthn/step-up/options` | Super-admin |
| POST | `/admin/webauthn/step-up/verify` | Super-admin |
| GET | `/admin/overview` | Super-admin |
| GET | `/admin/users` | Super-admin |
| POST | `/admin/users` | Super-admin |
| PATCH | `/admin/users/:userId` | Super-admin (+ step-up for role/status) |
| POST | `/admin/users/:userId/revoke-sessions` | Super-admin + step-up |
| GET | `/admin/classes` | Super-admin |
| POST | `/admin/classes` | Super-admin |
| PATCH | `/admin/classes/:classId` | Super-admin |
| GET | `/admin/sessions` | Super-admin |
| GET | `/admin/sessions/:sessionId/attendance` | Super-admin |
| PATCH | `/admin/attendance/:recordId` | Super-admin + step-up |
| DELETE | `/admin/attendance/:recordId` | Super-admin + step-up |
| GET | `/admin/queries` | Super-admin |
| GET | `/admin/audit` | Super-admin |
| GET | `/admin/audit/verify` | Super-admin |
| GET | `/admin/settings` | Super-admin |
| PATCH | `/admin/settings` | Super-admin + step-up |
| POST | `/admin/impersonate/:userId` | Super-admin + step-up |
| GET | `/admin/demo/status` | Super-admin, non-production |
| POST | `/admin/demo/seed` | Super-admin, non-production |
| POST | `/admin/demo/reset` | Super-admin + step-up, non-production |

With the map complete, Part VII follows a single action through the code: a teacher starts a session, a phone submits proof, the teacher decides the register, and every downstream view is derived from that decision.
# Part VII — Backend flows in detail

This part follows the code path behind each route. It is written as a sequence of decisions: what the server checks first, what it writes, what it returns, and what can fail in between. The routes are the contract; these chapters are the machinery.

## 52. Starting a check-in session

### In plain words

A check-in starts when a teacher taps **Start check-in** for one of their classes. The server creates a session document, mints a random seven-symbol key, gives that key a two-minute life, copies the active roster into one attendance row per student, and notifies the enrolled students. The teacher's screen then shows the key and a transmitter link.

### Preconditions

`POST /classes/:classId/check-in-sessions` runs `getOwnedClass`:

- the class id must be a valid Mongo ObjectId;
- the class must exist;
- for a teacher, `teacher` must equal `req.user._id`.

A missing or unowned class becomes **404** `"Class not found"`, not 403. This avoids confirming that a class exists but belongs to someone else.

Two further checks:

1. The class must have a `defaultRoom`. If not, **409** `"This class has no default room. Set a room before starting a check-in."` A check-in needs a room snapshot.
2. There must be no existing `status: "active"` session for the class. If there is, **409** via `activeSessionConflict`. The real guard is the partial unique index:

```js
checkInSessionSchema.index(
  { courseClass: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
```

Two rapid taps can both pass the read check; one insert wins, the loser sees MongoDB error `11000` and is translated into the same friendly 409. Closed sessions remain in the collection as history, so the partial filter is what allows a class to have many closed sessions and at most one active one.

### Minting the first key

`buildInitialSession()` returns:

```js
{
  status: "active",
  wave: 0,
  key: <random integer 0..170,859,374>,
  keyIssuedAt: startedAt,
  keyExpiresAt: startedAt + 120,000 ms,
  startedAt,
  closedAt: null
}
```

The key is drawn with `crypto.randomInt(KEY_SPACE)`, where `KEY_SPACE = 15^7 = 170,859,375`. That is the same code space as the FSK frame: 7 data symbols, each one of 15 tones. No mapping step is needed before transmission.

`mintKey` validates the generator's output. If a custom generator (used in tests) returns a non-integer or an out-of-range value, it throws instead of storing a key the codec cannot transmit.

The initial key is **not** checked against a previous key, because there is no previous key. On advance, `mintDistinctKey` retries up to five times if the new key equals the old one, then throws. The probability of a collision is 1 in 170,859,375; the check is about making the invariant explicit, not about a realistic failure.

### Room and class snapshots

The session stores:

- `courseClass`: a live reference for navigation;
- `teacher`: a live reference;
- `room`: a live reference;
- `classSnapshot`: `{ courseCode, title, section, roomNo }`;
- `teacherLocation`: the normalised location from the request, if any;
- `rosterCount`: filled after the roster snapshot.

The snapshot is what later exports and attendance rows display. If the class is renamed or the room number changes, the old session still shows where it happened. The references remain for notifications and admin navigation.

The room lookup is guarded by `isDbReady()`: if the database is not ready, the code uses the populated default room's `roomNo` rather than issuing a query that would fail. The session creation itself still needs the database; the guard is for a degraded path used by tests.

### The roster snapshot

`snapshotRosterAttendance` is the most important side effect:

1. Find all `Enrollment` rows for the class with `status: "active"`.
2. If there are none, set `rosterCount: 0` and return. A check-in can start for an empty class, but there will be no rows to mark.
3. Collect the lowercased emails and find matching `User` documents.
4. For each enrollment that now has a user, set `Enrollment.student = user._id`. The email remains the roster key; the link is only for notifications and cheap student views.
5. Build one `AttendanceRecord` per enrollment with:
   - `session`, `courseClass`, `teacher`;
   - `student` (or null if the student has not signed in yet);
   - `studentEmail`, `studentName`, `rollNumber`;
   - `classSnapshot`;
   - `status: "pending"`, `source: "pending"`;
   - `teacherLocation`;
   - `evidence: { proofCount: 0, waves: [] }`;
   - `isDemo`;
   - `createdAt`.
6. Use `bulkWrite` with `upsert: true` and `$setOnInsert`, so a retried start cannot duplicate rows.
7. Count the rows, update the session's `rosterCount` and `classSnapshot`.

The snapshot is **idempotent** because of the unique index `(session, studentEmail)` and `$setOnInsert`. A second call only fills missing rows; it does not reset statuses.

Why snapshot at all? Attendance is a historical record. If a student is removed from the roster later, the old session must still show that they were expected. If a student is added later, they were not part of that session. The snapshot freezes the expected set at the moment the teacher started.

### Notifications

After the snapshot, the controller queries `Enrollment` rows with a non-null `student` and creates a `session.started` notification for each. The link is `/student/check-in`, the title is "Check-in started", and the message includes the course code and section.

Notifications are best-effort. `createNotifications` catches failures and logs them; a notification failure does not roll back the session. A student who misses the notification can still discover the session through the active-session endpoint.

### Audit

`session.created` records:

- the class code;
- whether a teacher location was captured;
- the roster count.

The audit is written after the session and roster exist. If the audit fails, the session still exists and the failure is logged; the teacher sees a successful start. This is the deliberate audit failure policy described in chapter 37.

### What the response contains

```json
{
  "success": true,
  "session": {
    "id": "...",
    "class": { "id": "...", "courseCode": "CS301", "title": "...", "section": "A" },
    "classSnapshot": { "courseCode": "...", "title": "...", "section": "...", "roomNo": "..." },
    "room": { "id": "...", "roomNo": "..." },
    "status": "active",
    "wave": 0,
    "key": 123456789,
    "keyIssuedAt": "...",
    "keyExpiresAt": "...",
    "keyExpired": false,
    "waveHistory": [],
    "teacherLocation": { "...": "..." },
    "startedAt": "...",
    "rosterCount": 40,
    "attendanceFinalized": false,
    "attendanceSummary": { "total": 40, "present": 0, "absent": 0, "pending": 40, "percentage": null }
  }
}
```

The key is present because the caller owns the class and must play it. A student response uses `toStudentSession`, which omits the key.

### What can go wrong

- **No default room** → 409 before any write.
- **Already active** → 409, including the concurrent-tap race.
- **Database not ready** → the create fails; the error middleware returns 500. Readiness should have prevented traffic.
- **Roster snapshot fails after session create** → the session exists but the error is surfaced. The teacher can retry; the snapshot is idempotent.
- **No enrollments** → a session with zero rows starts. This is allowed but the register will be empty; the UI should warn.
- **Room deleted between class read and session write** → the session stores the id; the populated view may show a missing room. The snapshot still has the room number.
- **Key generator failure** → 500 before the session is created; no partial state.

## 53. Student discovery of live sessions

### In plain words

A student's phone asks "is there a check-in I can join?" The server looks only at classes where the student has an active enrollment, returns live sessions without any key, and says "none" as a normal answer.

### Two discovery routes

**Class-scoped:** `GET /classes/:classId/check-in-sessions/active`.

1. Validate the class id; invalid → **404**.
2. Find the class; missing → **404**.
3. `Enrollment.exists({ class, email, status: "active" })`; false → **403** `"You are not on this class roster"`.
4. Find the newest active session for the class, populate class/room/teacher.
5. Return `{ success: true, session: toStudentSession(session) }` or `session: null`.

**Global:** `GET /student/check-in-sessions/active`.

1. `Enrollment.distinct("class", { email, status: "active" })`.
2. Filter invalid ids (defensive).
3. If none, return `{ success: true, sessions: [] }`.
4. Find active sessions whose `courseClass` is in that list, newest first, limit 20.
5. Map each through `toStudentSession`.

### The student view

`toStudentSession` returns:

```js
{
  id, class, classSnapshot, room, status, wave,
  keyIssuedAt, keyExpiresAt, keyExpired,
  startedAt, closedAt, rosterCount,
  attendanceFinalized, attendanceFinalizedAt,
  queryWindowEndsAt, isDemo
}
```

It deliberately omits:

- `key` — the student must hear it;
- `keyHistory` — the history is teacher-only;
- `teacherLocation` — the teacher's location is shown to the teacher and used for query distance, not broadcast to students.

`keyExpired` is computed by `keyIsFresh(session, now)`: the session must be active, the key must be a valid integer, `keyExpiresAt` must parse, and `now < keyExpiresAt`.

### Why "no active session" is not a 404

A student waiting before class is in a normal state, not an error. Returning 200 with `session: null` lets the UI show "Waiting for your teacher to start" without treating it as a failure. A 404 would be indistinguishable from a wrong class id, and the client would have to parse prose.

### What the student does with the answer

The student check-in page uses the response to:

- show the class and wave;
- decide whether the key is still fresh;
- start microphone capture;
- poll every 10 seconds (the frontend constant `DISCOVERY_INTERVAL_MS`);
- stop showing the session when it closes.

The student never receives the key through this route. The only way to learn the current key is to decode the acoustic signal.

### What can go wrong

- **Student removed from the roster** → `distinct` no longer includes the class; the session disappears on the next poll.
- **Teacher reassigns the class** → the session's `teacher` is unchanged, but the student's enrollment still controls discovery.
- **Two live sessions across two classes** → both are returned, newest first. The UI selects one, usually the first or the one the student tapped.
- **More than 20 live sessions** → only the newest 20 are returned. A student is unlikely to have more than a handful of enrollments; the limit is defensive.
- **Expired key but active session** → the session is still returned with `keyExpired: true`. The UI should tell the student to wait for the next wave, not to treat the session as gone.

## 54. The proof submission path

This is the core evidence flow. The route is `POST /check-in-sessions/:sessionId/proofs`, handled by `checkInProofController.submitProof`.

### Step 1 — Validate the body

`validateProofPayload` requires:

- a plain object body;
- `wave` an integer from 0 to 1,000,000;
- `key` an integer from 0 to 170,859,374;
- `signature` a canonical 64-byte P-256 ECDSA signature in base64.

The signature regex is:

```text
^[A-Za-z0-9+/]{86}==$
```

Why 86 characters plus `==`? A P-256 signature is 64 raw bytes. Base64 encodes 3 bytes into 4 characters. 64 bytes = 21 groups of 3 (63 bytes) plus 1 byte. The last group is 2 characters plus `==`, so the total is `21*4 + 4 = 88` characters: 86 base64 characters followed by `==`. The regex is an exact shape check; the decoder also checks the byte length is 64 and that re-encoding produces the same string, which rejects non-canonical encodings.

A bad body returns **400** with a specific message. It does not create a proof.

The optional `location` is normalised separately. A malformed location is ignored rather than failing the proof; location is supplementary evidence. The default source is `"browser"`.

### Step 2 — Load the session

The session id must be a valid ObjectId, else **404**. The query selects only:

```text
courseClass status wave key keyExpiresAt
```

It does not load the roster, history or class snapshot. The proof path needs only the current wave state.

### Step 3 — Check enrollment

```js
const studentEmail = String(req.user.email || "").trim().toLowerCase();
const enrolled = await Enrollment.exists({
  class: session.courseClass,
  email: studentEmail,
  status: "active",
});
if (!enrolled) return 403 "You are not on this class roster";
```

This is a live check, not the snapshot. A student removed from the roster after the session started cannot submit new proof, even though their attendance row still exists. That is a deliberate choice: the roster is the authority for who may participate.

### Step 4 — Check the device binding

The user document must have:

- `deviceBinding.approvedAt`;
- `deviceBinding.fingerprint`;
- `deviceBinding.publicKeyJwk`.

If any is missing, **403** `"This browser is not approved for attendance. Sign in again or ask your teacher to approve it."`

Then:

```js
const pendingChange = await DeviceBindingRequest.exists({
  student: req.user._id,
  status: "pending",
});
if (pendingChange) return 403 "A device change is awaiting teacher review...";
```

A pending change freezes proof submission from the old device. Without this, a student could keep two devices live while a change is reviewed. The old key is still in the user document, but the request is blocked.

### Step 5 — Rebuild the signed message

The server never trusts a client-supplied message. It rebuilds:

```text
bioattend-proof:v1|session=<sessionId>|wave=<wave>|key=<key>|student=<studentId>
```

`buildProofMessage` validates:

- `sessionId` matches `^[A-Za-z0-9_-]{1,128}$`;
- `studentId` matches the same;
- `wave` is an integer from 0 to 1,000,000;
- `key` is an integer from 0 to 170,859,374.

If any check fails, the controller returns **400** `"The proof could not be verified."` The message is intentionally generic; the caller already sent a malformed body.

The version prefix matters. A future protocol change can introduce `bioattend-proof:v2` without old signatures being accepted under the new rules. The server stores `protocolVersion` on the proof.

### Step 6 — Verify the signature

`verifyProofSignature`:

1. Decodes the base64 signature with the canonical check.
2. Sanitises the public key JWK (EC, P-256, 43-character x/y, no `d`).
3. Creates a public key with `crypto.createPublicKey({ key, format: "jwk" })`.
4. Calls `crypto.verify("sha256", Buffer.from(message, "utf8"), { key, dsaEncoding: "ieee-p1363" }, signatureBytes)`.
5. Returns `false` on any crypto error.

The `dsaEncoding: "ieee-p1363"` option is essential. Node's default ECDSA signature format is DER, which is variable-length. Web Crypto produces the raw 64-byte `r || s` format, which is IEEE P1363. Without this option, a valid browser signature would be rejected (or a DER signature might be misinterpreted).

A failed verification returns **403** `"The proof signature is invalid for this device."` This does not reveal whether the key was right; it only says the signature did not verify.

### Step 7 — Look for an existing proof

```js
const existing = await CheckInProof.findOne({
  session: session._id,
  student: req.user._id,
  wave,
});
```

The unique index `(session, student, wave)` guarantees at most one. The read is for a friendly response and to distinguish a duplicate from a conflict.

### Step 8 — Evaluate the proof

`evaluateProof({ session, proof, wave, key })` is a pure function with a deliberate order:

1. **Session missing** → 404.
2. **Existing proof with the same wave and key** → duplicate, 200. This is checked **before** session status, so a retry after the session closed or the key expired still succeeds. The evidence was accepted the first time; the client should not see a failure.
3. **Existing proof with a different key** → 409 `"A different proof is already recorded for this wave."`
4. **Session not active** → 409 `"This check-in session is closed."`
5. **Wave not current** → 409 `"This wave is no longer current."`
6. **Key not fresh** → 409 `"The current wave key has expired."`
7. **Key mismatch** → 400 `"The decoded key does not match the current wave."`
8. Otherwise → accept, 201.

The order of freshness before key equality is a security decision. If key equality were checked first, an attacker could distinguish a correct guess (409 "key expired") from an incorrect guess (400 "wrong key") after expiry, learning the key by trial. Checking freshness first means both wrong and right keys get the same 409 after expiry.

The existing-proof check before status also means a duplicate is idempotent across a close. That is important for mobile clients that retry on a timeout.

### Step 9 — Create the proof

The document stores:

- `session`, `courseClass`;
- `student`, `studentEmail`;
- `deviceFingerprint` — the fingerprint at submission time;
- `wave`, `key`;
- `signature`;
- `protocolVersion: "bioattend-proof:v1"`;
- optional `location`;
- timestamps.

It deliberately has **no attendance, score or status field**. The model is evidence, not a decision.

The create is wrapped in a try/catch for error `11000`. Two retries can pass the read above at the same time; the unique index is the real guard. If the raced document has the same key, return the duplicate success. If it has a different key, return 409. If no raced document is found, rethrow.

### Step 10 — Update the attendance evidence counter

After the proof exists:

```js
AttendanceRecord.findOneAndUpdate(
  { session: session._id, studentEmail },
  {
    $set: { student: req.user._id, ...(attemptLocation ? { attemptLocation } : {}) },
    $inc: { "evidence.proofCount": 1 },
    $addToSet: { "evidence.waves": wave },
    $min: { "evidence.firstProofAt": proof.createdAt },
    $max: { "evidence.lastProofAt": proof.createdAt },
  },
  { upsert: false }
)
```

`upsert: false` is deliberate: the attendance row should already exist from the roster snapshot. If it does not (for example, the student was added to the roster after the session started), the proof is still stored, but the counter update silently does nothing. The proof is the audit record; the counter is a convenience.

The update is followed by `.catch(...)`, which logs `[attendance] proof counter update failed` and continues. A counter failure must not fail the proof. The aggregate can drift; the proof document remains the source of truth until it expires.

### Step 11 — Log and respond

The server logs one JSON line:

```json
{ "event": "check_in_proof", "sessionId": "...", "studentId": "...", "wave": 0, "outcome": "accept" }
```

It does not log the email, fingerprint, key or signature. The response is:

```json
{
  "success": true,
  "recorded": true,
  "duplicate": false,
  "attendanceDecided": false,
  "proof": { "id": "...", "sessionId": "...", "wave": 0, "recordedAt": "...", "duplicate": false }
}
```

`attendanceDecided: false` is the contract. The student's phone must not show "Present"; it shows "Evidence recorded". The teacher decides later.

### What can go wrong

- **Clock skew** — the key expiry is server time. A phone with a wrong clock still submits to the server, which compares its own time. The phone's local display may be misleading.
- **Expired key during a slow decode** — the decode may finish after the two-minute window. The server rejects with 409. The teacher advances to a new wave and the student retries.
- **Wave advanced between decode and submit** — the server rejects with 409 "wave is no longer current". This is expected; the phone should re-listen.
- **Roster removed after snapshot** — enrollment check fails, proof rejected. The attendance row still exists for history.
- **Attendance counter missing** — proof is stored but the register's `evidence.proofCount` does not increment. The teacher's proof list still shows the proof.
- **Duplicate after close** — returns 200 duplicate, not 409. This is intentional idempotency.
- **Two proofs with different keys for the same wave** — the second returns 409. Evidence is never overwritten.
- **Signature valid but from a different device** — the stored public key does not match the signer, so verification fails 403. The fingerprint is not used for verification; the public key is.

## 55. Advancing a wave

### In plain words

A teacher advances only after at least one phone has submitted evidence for the current wave. The old key is archived, a new key is minted, and the new key gets a fresh two-minute life.

### The evidence gate

```js
const evidence = await CheckInProof.exists({
  session: session._id,
  wave: session.wave,
});
if (!evidence) return 409 "No phone has recorded evidence for this wave yet...";
```

This prevents a teacher from tapping Advance repeatedly to skip waves. A wave number means "a key was actually transmitted and at least one phone decoded it". If no one heard it, the teacher should replay the current key, not advance.

The gate is a policy, not a security boundary: a teacher could wait for one proof and then advance. The point is to keep the wave sequence tied to real acoustic progress, not to prove everyone heard it.

### The pure state transition

`advanceSessionState(session)` validates:

- `session.status === "active"`;
- `session.wave` is an integer from 0 to 999,999 (it cannot advance past 1,000,000);
- `session.key` is a valid key;
- `keyTtlMs` is positive;
- `maxHistory` is a positive integer.

It mints a distinct next key (or accepts an injected key for tests), builds the previous key entry, appends it to a copy of `keyHistory`, and returns:

```js
{
  wave: oldWave + 1,
  key: newKey,
  keyIssuedAt: now,
  keyExpiresAt: now + 120,000,
  keyHistory: history.slice(-20)
}
```

It does **not** save. The controller does the compare-and-set.

### The compare-and-set update

```js
CheckInSession.findOneAndUpdate(
  {
    _id: session._id,
    teacher: req.user._id,
    status: "active",
    wave: session.wave,
  },
  {
    $set: { wave, key, keyIssuedAt, keyExpiresAt },
    $push: { keyHistory: { $each: [archived], $slice: -MAX_KEY_HISTORY } },
  },
  { new: true, runValidators: true }
)
```

The filter includes the wave the request read. Two concurrent advances can both read wave 0 and both mint a key, but only one update matches wave 0. The loser gets `null`, which becomes **409** `"The session changed before the wave could advance. Refresh and try again."`

This is optimistic concurrency without a transaction. It prevents two keys from being written for the same wave and ensures the history matches the winning transition.

### History bound

`$slice: -20` keeps only the last 20 archived waves. A session is minutes long, so 20 is far more than a real class needs. The bound prevents a session document from growing without limit if a teacher advances hundreds of times.

The teacher view exposes only `wave`, `keyIssuedAt` and `keyExpiresAt` for history. It does not expose old keys. A leaked old key cannot be used for the current wave anyway, but there is no reason to return it.

### Audit and response

`session.advanced` records the from/to wave. The response is the updated session with a fresh attendance summary. The current key is included because the caller is the teacher.

### What can go wrong

- **No proof** → 409, no state change.
- **Session closed** → 409.
- **Concurrent tap** → one wins, one gets 409.
- **Wave at the ceiling** → `advanceSessionState` throws `"session wave cannot advance further"`; the controller returns 409.
- **Key collision after five retries** → the helper throws; the controller returns 409. This is astronomically unlikely.
- **History write fails** → the whole update fails; no partial wave. The `$set` and `$push` are one atomic document update in MongoDB.
- **Teacher's screen stale** → the response contains the new wave; the UI should replace its state, not increment locally.

## 56. Closing a session

### In plain words

Closing stops new proofs and starts the 24-hour query window. It does not finalise attendance; the teacher can still mark rows after closing, and finalisation is a separate action.

### The idempotent close

```js
if (session.status === STATUS_ACTIVE) {
  const closed = closeSessionState(session);
  session.status = closed.status;
  session.closedAt = closed.closedAt;
  session.queryWindowEndsAt = queryWindowEnd(session.closedAt, settings);
  await session.save();
  // notify + audit
}
```

`closeSessionState` returns `{ status: "closed", closedAt: session.closedAt || now }`. A second close keeps the first timestamp. The outer `if` means a second call does not write a second audit entry or send a second round of notifications. The response is still the same closed session with a fresh summary.

Closing is allowed even if the session has no proofs and even if it was never finalised. The teacher may close by mistake; the register still exists and can be marked or deleted by an admin with audit.

### The query window

```text
queryWindowEnd(closedAt, settings) =
  closedAt + (settings.queryWindowHours || 24) * 60 * 60 * 1000
```

The default is 24 hours. The window is stored on the session as `queryWindowEndsAt` so a later settings change does not retroactively shorten or extend an existing window. `createQuery` uses the stored value first, then falls back to computing from `closedAt` with the current settings.

### Notifications

The controller loads attendance records with a non-null `student` and creates a `session.closed` notification:

> "Your class check-in has closed. If you were present but unmarked, you can raise a query for 24 hours."

The message hardcodes "24 hours" even if the configured window is different. This is a small content bug: the actual window is `settings.queryWindowHours`. A future version should interpolate the value. The UI shows the real expiry from the session.

### Audit

`session.closed` records the `queryWindowEndsAt` and whether attendance was already finalised. It does not record the proof count; that is available from the proof endpoint and the attendance summary.

### What closing does not do

- It does not mark pending rows absent.
- It does not finalise the register.
- It does not delete proofs.
- It does not prevent a teacher from marking attendance.
- It does not prevent a query; it starts the query window.
- It does not stop an already-in-flight proof request that was accepted before the close. The proof's `evaluateProof` reads the session status at the time of the request; a request that loaded the session before the close could still create a proof after the close. The window is small (the time between the read and the create), and the write is guarded by the unique index, not by a transaction on session status. This is a known race; it is bounded and audited by the proof's timestamp.

## 57. Marking and finalising attendance

### The register model

Each session has one `AttendanceRecord` per roster student. The record carries:

| Field | Meaning |
| --- | --- |
| `status` | `pending`, `present`, `absent`, `excused` |
| `source` | `pending`, `manual`, `query`, `auto`, `override`, `demo` |
| `markedBy`, `markedByEmail`, `markedAt` | Who decided and when |
| `decisionNote` | The teacher's note |
| `query` | The linked query, if any |
| `evidence.proofCount`, `evidence.waves` | Aggregate proof evidence |
| `attemptLocation`, `teacherLocation` | Location evidence |
| `classSnapshot`, `studentEmail`, `studentName`, `rollNumber` | Historical identity |

The proof documents are separate. The register survives after proofs expire.

### Marking

`PATCH /check-in-sessions/:sessionId/attendance` accepts up to 500 entries. Each entry is matched by `recordId` or `studentEmail`. The controller builds two maps and rejects any entry that is not in the session roster with **404**.

Valid statuses are `pending`, `present`, `absent`, `excused`. Anything else is **400**. The note is truncated to 500 characters.

A `bulkWrite` updates each row:

```js
{
  $set: {
    status,
    source: status === "pending" ? "pending" : "manual",
    markedBy: req.user._id,
    markedByEmail: req.user.email,
    markedAt: now,
    decisionNote: note,
  }
}
```

Why `source: "manual"` even for `absent`? The source records **how** the status was set, not what it means. An auto-absent from finalisation uses `"auto"`; an admin override uses `"override"`; a query approval uses `"query"`. This lets the UI and audit distinguish a teacher's roll-call from an automatic decision.

The audit entry `attendance.marked` includes an array of `{ studentEmail, from, to, note }` for every changed row. It is one audit entry for the batch, not one per student. That keeps the chain compact but means a single entry can describe many changes.

Marking is allowed while the session is live. This supports a manual roll-call when the acoustic path fails. The audit still records it.

### Finalising

`POST /check-in-sessions/:sessionId/attendance/finalize`:

1. Load the owned session. Missing/unowned → **404**.
2. Require `status === "closed"`, else **409** `"Close the check-in session before finalising attendance."`
3. Find pending rows. If any, update them to `absent`, `source: "auto"`, with a note `"Auto-absent when the teacher finalised the session."`
4. Set `attendanceFinalized = true`, `attendanceFinalizedAt = existing || now`, `attendanceFinalizedBy = existing || req.user._id`.
5. Save.
6. Load all records, summarise.
7. Notify every student with a `user` reference.
8. Audit `session.attendance.finalized` with the summary and `autoAbsent` count.
9. Return the full register payload.

The first finalisation timestamp and actor are preserved on a re-finalise. This matters if a teacher finalises, then marks a late row, then finalises again: the history should show the original publication time, not the retry.

The 24-hour query window is tied to **close**, not finalisation. A teacher can close at 10:00 and finalise at 18:00; a student still has until 10:00 the next day to query. Finalising earlier does not shorten the window. This is deliberate: the student should not lose the window because the teacher was slow to publish.

### What finalisation does not do

- It does not delete pending rows; it converts them to absent.
- It does not lock the register. A teacher can still mark a row after finalisation; the audit records it.
- It does not prevent a query. The query window is separate.
- It does not create proofs. Evidence remains what it was.
- It does not change the session status. The session is already closed.

### A subtle interaction with queries

If a query is approved after finalisation, `decideQuery` sets the row to `present`, `source: "query"`, and updates the decision note. The session's `attendanceFinalized` stays true. The register now shows a post-finalisation correction, and the query audit records it. This is intentional: corrections are allowed, but they are visible.

If a query is rejected after an earlier approval, and the row was `present` with `source: "query"`, it reverts to `absent`/`pending`. It does not revert a `manual` present, because the teacher's manual decision is a separate authority.

### What can go wrong

- **Session still active** → 409 on finalize.
- **No pending rows** → finalize still succeeds, `autoAbsent: 0`.
- **Bulk write partial failure** → some rows may update before the error; the audit entry is not written if the controller throws. This is a rare failure mode; a transaction would be stronger.
- **Notification failure** → logged, finalisation still succeeds.
- **Re-finalise** → no duplicate auto-absent rows; a second audit entry records the event.
- **500 entries** → the limit is exactly 500; more returns 400. A class larger than 500 needs a different flow.

## 58. Student attendance views

### `GET /attendance/me` — the student's home

The controller:

1. Runs `expireStaleQueries()` so a query that just expired shows the right status.
2. Loads active enrollments for the student's email, populating the class and its default room.
3. Loads attendance records for those classes, populating the session's `startedAt`, `closedAt`, `status`, `classSnapshot`, `attendanceFinalized`, limit 300.
4. Builds a map of classes, initialising counters at zero.
5. For each record, increments the matching counter and appends a session entry.
6. Computes `percentage(present, absent)` per class and overall.
7. Loads the student's last 50 queries.
8. Returns `summary`, `classes`, `recent` (30) and `queries`.

The percentage formula is:

```text
percentage = round(present / (present + absent) * 1000) / 10
```

The `*1000 / 10` is a one-decimal rounding trick: multiply by 1000, round to an integer, divide by 10. For example, 7 present and 1 absent = 7/8 = 0.875 → 875 → 87.5. A class with no decided records returns `null`, not 0, so the UI can show "—" instead of "0%".

Why exclude pending and excused?

- A pending row means the teacher has not decided. Counting it as absent would punish the student before the decision.
- An excused row is a deliberate non-penalty. It is shown separately, not counted in the present/absent ratio.

The `recent` list includes the class snapshot, status, source, session start, session id and finalised flag. It is the raw material for a "recent activity" card.

### `GET /attendance/me/sessions` — the query screen

This endpoint is built for the query workflow. It loads the student's active enrollments, then all **closed** sessions for those classes, newest first, limit 80. It loads the student's records and queries for those sessions in parallel.

For each session it computes:

- `windowEndsAt = session.queryWindowEndsAt || closedAt + queryWindowHours` — the stored value wins;
- `windowOpen = windowEndsAt > now`;
- `canRaiseQuery = Boolean(record) && record.status !== "present" && !query && windowOpen && settings.allowStudentQueries`.

The `canRaiseQuery` rule is deliberately strict:

- no record → false (the student was not on the roster);
- already present → false (nothing to correct);
- already a query → false (one query per session);
- window closed → false;
- queries disabled → false.

The UI uses this flag to show or hide the **Raise query** button. The server still re-checks all of these rules on `POST /queries`, so a stale flag cannot bypass them.

The response also includes each record's decision note and whether a location was captured. A student who denied GPS sees `hasLocation: false` rather than a fake coordinate.

### Why two endpoints?

`/attendance/me` is a summary across all classes. `/attendance/me/sessions` is a per-session history with query-window state. They serve different screens and have different shapes. Combining them would force the summary screen to load 80 sessions of detail it does not need.

### What can go wrong

- **No active enrollments** → `/attendance/me` returns zeroed summary and empty classes; `/attendance/me/sessions` returns an empty list.
- **A record for a class the student is no longer enrolled in** → `/attendance/me` skips it because the class map is built from active enrollments. The historical record still exists in the database and in exports, but the student's home does not show it. This is a known limitation: an inactive enrollment hides old records from the student view.
- **More than 300 records** → only the newest 300 are counted. A student with a long history could see an incomplete summary. The limit is a prototype bound.
- **Query expired** → `expireStaleQueries` sets status and notifies; the session view shows `expired`.
- **Session window missing** → the fallback computes from `closedAt` and the current settings. If both are missing, `windowOpen` is false.

## 59. Class analytics

### The overview

`GET /attendance/classes/:classId/overview` is a read-only aggregation. A teacher must own the class; a super-admin can inspect any class.

It resolves the term range:

```text
from = query.from || settings.termStart || null
to   = query.to   || settings.termEnd   || null
```

`dateRange` converts them to Mongo `$gte`/`$lte`, and a date-only `to` is expanded to 23:59:59.999 so the whole day is included.

It loads sessions for the class in the range, limit 200, oldest first. For each session it computes a summary from the records. It then builds:

- `students` — one entry per email, with present/absent/pending/excused/total, last status and last session time;
- `sessionViews` — per-session summary and finalisation state;
- `trend` — closed sessions only, with a short date label, percentage, present, absent, pending;
- `queries` — counts by status for the class;
- `summary` — totals, decided, percentage and the class average.

### The class average formula

```text
classAverage = round(
  (sum of each student's percentage, treating null as 0) / number of students * 10
) / 10
```

This is the average of per-student percentages, not the overall present/decided ratio. The two can differ when students have different numbers of sessions. The overall percentage is also returned, so the UI can show both. A student with no decided records contributes 0 to the average; this is a known distortion for a class with many new students. A more robust average would exclude nulls; the current code does not.

### Per-student detail

`GET /attendance/classes/:classId/students/:studentId` accepts a 24-character ObjectId or an email. It builds a filter by `student` or `studentEmail`, loads records for the class, limit 300, and returns:

- the student's identity from the first record;
- the class identity;
- the summary and percentage;
- each record with its session view;
- the student's queries for the class.

If no records exist, **404**. This is a real "not found" because the route is about one student's records, not a list that can be empty.

### What the numbers mean

- `total` — number of attendance rows, one per session the student was on the roster for.
- `present` — decided present.
- `absent` — decided absent, including auto-absent.
- `pending` — not yet decided.
- `excused` — deliberate non-penalty.
- `percentage` — present / (present + absent), one decimal.
- `decided` — present + absent.

A student can have `total: 10`, `present: 7`, `absent: 1`, `pending: 1`, `excused: 1`, `percentage: 87.5`. The percentage ignores the pending and excused rows.

### Why the analytics are read-only

The analytics routes do not mark, finalise or correct anything. Corrections happen through the register, the query decision or the admin override, each with its own audit entry. This separation makes it harder to change a number by accident while looking at a chart.

### What can go wrong

- **Invalid class id** → 404.
- **Unowned class** → 404 (teacher path), not 403.
- **No sessions** → empty lists, zeroed summary, `percentage: null`.
- **More than 200 sessions** → only the oldest 200 in the range are counted. A long term with many sessions could truncate the trend.
- **More than 300 records per student** → truncated. The summary is then partial.
- **Deleted attendance record** → it simply disappears from the records; the audit still has the deletion entry.
- **Query window changes** → the analytics use the session's stored `queryWindowEndsAt`, not a recomputed value.

## 60. Queries: creation, decision, expiry and reopen

### What a query is

A query is a student's claim that an attendance decision for a closed session is wrong. It is not an automatic correction. It collects:

- the student's reason (10–1000 characters);
- optional location evidence;
- the teacher's session location and the student's attempt location;
- a distance and a within-radius flag;
- a 24-hour expiry;
- a decision by the teacher or a super-admin;
- an audit trail.

### Creation rules

`POST /queries` runs `expireStaleQueries()` first, then loads settings. If `allowStudentQueries` is false, **403**.

It validates:

- `sessionId` is a valid ObjectId → else 400;
- reason trimmed length 10–1000 → else 400;
- session exists → else 404;
- student is on the class roster (active enrollment) → else 403;
- session is closed → else 409;
- `expiresAt = session.queryWindowEndsAt || closedAt + queryWindowHours`; if `<= now` → 409;
- no existing query for `(session, studentEmail)` → else 409 with the existing status;
- an attendance record exists for `(session, studentEmail)` → else 403;
- the record is not already `present` → else 409;
- if `settings.requireQueryLocation`, a normalised `studentLocation` is required → else 400.

The order matters. The roster check comes before the "already present" check, so a non-enrolled caller cannot learn whether a record exists. The existing-query check comes before the record check, so the student gets the more useful "already exists" message.

### Location computation

The controller normalises the student's location. It then chooses:

```text
referenceLocation = studentLocation || attemptLocation
distance = referenceLocation ? distanceMeters(teacherLocation, referenceLocation) : null
radius = settings.geofenceRadiusMeters || 30
withinRadius = distance === null ? null : distance <= radius
```

The Haversine formula in `utils/location.js`:

```text
R = 6,371,000 m
dLat = radians(lat2 - lat1)
dLon = radians(lon2 - lon1)
a = sin²(dLat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin²(dLon/2)
distance = round(2 * R * asin(sqrt(a)))
```

It is the great-circle distance on a sphere. It is accurate to a few metres over classroom distances, which is far more than the GPS accuracy. The result is rounded to the nearest metre.

`withinRadius` is evidence, not a gate. A query outside the radius can still be approved; the teacher sees the distance and decides. The setting only controls whether a location is required, not whether a query is allowed.

### Creation side effects

- The query is created with `teacher` from the session, `student` from the caller, `attendance` from the record, and class snapshots.
- `record.query = query._id` is saved.
- Audit `query.created` with whether a location was supplied and the distance/radius result.
- A `query.created` notification is sent to the teacher.

The query stores `studentLocation: studentLocation || attemptLocation`, so a query with no fresh location still shows the attempt location. It also stores `attemptLocation` separately, so the UI can show both.

### Review queue

`GET /queries/review` is teacher-only, scoped to `teacher: req.user._id`. Optional filters `status`, `classId`, `sessionId`. It returns up to 300 queries and counts by status. `expireStaleQueries()` runs first.

A super-admin uses `GET /admin/queries`, which is unscoped and returns up to 500.

### Detail access

`GET /queries/:queryId` allows:

- the owning student;
- the owning teacher;
- a super-admin.

Anyone else gets **403**. The response includes the query and the last 30 audit entries. `GET /queries/:queryId/audit` applies the same access rule and returns 50 entries.

### Decision

`POST /queries/:queryId/decision` requires staff. A teacher can decide only their own query; a super-admin any. The decision must be `approved` or `rejected`. An already decided query returns **409**. An **expired** query can still be decided; the audit notes `wasExpired`.

Approval:

1. Set query status/decider/time/note.
2. Load the attendance record by `query.attendance`; fall back to `(session, studentEmail)`; create an absent row if missing.
3. Set the record to `present`, `source: "query"`, the decider, timestamp, note, and `query`.
4. Audit `query.approved`.
5. Notify the student.

Rejection:

1. Set query status/decider/time/note.
2. Set the record's note and `query`.
3. If the record was `present` with `source: "query"`, revert to `absent`/`pending`.
4. Audit `query.rejected`.
5. Notify the student.

The revert rule is narrow on purpose. It undoes an earlier **query approval**, not a manual present or an admin override. Those are separate authorities and should not be silently changed by a later query decision.

### Reopen

`POST /queries/:queryId/reopen` requires staff and ownership. A pending query cannot be reopened (**409**). Reopening:

- sets status `pending`;
- sets `reopenedAt`, `reopenedBy`, increments `reopenCount`;
- gives a fresh `expiresAt = now + queryWindowHours`;
- clears the previous decision fields;
- stores the reopen note in `decisionNote`;
- audits `query.reopened` with the previous status and new expiry;
- notifies the student.

It does not change the attendance row. A later decision will. A query can be reopened repeatedly; `reopenCount` records how many times.

### Expiry

`expireStaleQueries` is called before most query and attendance reads, and periodically by a server sweeper. It:

1. Finds pending queries with `expiresAt <= now`, limit 100.
2. For each, atomically updates `status: "pending"` to `"expired"` with `expiredAt`.
3. If the update wins, creates an audit entry `query.expired` with actor `system` and role `system`.
4. Notifies the student and teacher.

The atomic `findOneAndUpdate` prevents two concurrent sweepers from expiring the same query twice. The audit entry is created with `AuditLog.create` directly, not `writeAudit`, because there is no request actor. That means it bypasses `appendAuditEntry`: it has no `seq` and no `hash`, so the verification endpoint counts it as a `legacy` row. This is a real inconsistency worth knowing when interpreting the chain. The row is still in the audit collection and still queryable, but it is not tamper-evident in the same way.

### What can go wrong

- **Session closes after the student loads the page** → the create check uses the live session status, so it may succeed if close has not happened yet. The window starts at close.
- **Query window expires while the student is typing** → the create returns 409. The UI should show the closed window.
- **Two tabs create the same query** → the model's `(session, studentEmail)` index is **not unique**. The controller checks with `findOne` before creating, so the normal case is safe, but a true race can create two query documents for the same student and session. This is a known concurrency gap; the fix would be a unique index, and adding one to an existing database would require cleaning duplicates first. Part XIV lists it.
- **Location denied** → the query is still allowed unless `requireQueryLocation`; distance is null and `withinRadius` is null.
- **Teacher location missing** → distance is null; the query can still be created and decided.
- **Reopen after expiry** → allowed; the new window starts at reopen, not at close.
- **Decision after the student is removed from the roster** → the query still exists and can be decided; the attendance row is the historical link.
## 61. Class and roster management

### Rooms

Rooms are deliberately shared across teachers. `GET /rooms` is staff-readable and returns every room sorted by `roomNo`; `POST /rooms` is also staff. The room number is trimmed, required, and capped at 40 characters. A duplicate is **409** from the unique index, caught by the controller's pre-check or the error middleware.

Rooms are not owned by a teacher because a physical classroom is not a personal resource. Two teachers can teach in `C-101`, and the timetable can point both at the same room.

### Creating a class

`POST /classes` requires `courseCode`, `title` and `roomId`. The room must exist; an invalid or missing room is **400** `"Select an existing room"`. The teacher is always `req.user._id`; a caller cannot create a class on someone else's behalf through this route. The admin route is the only way to assign another teacher.

`CourseClass` has a unique index on `(teacher, courseCode, section)`. Creating the same course code and section twice for one teacher produces a duplicate-key **400** from the error middleware. The model uppercases `courseCode`, so `cs301` and `CS301` collide correctly.

The class response is populated with `defaultRoom` so the UI can show the room number without a second request.

### Listing classes

`GET /classes` returns only `teacher: req.user._id`. A super-admin cannot use it. Each class is enriched with `activeStudentCount` from one aggregation:

```js
Enrollment.aggregate([
  { $match: { class: { $in: classIds }, status: "active" } },
  { $group: { _id: "$class", count: { $sum: 1 } } },
])
```

This is one query for all classes, not one query per class. The count is of active enrollments, not of user accounts: a roster entry exists before the student ever signs in.

### Roster preview

`POST /classes/:classId/roster/preview` calls `parseRosterText(req.body.rosterText, rosterOptions())`. It writes nothing. The parser and its rules are covered in chapter 86. The response contains accepted entries, line-numbered errors and counts. This is the same parser used by the save route, so the preview and the save cannot disagree about what a line means.

An empty body is valid input: it produces zero entries and zero errors. The save route then rejects it with "A class must have at least one student".

### Roster save is a replacement

`PUT /classes/:classId/roster` is the only route that writes enrollments:

1. Parse the text again, server-side.
2. Any parse error → **400**, nothing is written.
3. No accepted entries → **400**.
4. `bulkWrite` upserts every entry by `(class, email)`, setting `name`, `identity`, `status: "active"` and `rosterUpdatedAt`.
5. `updateMany` marks every enrollment whose email is **not** in the new list as `inactive`.
6. Return the new active count.

Three consequences are worth stating plainly:

- **It is not a merge.** A student omitted from the pasted list is deactivated.
- **It does not delete history.** The enrollment row remains, and every attendance record, query and audit entry remains. The student simply stops appearing in the active roster, discovery and new session snapshots.
- **Re-adding a student reactivates the same enrollment row**, because the upsert matches on `(class, email)`. The historical link is preserved.

The save is not wrapped in a transaction. If the upsert succeeds and the deactivation fails, the class can briefly have both old and new students active. A retry converges, because the operation is idempotent for the same input. A transaction would be stronger; the current prototype accepts the small window.

### Who can touch a roster

`getOwnedClass` runs first on every roster route. A teacher who guesses another teacher's class id gets **404**, not 403. A super-admin cannot use the teacher roster routes at all; the admin console does not currently expose roster editing, which is a deliberate gap rather than a hidden capability.

### What can go wrong

- **Duplicate email with different name** → the upsert overwrites the name. The latest roster wins.
- **Two teachers paste simultaneously** → last writer wins; the audit does not record roster edits. This is a gap: `timetable.*` and `admin.class.*` are audited, but roster replacement is not. The enrollment timestamps are the only record.
- **Huge roster text** → the JSON body limit (200 KB) bounds it; the parser also has its own line limits.
- **Room deleted while a class points at it** → the class keeps the id; the populated field becomes null. Starting a check-in then fails the default-room check or the room lookup, depending on the path.
- **Course code case** → the model uppercases it, so the saved value may differ from what the teacher typed. The UI should display the saved value from the response.

## 62. Timetable management

### What a timetable slot is

A `Timetable` document says: this class meets on this weekday, from this start time to this end time, in this room, during this term. It is a **planning record only**. It never starts a check-in, never marks attendance, and never creates a session. Starting attendance remains an explicit teacher action.

### Visibility

`GET /timetable` filters by role:

- **student** — classes where the student has an active enrollment;
- **teacher** — entries whose `teacher` equals the caller;
- **super-admin** — every entry.

An optional `classId` narrows the result further. Only entries with `active: { $ne: false }` are returned, so an old slot can be hidden without deleting it. The response also includes `term`, the `DAYS` array, and populated class/room/teacher views.

The teacher filter uses the slot's `teacher` field, which is copied from the class owner at creation. If a class is later reassigned to another teacher, old slots stay with the old teacher until they are edited or recreated. That is intentional: the slot records who was responsible when it was made. A super-admin can always see and fix it.

### Creating a slot

`POST /timetable` calls `parseEntry`, which enforces:

- `classId` is a valid ObjectId and the class exists;
- the caller owns the class, or is a super-admin;
- `dayOfWeek` is an integer 0–6 (Sunday = 0);
- `startTime` and `endTime` match `^([01]\d|2[0-3]):[0-5]\d$`;
- `startTime < endTime` as a zero-padded string comparison;
- `roomId` is a valid room if supplied; otherwise the class's default room is used;
- `term` is trimmed and truncated to 80 characters, defaulting to the settings term name.

The model adds a pre-validate hook that rejects an end time not after the start time. The rule is enforced twice: once with a friendly controller message, once at the schema boundary. That matters because a future code path could bypass `parseEntry` and still be unable to store an impossible slot.

A slot is created with `teacher = courseClass.teacher`, not `req.user._id`. A super-admin creating a slot for another teacher therefore produces a slot owned by that teacher, which is the correct behaviour.

### Editing and deleting

`PATCH /timetable/:entryId` merges the body over the existing values, re-runs the full validation on the merged object, and saves. Only the owning teacher or a super-admin may edit. The merge means a partial body is valid: changing only `startTime` still validates the existing class, day, end time and room.

`DELETE /timetable/:entryId` removes the document. Both routes audit (`timetable.updated`, `timetable.deleted`). Deleting a slot has no effect on sessions or attendance; they are separate collections with separate lifetimes.

### The PDF preview

`POST /timetable/pdf/preview` is staff-only, rate-limited to 20 uploads per 10 minutes, one PDF field `file`, max 10 MB. It calls the same `extractPdfText` as the roster preview and returns the text and statistics. It does **not** parse rows, guess columns, match course codes, create classes or write slots.

A PDF with no text layer returns **422** `pdf_no_text_layer` with a message that local OCR is not built. A scanned timetable must therefore be typed manually. This is an honest limitation, not a hidden failure.

### Why there is no automatic timetable import

A timetable is a two-dimensional table with merged cells, breaks, electives, lab batches and room changes. Guessing which text belongs to which (day, time) cell from raw PDF text is exactly the kind of parser that looks impressive on one sample and fails on the next. The project requires representative college PDFs before inventing that parser, and none have been supplied. The preview gives a teacher the text without pretending to understand the layout.

### What can go wrong

- **End time equal to start time** → 400; a zero-length slot is not allowed.
- **Overnight slot** → 400; the format has no way to express midnight crossing. A 23:00–01:00 class is out of scope.
- **Room not supplied** → the class default room is used. If the class has no default room, the class could not have been created, so this is safe.
- **Class reassigned** → old slots stay with the old teacher until edited; the super-admin can see them.
- **Duplicate slots** → there is no unique index on `(class, day, start)`. Two overlapping slots can exist. The UI is expected to avoid it; the database does not enforce it. This is a known gap.
- **Term change** → existing slots keep their old term string. A filter by the new term hides them rather than deleting them.

## 63. PDF text extraction

### In plain words

`utils/pdfText.js` opens a PDF, reads the text characters the PDF already contains, reconstructs visual lines from their coordinates, and returns plain text. It does not take a picture of the page, does not run OCR, does not render, and does not save the file. A scanned PDF has no text layer, so it is rejected with a specific code.

### Why PDF.js

PDF.js is Mozilla's PDF renderer, used here only for its text extraction. It is loaded with a dynamic `import()` because the package ships as ESM while the backend is CommonJS. The import is cached in `pdfjsPromise`, so the module is loaded once per process.

The load options are security-relevant:

| Option | Value | Why |
| --- | --- | --- |
| `isEvalSupported` | `false` | A teacher-supplied PDF is untrusted; embedded JavaScript must never execute |
| `useSystemFonts` | `true` | Avoids font failures without embedding fonts |
| `disableFontFace` | `true` | No font faces are registered in the process |
| `useWorkerFetch` | `false` | No worker network fetches |
| `verbosity` | `0` | Suppresses parser chatter in production logs |

### The bounds

| Bound | Value | Error |
| --- | --- | --- |
| File size | 10 MB | `pdf_too_large` (413) |
| Page count | 20 | `pdf_too_many_pages` (422) |
| Total characters | 200,000 | `pdf_too_much_text` (422) |
| Empty buffer | — | `pdf_missing` (400) |
| No `%PDF-` header in the first 1024 bytes | — | `pdf_invalid` (400) |
| Password-protected | — | `pdf_password_protected` (422) |
| Damaged/unsupported | — | `pdf_unreadable` (422) |

The header check is deliberately cheap and permissive: it looks for `%PDF-` anywhere in the first 1 KB, because some generators prepend junk. It is not a full validator; PDF.js does the real parsing.

The character count is accumulated page by page, so a PDF that exceeds the limit stops early rather than extracting everything and then checking. `page.cleanup()` releases each page's resources.

### Reconstructing lines

PDF text content is a list of fragments, each with a string, a transform matrix, a width and a height. The order in the content stream is not necessarily reading order, and many generators emit one fragment per character or per word.

`reconstructLines` does this:

1. Discard empty strings and fragments without a usable transform.
2. Read `x = transform[4]` and `y = transform[5]`.
3. Sort fragments by **descending y**, then ascending x. PDF y coordinates grow upward, so a larger y is higher on the page.
4. Group fragments into a line when their y differs by at most a tolerance:

```text
tolerance = max(1.5, min(height * 0.35, 4))
```

The clamp keeps a tiny font from producing a sub-pixel tolerance and a huge heading from swallowing the next line.
5. Sort each line's fragments by x.
6. Join them, inserting a space only when the horizontal gap exceeds:

```text
threshold = max(0.8, min(characterWidth * 0.5, 3))
```

where `characterWidth = previous.width / max(previous.str.length, 1)`.

Why the gap heuristic? If a generator emits one fragment per character, naively joining with spaces produces `H e l l o`. If it emits whole words, joining without spaces produces `HelloWorld`. Measuring the gap between the end of the previous fragment and the start of the current one, relative to character width, distinguishes a real word space from kerning.

The line text is whitespace-collapsed and trimmed, empty lines are dropped, and pages are joined with a blank line.

### What the extractor returns

```js
{
  text: "...",
  pageCount: 2,
  extractedPages: 2,
  lineCount: 48,
  charCount: 3100,
  hasText: true
}
```

`hasText` is `text.length > 0`. A PDF can have pages but no selectable text; that is the scanned case. The route decides whether to treat that as an error. The extractor itself returns the empty result so a caller could choose to accept it.

### Error mapping

`PdfTextError` carries a `code` and a `statuscode`. The route catches it and copies both onto an `ErrorHandler`, so the client sees the stable code. Any other exception becomes `pdf_unreadable` rather than leaking a stack trace or a parser message. Password errors are detected by `error.name === "PasswordException"`.

The `finally` block destroys the loading task (or cleans up the document) and deliberately swallows cleanup errors, so a cleanup failure cannot replace a successful extraction result.

### What extraction does not do

- No OCR. A picture of text is not text.
- No layout understanding. It does not know what a column, a table cell or a merged header is.
- No table reconstruction. Rows are just lines.
- No file storage. The buffer is in memory and is discarded after the request.
- No virus scanning. The parser is the trust boundary; the file is never executed.
- No rendering. There is no image preview.

### What can go wrong

- **Two columns interleaved** → the y-grouping merges fragments from both columns into one line. The text is readable but the column order is lost. A teacher must interpret it.
- **Rotated text** → the transform is not normalised for rotation; the reconstructed order may be wrong.
- **Ligatures and custom encodings** → PDF.js maps most fonts, but an unusual encoding can produce garbled characters.
- **Huge single page** → the 200,000-character cap stops it, but a page with a very large text object can still take time to parse.
- **Password-protected** → 422; the teacher must remove the password outside the app.
- **PDF with JavaScript** → never executed because `isEvalSupported` is false.
- **Process memory** → the file is capped at 10 MB, but PDF.js can expand it. The single-process deployment has no per-request memory cap beyond the file size.

## 64. PDF preview endpoints

### The common shape

Two routes share the extraction utility:

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /classes/:classId/roster/pdf/preview` | Teacher | Extract roster text for the class |
| `POST /timetable/pdf/preview` | Staff | Extract timetable text |

Both are `guards → createPdfPreviewLimiter() → acceptPdfUpload → controller`. The limiter is created per router, so a teacher cannot spend the roster budget on timetable uploads and vice versa. Each allows 20 uploads per 10 minutes per account/IP.

`acceptPdfUpload` uses `multer.memoryStorage()` with:

- `fileSize: MAX_PDF_BYTES` (10 MB);
- `files: 1`;
- `fields: 0`.

The file never touches disk. Multer errors are translated to `pdf_too_large` (413) and `pdf_upload_invalid` (400).

### The roster preview

The controller checks class ownership **before** checking the file. That ordering means an unowned class returns 404 even if the upload is also malformed, which avoids leaking class existence. It then requires `req.file` (else `pdf_missing`), extracts, rejects an empty text layer, and counts institutional emails:

```js
const institutionalEmailCount = (
  extraction.text.match(/[^\s@]+@nitjsr\.ac\.in/gi) || []
).length;
```

That count is a convenience signal for the teacher ("this looks like a college roster"), not a validation. A PDF with 37 such addresses is still not parsed into students. The teacher must copy or edit the text into the roster textarea, run the preview parser, and save separately.

The response includes the original filename, which is displayed in the modal. The filename is user-supplied; the UI must render it as text, not HTML. React does that by default.

### The timetable preview

Same extraction, no class scope (a teacher may be preparing next term), no email count. The response is `{ text, pageCount, extractedPages, lineCount, charCount, hasText, fileName }`.

The frontend shows the text in a read-only panel. There is no "import" button because there is no importer. The teacher adds slots through the normal form. This is the A2a slice: a real, useful extraction with a deliberately narrow promise.

### Why preview-only is a product decision

A preview endpoint cannot create a class, save a roster, write a slot or mark attendance. That means:

- a parser bug can waste a teacher's time, but cannot corrupt data;
- a malicious PDF can consume CPU, but cannot change the register;
- the teacher remains the author of the import;
- the feature can ship before the layout inference is trustworthy.

The cost is manual copying. That cost is real, and it is the honest reason structured import remains open work.

### What can go wrong

- **File field name mismatch** → multer sees no file → `pdf_missing`.
- **More than one file** → `pdf_upload_invalid`.
- **A non-PDF renamed to `.pdf`** → header check fails → `pdf_invalid`.
- **A valid PDF with no text** → `pdf_no_text_layer`; the teacher is told OCR is not built.
- **A PDF over 20 pages** → `pdf_too_many_pages`; the teacher must split it.
- **Rate limit** → 429 with `Retry-After`.
- **Class deleted between ownership check and extraction** → the controller already holds the class document; the response still succeeds. No write depends on it.
- **Filename with quotes or newlines** → it is returned as JSON and rendered as text; it is not used in a `Content-Disposition` header, so header injection is not a concern here.

## 65. Exports

### What an export is

An export is a server-generated document built from the same database records as the on-screen view. It is not a screenshot and not a client-side CSV. The server loads the class or session, computes the same summaries, and writes a PDF or an Excel workbook. Building it server-side means the file matches the permission check and the audit entry.

### The libraries

- **PDFKit** streams a PDF. `sendPdf` creates a document, pipes it to the response, calls a build function, and ends the document. `Content-Disposition` is `attachment; filename="<name>.pdf"`.
- **ExcelJS** builds a workbook in memory. `sendXlsx` writes it to a buffer and sends it with the Excel MIME type and a `.xlsx` filename.

Both set `Cache-Control: no-store` through the API middleware. A download must never be cached by a shared proxy.

### The scope checks

| Export | Scope check |
| --- | --- |
| Attendance PDF/XLSX | Teacher owns the class, or super-admin |
| Query PDF/XLSX | Teacher's own classes, or super-admin |
| Session PDF/XLSX | Teacher owns the session, or super-admin |
| Users XLSX | Super-admin |
| Audit XLSX | Super-admin |

A missing or unowned class/session returns **404**. The controllers resolve the term range and filters before generating, so the file reflects exactly the requested range.

### The workbook shapes

`attendanceXlsx` creates four sheets:

1. **Summary** — class identity, term, totals, percentage, generated time.
2. **Students** — one row per student with present/absent/pending/excused/total/percentage.
3. **Sessions** — one row per session with date, status, wave, roster count, present/absent/pending, finalisation.
4. **Raw rows** — the underlying attendance records, one row per student per session.

The PDF is a branded register: header, class details, a table of students and statuses, and a summary. It uses the `BRAND` palette (`indigo`, `teal`, `slate`, `light`). The exact column widths and fonts are cosmetic; the data source is the same.

`sessionXlsx` has a **Session** summary sheet and a **Roster** sheet. `queriesXlsx` has a **Queries** sheet with reason, status, decision, distance and timestamps. `auditXlsx` has an **Audit log** sheet with sequence, hash, action, actor, entity and time. `exportUsersXlsx` has a **Users** sheet with role, status, demo flag and device state.

### Audit

Every successful export calls `auditExport(req, action, metadata)`, which writes an `export.*` entry with:

- the format (pdf/xlsx);
- the class or session id;
- the filters used;
- a summary such as the class code and row count.

The audit is written **before** streaming begins in most controllers, so even a client that disconnects mid-download is recorded. The action enum includes all eight export actions. The admin export route also has its own 30-per-10-minute limiter.

The purpose is accountability, not prevention. A teacher can export their own class repeatedly within the limit. The audit answers "who took this data out" after the fact.

### A known rendering bug

In `attendancePdf`, the class-average row calls:

```js
keyValue(doc, doc, "Class average", ...)
```

instead of:

```js
keyValue(doc, "Class average", ...)
```

The extra `doc` becomes the label argument, so the PDF prints an object where the label should be. The value is still present, but the label is malformed. This book describes the code as it is; the bug is not fixed here. It is cosmetic and does not affect the data.

### Streaming versus buffering

PDFKit streams. If an error occurs after the first byte, the status code is already sent and the client receives a truncated PDF. The controllers therefore load and validate all data before creating the document, and the build function is synchronous apart from that. A database error during the initial load still produces a JSON error.

ExcelJS buffers the whole workbook, so a failure before `sendXlsx` is a clean JSON error. The tradeoff is memory: a large workbook is held in RAM. The row limits in the queries keep this bounded for the prototype.

### What can go wrong

- **No data** → the export still succeeds with an empty table and zero totals. That is usually better than an error.
- **Huge class** → the 500-record practical bounds are not enforced on exports the way they are on list routes; a very large class increases memory and generation time.
- **Client disconnects** → the stream may error; the audit may already be written. The user sees a partial file.
- **Invalid class id** → 404 before any document is created.
- **Term dates inverted** → the range resolves to an empty set; the export is empty rather than invalid.
- **Filename** → generated from the class code and a date; unsafe characters are not fully sanitised. A class code comes from a teacher-controlled field. The header is quoted, but a quote or newline in the code could malform it. This is a low-severity robustness gap.
- **Rate limit** → 429, no audit entry, because no export happened.

## 66. Notifications

### What a notification is

A notification is a small, user-scoped message stored in MongoDB. It has a `user`, a `type` from a fixed enum, a title (max 160), a message (max 600), an optional link (max 300), optional structured `data`, a `readAt` timestamp and an `isDemo` flag.

The types are:

```text
session.started, session.closed, attendance.finalized,
query.created, query.approved, query.rejected, query.expired, query.reopened,
device.approved, device.rejected, system
```

A type outside the enum is rejected by Mongoose. That keeps the frontend's icon/label map finite.

### Creation

`createNotification(entry)` checks that a user id exists and the database is ready, then calls `Notification.create`. On any error it logs `[notification] failed for <user>: <message>` and returns `null`. It never throws.

`createNotifications(entries)` uses `insertMany(..., { ordered: false })`. With `ordered: false`, one bad document does not stop the rest, and the promise rejects only if every insert fails (or reports the errors). The helper catches and returns `[]`.

`notifyRoster({ enrollments, ... })` de-duplicates user ids, drops nulls, and builds one notification per distinct user. This is used when a session starts or closes: every enrolled student who has a linked user account gets one message, not one per enrollment.

### Why notifications are best-effort

The primary action is the session, the query decision or the device approval. A notification is a courtesy. If the notification write fails, the primary action must not appear to fail; the user would retry and create a duplicate. The tradeoff is that a notification can be silently lost. The server log is the only trace. A production system with delivery guarantees would use an outbox and a retry worker.

### Reading and clearing

All notification routes are scoped to `req.user._id`:

- `GET /notifications?limit=&unread=true` returns the newest first, default 40, max 100, plus the unread count.
- `POST /notifications/:id/read` uses `findOneAndUpdate({ _id, user })`. A notification that exists but belongs to someone else returns **404**, not 403, so a caller cannot probe ids.
- `POST /notifications/read-all` sets `readAt` on every unread row for the user and returns the number updated.
- `DELETE /notifications/read` deletes rows with a non-null `readAt` for the user. Unread rows are never deleted by this route.

Marking an already-read notification is a no-op success. The read timestamp is not overwritten.

### Where notifications are created

| Event | Recipient | Type |
| --- | --- | --- |
| Session started | Enrolled students with a user | `session.started` |
| Session closed | Enrolled students with a user | `session.closed` |
| Attendance finalised | Every student with a user | `attendance.finalized` |
| Query created | The session's teacher | `query.created` |
| Query approved/rejected | The student | `query.approved` / `query.rejected` |
| Query expired | Student and teacher | `query.expired` |
| Query reopened | The student | `query.reopened` |
| Device approved/rejected | The student | `device.approved` / `device.rejected` |

### What can go wrong

- **Database down** → `createNotification` returns null silently; the primary action proceeds.
- **A student has no user id yet** → no notification; the roster email is not enough to address an account. The session is still discoverable after sign-in.
- **Duplicate notifications** → `notifyRoster` de-duplicates by user, but two calls to the same event (for example, a retried close) are guarded by the controller's status check.
- **Link target no longer exists** → the notification opens a page that shows a not-found state. Links are plain strings and are not validated.
- **Unread count drift** → the count is a query, not a stored counter, so it cannot drift.
- **Very old notifications** → there is no retention job; they accumulate until the user clears read items. This is a storage, not a correctness, issue.

## 67. Admin console actions

### The shape of the console

Every route under `/admin` except `stop-impersonation` passes through `isAuthenticated` and `authorizeSuperAdmin`. Destructive routes add `requireAdminStepUp`. The console is not a teacher route with extra buttons; it is a separate authority with its own audit vocabulary.

### Overview

`GET /admin/overview` runs `expireStaleQueries()` first, then counts users by role, classes, sessions, pending queries, finalised sessions and demo users. It aggregates attendance records by status, computes the overall percentage, and returns the last eight audit entries. It also reports `production` and `demoEnabled`, so the UI can hide demo controls in production.

This is a dashboard, not a source of truth. Every number is a fresh query.

### Users

`GET /admin/users` filters by `role`, `status`, `demo=true|false`, and `q` (a case-insensitive regex on name, email or roll number). Limit 100 default, 500 max. Each row includes `deviceApproved` and the device's `lastSeenAt`.

`POST /admin/users` creates a student or teacher. It refuses `role: "superadmin"`; that grant is environment-only. It refuses a demo account in production (**403**). A duplicate email is **409**. The password field does not exist.

`PATCH /admin/users/:userId` can change `name`, `status`, `phoneLabel`, `demoLabel`, `rollNumber` and `role`. It refuses to:

- change a super-admin's role;
- disable a super-admin;
- demote or disable the caller themselves.

A role or status change increments `tokenVersion`, so existing sessions die on the next request. The audit entry includes `before`, `after` and `sessionsRevoked`.

`POST /admin/users/:userId/revoke-sessions` increments the target's version without changing anything else. It is the incident-response lever.

### Classes

`GET /admin/classes` returns every class with its teacher and room. `POST /admin/classes` requires a valid, active teacher and a room; the course code is uppercased by the model. `PATCH /admin/classes/:classId` can change title, section, teacher and room. Reassigning a class does not move existing sessions or timetable slots; those keep their original `teacher` field. This is deliberate historical accuracy, but it means the new teacher may not see old sessions in their teacher-scoped list. The admin console can still see them.

### Sessions and attendance

`GET /admin/sessions` filters across all teachers by class, teacher, status, limit 200. `GET /admin/sessions/:sessionId/attendance` returns the same register shape as the teacher route.

`PATCH /admin/attendance/:recordId` requires a note and a valid status. It sets `source: "override"`, the admin identity and timestamp, and audits `attendance.override` with the before/after status and the note. A missing note is **400**; an invalid row is **404**.

`DELETE /admin/attendance/:recordId` requires `{ confirm: "DELETE", note: "..." }`. The literal confirm string is a guard against a stray click. It deletes the row and audits `attendance.deleted` with a snapshot of the deleted record. It does not delete the session, the proofs or the queries; those remain as history. A deleted row disappears from analytics, which can change a percentage.

### Queries and audit

`GET /admin/queries` is unscoped and returns up to 500, with the same filters as the teacher queue. Decisions still go through `POST /queries/:queryId/decision`, which allows a super-admin.

`GET /admin/audit` filters by action, entity type, actor, date range, sequence and a text search. It returns `toAuditView` rows with `seq`, `hash` and `prevHash`, limit 100 default / 200 max. `GET /admin/audit/verify` recomputes the chain and returns:

```json
{
  "ok": true,
  "checked": 412,
  "reason": null,
  "brokenSeq": null,
  "brokenHash": null,
  "expectedHash": null,
  "firstSeq": 1,
  "lastSeq": 412,
  "lastHash": "...",
  "legacy": 7
}
```

`ok` is true only when every chained row verifies and the sequence is contiguous. `legacy` counts rows without a hash (including system-expired query entries). The verification endpoint is read-only.

### Settings

`GET /admin/settings` returns the singleton settings document. `PATCH` accepts a subset of:

| Field | Range |
| --- | --- |
| `queryWindowHours` | 1–168 |
| `geofenceRadiusMeters` | 1–1000 |
| `lateGraceMinutes` | 0–120 |
| `requireQueryLocation` | boolean |
| `allowStudentQueries` | boolean |
| `demoModeEnabled` | boolean; cannot be enabled in production |
| `termName` | max 80 characters |
| `termStart`, `termEnd` | dates or null |

Mongoose validators enforce the numeric ranges. The controller refuses `demoModeEnabled: true` in production with **403**. The update is audited with before/after.

Changing `queryWindowHours` affects **new** closes and **reopened** queries; existing sessions keep their stored `queryWindowEndsAt`. Changing `geofenceRadiusMeters` affects new query distance comparisons, not stored ones.

### Passkeys and impersonation

These are covered in chapters 34 and 36. The admin console's security panel shows whether a passkey is enrolled, the step-up state, and a button to register another passkey. Destructive buttons catch **428** and open the passkey prompt.

### What can go wrong

- **Self-demotion** → blocked.
- **Super-admin role change** → blocked; the environment is the only grant.
- **Demo user in production** → creation blocked; existing demo data can still be removed.
- **Settings change with an invalid type** → Mongoose cast error → **400** via the error middleware.
- **Attendance deletion** → irreversible through the UI; the audit has the snapshot, but there is no restore button. A database restore is the only recovery.
- **Audit verify after a legacy row** → `ok` may still be true if the chained rows are intact; `legacy` is informational. A gap in `seq` among chained rows is a failure.
- **Two admins edit the same user** → last write wins; both audit entries exist. There is no optimistic version check on users.

## 68. Demo data

### Why demo data exists

A reviewer needs to see a populated dashboard, a register, a query and an audit trail without creating a real term of data. Demo data is generated by the server, marked with `isDemo: true`, and isolated so it can be removed without touching real records.

### The gate

`requireDemoMode`:

- returns **404** in production, so the route looks absent;
- returns **403** if `settings.demoModeEnabled` is false.

The status, seed and reset routes all use it. Reset additionally requires a passkey step-up. Seed does not require step-up, because it only creates data; it still requires a super-admin session.

### What seeding creates

`POST /admin/demo/seed` first calls `clearDemoData(req.user._id)`, so seeding is repeatable and never stacks two demo sets. It then creates:

- room `DEMO-101`;
- teacher **Dr. Ananya Verma**, `demo.teacher@demo.invalid`, role teacher, `authProvider: "dev"`, `isDemo: true`;
- eight students named Aarav Mehta, Ishita Rao, Kabir Singh, Meera Nair, Rohan Das, Sara Khan, Ved Patel and Zoya Ali, with emails `demo.student1..8@demo.invalid`, roll numbers `2026CS001..008`, all `isDemo: true`;
- class **CS 3101 — Design & Analysis of Algorithms**, section A, owned by the demo teacher, in `DEMO-101`;
- eight active enrollments linking the students;
- three timetable slots (Monday, Wednesday, Friday, 10:00–11:00);
- eight closed sessions, dated 21, 18, 14, 11, 7, 4, 2 and 1 days ago, each with wave 2 and a random key;
- attendance records with a deterministic absent pattern: `(sessionIndex + studentIndex) % 7 === 0`, plus one extra absence in the latest session;
- queries and audit entries marked demo.

The seed uses fixed names and a deterministic pattern so screenshots and reviews are reproducible. It does not randomise statuses.

### What reset removes

`clearDemoData(excludeUserId)`:

- deletes queries, records, sessions and timetables tied to demo classes or demo users;
- deletes enrollments, notifications, device requests and audit rows marked demo;
- deletes demo classes and demo users, **except** the signed-in admin;
- deletes the `DEMO-101` room.

It uses `$or` filters so an object is removed if either its own `isDemo` flag is true or it belongs to a demo class/user. That catches a record that was created without the flag but linked to demo data.

The order matters: children are deleted before parents, so a foreign-key-like reference never blocks the delete. MongoDB has no foreign keys, so this is a convention, not a constraint.

### Why demo data is safe

- It is gated to non-production.
- Every seeded document is flagged, so a reset can find it.
- The reset excludes the current admin, so the operator is not signed out mid-action.
- It never touches a real class, session or record.
- It is audited (`admin.demo.seeded`, `admin.demo.reset`).

### What can go wrong

- **A real user is accidentally given `isDemo: true`** → reset would delete them. The admin create route allows setting `isDemo` only in non-production; the UI should make this explicit.
- **A demo record is linked to a real class** → the `$or` filters would delete it. The seed only links to demo classes, so this requires manual database edits.
- **Seeding twice** → the first call's data is cleared, so there is only one set. The response reports what was created.
- **Production flag confusion** → the route returns 404, not 403, so a production client sees "not found". This is intentional surface reduction, but it can confuse an operator who expects a disabled message.
- **Settings still point at demo term** → seeding uses `settings.termName` for the timetable; changing the term later does not rewrite the demo slots.
# Part VIII — The frontend

The backend decides what is true; the frontend decides what a person can see and do. This part walks through the React application page by page, with the hooks, network calls and state transitions that connect the screens to the API. It is not a CSS manual. It explains why each screen exists, what it fetches, what it refuses to do, and how it fails.

## 69. The app shell, routing and design system

### Routing

`src/App.js` defines the entire route table with React Router:

```jsx
<BrowserRouter>
  <ToastProvider>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      ...
      <Route path="*" element={<NotFound />} />
    </Routes>
  </ToastProvider>
</BrowserRouter>
```

There is no route-level code splitting. The production bundle is one application. For a prototype with this many pages, that keeps the build simple and avoids a loading flash between screens. The cost is a larger initial download.

The route list is intentionally explicit. There is no generated route table, because the access rules and page props differ too much to generalise. The route paths are the same paths documented in chapter 41.

### The shell

Pages that require a session render inside `AppShell`. The shell provides:

- the brand and a link to the signed-in dashboard;
- a role-aware navigation list from `ui/navigation.js`;
- a notification bell with an unread count, polled every 60 seconds;
- an account menu with profile, notifications and sign-out;
- a theme toggle;
- an offline banner driven by `navigator.onLine` and the `online`/`offline` events;
- an install banner driven by `beforeinstallprompt` and a localStorage dismissal flag;
- an impersonation banner with a **Stop impersonating** action;
- a mobile menu, a desktop overflow ("More") menu, and keyboard handling for Escape;
- an outlet area for the page content.

`roleLinks(role)` returns a different list per role. `mergeLinks` combines page-specific links with the role list, de-duplicates by `to`, and preserves order. The first six links are primary; the rest go into the overflow menu. `isLinkActive` treats `/teacher/classes/extra` as active for `/teacher/classes`, but not `/` for every path.

The overflow menu is rendered through `createPortal` into `<body>`. Without the portal, the horizontally scrollable navigation container would clip the menu. Its position is recomputed on resize and scroll, and it closes on Escape or an outside click.

### The design system

`src/ui` contains small, unopinionated components:

| Component | Purpose |
| --- | --- |
| `AppShell` | Navigation, account menu, notifications, banners |
| `Brand` | Logo and wordmark |
| `Button` | Variants (`primary`, `secondary`, `soft`, `ghost`, `danger`), loading state, sizes |
| `Card` | Titled content panel |
| `Badge` | Status pill with variants (`success`, `warning`, `danger`, `info`, `neutral`) |
| `Field` | Label, hint, error and input wrapper |
| `Modal` | Dialog with focus handling and a backdrop |
| `Tabs` | Accessible tab list |
| `StatCard` | Metric with label, value and optional detail |
| `EmptyState` | Icon, title, description and action |
| `Spinner`, `PageLoader` | Loading indicators |
| `Toast` | Transient success/error messages via `useToast()` |
| `Charts` | Lightweight SVG charts (bars, donut, sparkline) built in-house |
| `ThemeToggle` | Light/dark switch persisted in localStorage |
| `navigation.js` | Role link lists and active-path logic |

The charts are hand-built SVG rather than a charting dependency. That keeps the bundle smaller and avoids a library that might inject HTML. The tradeoff is fewer chart types and less polish.

`src/ui/ui.css` holds tokens and primitives. `src/ui/pages.css` holds layout patterns. Page-specific CSS lives beside the page (for example `studentCheckIn.css`). Class names follow a block convention (`checkin__key-panel`, `device-card__title`) so a style can be found by searching the component.

### Theme and first paint

The dark/light preference is applied by `public/theme-init.js`, loaded in `index.html` before React. It reads localStorage and sets a `data-theme` attribute on the document element. Doing this in an external file, rather than an inline `<script>`, is required by the CSP (`script-src 'self'`). Without it, the page would flash the wrong theme on every load.

The toggle writes the preference and updates the attribute. If localStorage is unavailable (private mode), the toggle still works for the session.

### Accessibility

The app uses semantic landmarks, labelled form fields, `aria-label` on icon-only buttons, `role="status"` for live messages, and focus management in modals. Keyboard users can reach the mobile menu, the overflow menu and the notification bell. Escape closes menus and modals.

Known gaps:

- Some chart elements are visual only; the numeric table beside them is the accessible source.
- Colour contrast in the muted text is acceptable but not audited against WCAG AAA.
- The acoustic lab depends on audio; a deaf or hard-of-hearing user cannot use the acoustic path. The manual register and query process remain available.
- There is no dedicated screen-reader announcement when a polling request changes a session state; the changed text is in the DOM but not in a live region.

### What can go wrong

- **Deep link to a protected page** → the page mounts, its session hook gets 401, and it redirects to `/login`. The server never served private data to the shell.
- **API down** → public pages still render; protected pages show an error or redirect. `useSession` treats any failure as signed out, while `useRoleSession` keeps a network error visible.
- **Stale bundle after deploy** → `index.html` is `no-cache`, so the browser fetches the new shell; hashed assets are immutable. A service worker can still serve an old shell until it updates (chapter 79).
- **CSP blocks a new dependency** → the browser console shows the violation; the fix is a policy change, not an inline script.

## 70. Session hooks and API configuration

### The API base URL

`src/config/api.js`:

```js
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000/api/v1";
export default API_URL.replace(/\/$/, "");
```

Create React App only exposes variables prefixed with `REACT_APP_`. The fallback makes local development work with no frontend `.env`. The trailing slash is stripped so callers can always write `${SERVER_URL}/path`.

In the one-service deployment, `REACT_APP_API_URL=/api/v1` is set at build time, so the browser calls the same origin. That is what makes the httpOnly cookie first-party and SameSite=Lax sufficient.

### `useSession` — public pages

`useSession` fetches `/islogin` with `credentials: "include"` and an `AbortController`. It returns `{ user, loading }`. Any failure, including a network error, is treated as signed out. That is deliberate: the landing and login pages must render even when the API is down, and a public page must not show a permanent spinner because a session probe failed.

The hook aborts on unmount, so a fast navigation does not set state on an unmounted component.

### `useRoleSession` — protected pages

`useRoleSession(allowedRoles)` is the shared loader for signed-in pages:

1. `GET /islogin` with `withCredentials: true`.
2. No user → `navigate("/login")`.
3. Role not in the allowed list → `navigate(dashboardPath(role))`.
4. 401 → `/login`.
5. Other error → keep the page mounted with an error message.
6. On success, return `{ user, loading, error, logout }`.

The `allowedKey` is the joined role list, used as the effect dependency so the effect does not re-run on every render from a new array. The hook does not cache the user globally; each page performs its own check. That is one request per page mount, which is acceptable for this scale and avoids a global store that could go stale after a role change.

The server is still the authority. A user who edits the React state or calls the API directly gets 401/403 from the server. The hook is a usability guard, not a security boundary.

### Fetch versus axios

The codebase uses both:

- `fetch` in small public helpers (`useSession`, the Google credential exchange, dev login) where no interceptors are needed;
- `axios` in pages that need `withCredentials`, JSON parsing and `error.response.data.message`.

There is no global axios interceptor. Each page reads the server's message and falls back to a generic one. That is more repetitive but avoids a hidden redirect loop: a global 401 interceptor would also fire for `/islogin`, which is expected to return 401 on public pages.

### Logout

`useRoleSession.logout` posts to `/logout` and navigates to `/`. A failed request is ignored; the local session ends either way. This is honest: the cookie may remain if the network failed, but the UI has left the private page. The server-side logout only clears cookies; it does not revoke the token. "Sign out everywhere" is a separate profile action (`POST /profile/sessions/revoke`).

### What can go wrong

- **CORS or cookie misconfiguration** → `/islogin` returns 401 even after a successful sign-in. Check `CLIENT_URL`, `COOKIE_SAMESITE`, `Secure`, and whether the frontend and API share an origin.
- **Wrong `REACT_APP_API_URL`** → the build calls a different host; cookies are cross-site and may be blocked.
- **Expired session while a page is open** → the next API call returns 401; the page shows the server message. It does not automatically redirect unless the page handles it.
- **Role changed mid-session** → the next `/islogin` returns the new role; the current page may still render until it refetches. API calls are already scoped to the new role.
- **API down** → public pages render; protected pages show an error. `useRoleSession` does not loop retries.

## 71. The login and landing pages

### The landing page

`Home` uses `useSession` to decide between two states:

- signed out: a product explanation and **Sign in** links;
- signed in: a role-aware action to the correct dashboard.

It does not fetch attendance or any private data. The page is public and cached as part of the shell.

### The Google button

`GoogleSignInButton` loads Google Identity Services and renders the official button. On success, Google calls back with a signed ID token (`credential`). The login page posts it to `/auth/google`:

```js
fetch(`${SERVER_URL}/auth/google`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ credential }),
});
```

The response sets the httpOnly cookie and returns the user profile. The browser never sees the JWT. If the response is not ok, the page shows `data.message`.

### Device binding after sign-in

After a successful sign-in, the login page calls `getOrCreateDevicePublicKey()` and then `POST /device-bindings/claim`:

- a brand-new key is generated in the browser and stored in IndexedDB;
- an existing key is reused;
- the server replies `approved`, `review` or `unbound`;
- the page navigates to the dashboard with `state: { deviceStatus }`.

This means a student's first sign-in on a new browser immediately asks a teacher to approve the device. The student can still open the dashboard and the acoustic lab while waiting; proof submission is blocked.

The device key is generated with:

```js
crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign", "verify"]
)
```

`extractable: false` is passed for the key pair. The code then exports only the **public** key as a JWK. The private key stays in IndexedDB as a `CryptoKey`. It is not exportable through `crypto.subtle.exportKey`. A script running on the origin could still call `sign` with it, which is why CSP matters.

### Dev sign-in

When the API is running with `DEV_AUTH_ENABLED=true` and `NODE_ENV` is development/test, the login page fetches `/auth/dev/accounts` and shows a one-click persona list. Each button posts a persona key to `/auth/dev/login`.

The picker is hidden in a production build (`process.env.NODE_ENV`), and the backend route is not mounted in production. Two independent gates: the UI does not show it, and the server would 404 it.

The dev login also performs the device claim. Dev and test accounts are auto-approved, so a two-phone rehearsal does not need a teacher review for every browser.

### Redirects

- an existing session on `/login` → `navigate(dashboardPath(role), { replace: true })`;
- success → the same dashboard;
- no session on a protected page → `/login`;
- wrong role on a protected page → that role's dashboard.

`replace: true` prevents the login page from staying in the back stack after a successful sign-in.

### What can go wrong

- **Google client ID missing** → the API returns 503; the button may still render but the exchange fails.
- **Popup blocked** → Google's button flow may fail before the callback. The page shows the error from the library or a generic message.
- **Third-party cookies blocked** → in a split deployment with SameSite=None, some browsers still block. The single-origin deployment avoids this.
- **IndexedDB unavailable** → the device key cannot be created; the page shows the error and the student cannot submit proof. Reading attendance still works.
- **Browser clears site data** → the key is gone; the next claim creates a new fingerprint and requires teacher approval.
- **Dev accounts visible in production** → impossible through the UI gate, but a misconfigured `NODE_ENV` could expose the backend route. Startup validation refuses dev auth in production.

## 72. The student dashboard and check-in page

### The dashboard

`StudentDashboard` loads four things in parallel where possible:

1. `/islogin` for the user;
2. `/device-bindings/status` for the device state;
3. `/student/check-in-sessions/active` for live sessions;
4. `/attendance/me` and `/attendance/me/sessions` for the summary and recent history.

It renders:

- a device card with one of `checking`, `unbound`, `review`, `approved`;
- a live-session card when a teacher has an active session;
- attendance metrics (percentage, present, absent, pending, queries);
- a recent-activity list with status badges and query state;
- links to check-in, attendance, queries and help.

A device in `review` state shows "waiting for teacher approval" and still allows the acoustic lab. A device in `unbound` state prompts a bind action (which happens automatically on the next login claim). The dashboard never shows a key and never marks attendance.

If the attendance request fails, the page still renders the device card and live session. The failure is shown in the relevant card, not as a full-page error. That is a deliberate resilience choice: a student can still check in even if the analytics endpoint is slow.

### The check-in page

`StudentCheckIn` is the most safety-sensitive screen. It has five states:

1. **Loading** — resolving the session and the device status.
2. **No live session** — a waiting state with a refresh button and a discovery poll.
3. **Blocked** — not on the roster, device not approved, pending change, consent not given, or the key expired.
4. **Listening** — microphone open, decoding the current wave.
5. **Evidence recorded** — the server accepted the proof; the card says "Evidence recorded", not "Present".

### Discovery

The page polls `/student/check-in-sessions/active` every 10 seconds (`DISCOVERY_INTERVAL_MS`). When a session appears, it selects the newest one and displays the class, room, wave and key expiry. When the session disappears or closes, the page stops listening.

The poll is aborted on unmount. It does not start the microphone automatically; the student must press **Join** after acknowledging the consent notice. This is both a browser requirement (audio capture needs a user gesture) and a privacy choice.

### The consent notice

Before the microphone opens, the page shows a plain-language notice:

- audio is processed on this phone;
- raw audio is never sent;
- the server receives the session, wave, decoded key and a signature;
- evidence is not attendance;
- location is optional and a denial never blocks check-in.

The **Join** button is disabled until the checkbox is ticked. Once evidence is recorded, the checkbox and button are disabled, so a student cannot accidentally start a second capture for the same wave.

### The audio pipeline

`useCheckInAudio` mirrors the tested receiver lab:

1. Require a secure context (`window.isSecureContext`) and `navigator.mediaDevices.getUserMedia`.
2. Create an `AudioContext`.
3. Run the sample-rate gate (`evaluateContextSampleRate`, then `evaluateSampleRateGate` with the track's reported rate).
4. Request mono audio with echo cancellation, noise suppression and auto gain **off**. Those features are designed for speech and can distort an FSK tone.
5. Load `pcm-capture-worklet.js` and create an `AudioWorkletNode` with a chunk size of 4096.
6. Connect the microphone source through the worklet to a silent gain node, so the graph runs without echoing to the speaker.
7. Append each PCM chunk to a rolling buffer.
8. Every 700 ms, call `extractNextFrame` over the newest ~3 seconds of audio.
9. On a valid frame, stop the microphone, release the wake lock, and call the page with the decoded frame.
10. Stop after 60 seconds (`LISTEN_LIMIT_MS`) even if nothing was decoded.

The page also stops listening when the tab becomes hidden. Mobile browsers suspend audio in the background; continuing to claim "listening" would be false. The error message tells the student to keep the page visible.

### From frame to proof

The frame contains data digits. `digitsToValue` converts them to the integer key. The page then:

1. Builds the message with `buildProofMessage({ sessionId, wave, key, studentId })`.
2. Signs it with `signDeviceMessage(message)`, which reads the private key from IndexedDB and calls `crypto.subtle.sign` with ECDSA P-256 / SHA-256.
3. Submits:

```json
{
  "wave": 0,
  "key": 123456789,
  "signature": "<base64>",
  "location": { "latitude": 22.78, "longitude": 86.14, "accuracy": 12 }
}
```

4. Parses the response with `evidenceFromResponse`, which keeps `wave`, `recordedAt`, `duplicate` and `attendanceDecided`.

The page never displays the key. It shows the wave and the time. If the key expires before submission, the server returns 409 and the page asks the student to wait for the next wave. If the teacher advances the wave while the phone is listening, an effect compares `selectedSession.wave` with the wave the capture started on and stops the capture, so the phone cannot submit a frame from the old key.

### Optional location

`getCurrentLocation` wraps `navigator.geolocation.getCurrentPosition` with a timeout and high accuracy. The page calls it before submission but treats a denial or failure as non-fatal: the proof is still submitted without a location, and the evidence card says location was not captured. The server also treats location as optional.

This separation is deliberate. A student in a basement classroom with no GPS should not be blocked from proving they heard the tone.

### The evidence card

The card shows:

- **Evidence recorded** (or **Already recorded** for a duplicate);
- the wave;
- the time the server recorded it;
- a note that this does not decide attendance;
- a reminder that a teacher owns the register and the student can raise a query if needed.

It does not show "Present", a score, a confidence, or an attendance status. That is the evidence-only contract expressed in the UI.

### What can go wrong

- **No microphone permission** → the browser error is mapped to a readable message; the student can retry.
- **Insecure context** → the page refuses to start and explains HTTPS/localhost.
- **Wrong sample rate** → the gate blocks before decoding, with a message about the device/browser. A silently aliased decode would be worse than a clear refusal.
- **Tone too quiet** → the decoder finds no frame; the listen timer ends and the student retries. The 9 dB margin is the guard against a false decode.
- **Key expired** → the server rejects; the page tells the student to wait for the next wave.
- **Wave advanced** → the page stops the old capture and asks the student to listen again.
- **Device not approved** → the page blocks submission and explains the teacher review. The acoustic lab remains usable.
- **Two tabs listening** → both could decode and submit; the unique `(session, student, wave)` index makes the second a duplicate. The UI may show two evidence cards, but only one proof exists.
- **Network failure during submit** → the page shows an error and allows a retry. The server's duplicate rule makes the retry safe.
- **Phone sleeps** → the visibility handler stops capture; the student must rejoin.

## 73. The teacher dashboard and class management

### The dashboard

`TeacherDashboard` greets the teacher, shows class and student counts, the pending device-review count, and quick actions to classes, check-in, sessions, analytics and queries. It is a navigation hub, not a control panel: it does not start a session or mark attendance.

The counts come from `/classes` and `/device-reviews`. A failure in one card does not blank the page; each section shows its own error.

### Class management

`ClassManagement` combines four jobs on one screen:

1. **Rooms** — list and create a room.
2. **Classes** — list owned classes and create one with a course code, title, section and room.
3. **Roster** — select a class, load its active roster, paste or edit text, preview, then save.
4. **Device reviews** — approve or reject a student's pending browser.

### Roster editing

The page keeps:

- `rosterText` — the editable textarea;
- `preview` — the server's parsed entries and errors;
- `roster` — the currently saved active enrollments;
- request ids in refs (`rosterRequestRef`, `previewRequestRef`, `pdfRequestRef`).

The request ids solve a real race: a teacher clicks class A, then quickly class B. The response for A may arrive after B's and overwrite B's roster. Each load increments a counter; a response whose id is no longer current is ignored. The same pattern protects preview and PDF extraction.

The flow is strict:

1. **Preview roster** posts the text to `/classes/:id/roster/preview`. It writes nothing.
2. The preview panel shows accepted rows, line-numbered errors and counts.
3. **Save roster** is enabled only when there are no errors and at least one entry.
4. Saving posts the **original text** to `PUT /classes/:id/roster`; the server re-parses it. The client does not send the parsed entries, so a stale preview cannot become the save payload.
5. On success, the page reloads the roster and clears the preview.

This is the two-step confirmation pattern: the teacher sees what will be saved before saving it. The preview is not a dry-run of a hidden import; it is the same parser.

### PDF roster extraction

The roster panel accepts a PDF file. The client checks the MIME type or `.pdf` extension, sends it as multipart to `/classes/:id/roster/pdf/preview`, and shows the extracted text in the textarea.

The client helpers in `utils/rosterImport.js`:

- `isPdfFile` accepts `application/pdf` or a `.pdf` name;
- `extractionSummary` says how many pages and college emails were found;
- `importErrorMessage` maps `pdf_no_text_layer`, `pdf_password_protected`, `pdf_too_many_pages`, `pdf_too_much_text` and the generic server message to readable copy.

The extracted text is **not** auto-parsed into entries and **not** auto-saved. The teacher must run **Preview roster** and then **Save**. A scanned PDF is rejected with "local OCR is not built yet"; the teacher can paste or use CSV instead.

### Device reviews

The review queue loads `GET /device-reviews`. Each item shows the student's name, email, fingerprint and request time. **Approve** and **Reject** post `{ decision }` to `/device-reviews/:reviewId`.

A decision is confirmed by a modal, because it changes which browser can submit proof. On approve, the student's old device (if any) is signed out by a token-version bump. On reject, the pending request is closed and the student must try again.

The queue is teacher-scoped on the server. The client does not filter by class; it displays exactly what the server returned. A super-admin uses the admin console's user view instead.

### What can go wrong

- **Pasting a huge roster** → the 200 KB JSON limit or the parser limits reject it; the page shows the server message.
- **Preview errors** → the save button stays disabled. The teacher must fix the lines, not bypass the check.
- **PDF with no text layer** → a clear message, no partial extraction.
- **Switching classes mid-request** → the request-id guard discards the stale response.
- **Two teachers review the same device** → the second decision gets 404 because the request is no longer pending. The page shows the message and refreshes.
- **A student with no classes** → the device queue is empty except for test students. That is the server's rule, not a UI bug.

## 74. The teacher check-in screen

### Layout

`CheckInSessions` has three regions:

1. **Class and live session** — pick a class, start a session, or resume the active one.
2. **Key panel** — the current wave, the key, a two-minute countdown, **Copy key**, **Open transmitter**, **Advance wave** and **Close session**.
3. **Evidence and history** — live proof rows grouped by wave, and closed sessions for the class.

A session attendance modal opens the register for marking and finalising.

### Starting

**Start check-in** posts to `/classes/:id/check-in-sessions`. The button is disabled while the request is in flight. On success, the response's session becomes the active session, the key panel appears, and the countdown starts.

If the class has no default room, the server returns 409 and the page shows the message. If a session is already active, the page loads it instead of creating a second one.

### The key panel

The key is displayed as a large number. It is the teacher's secret to transmit, not a student credential. The panel shows:

- `Wave N`;
- the key;
- a badge: "Expires in mm:ss" or "Key expired";
- **Copy key** for manual transmitter entry;
- **Open transmitter**, which navigates to `/acoustic-tx?key=<key>&from=checkin`;
- **Advance wave**, with a confirmation modal;
- **Close session**, with a confirmation modal.

The countdown is computed from `keyExpiresAt` on every render tick. `keyIsUsable` also checks the session is active and the key is a valid integer. When it expires, the transmitter button is disabled and the panel tells the teacher to wait for evidence, then advance or close.

### Advancing

**Advance wave** is not a blind increment. The server refuses unless at least one proof exists for the current wave. The page opens a confirmation modal that explains:

- the current key stops being accepted;
- a fresh two-minute key is minted;
- students must listen again.

On success, the page replaces the session from the response. It does not increment the wave locally. On 409, it shows the server message ("Wait for a phone to submit evidence first") and refreshes the session.

This is the acoustic progress rule expressed in the UI: a wave exists because someone heard it.

### Evidence

The evidence panel polls `GET /check-in-sessions/:sessionId/proofs`. It shows:

- total proofs;
- a per-wave count;
- each proof's student email, wave and recorded time.

It deliberately does not show the signature, the key, the fingerprint or a "present" badge. The footer says: "Evidence only. This list does not decide attendance, and proof evidence expires."

The poll stops when the session closes or the teacher leaves. A failed poll leaves the last known list and shows an error; it does not mark anyone present.

### Closing

**Close session** asks for confirmation. On success:

- the status becomes `closed`;
- the key stops being accepted;
- the query window starts;
- the session appears in history.

Closing twice is safe: the server returns the same closed session and does not write a second audit entry.

### The register modal

`SessionAttendanceModal` loads `GET /check-in-sessions/:sessionId/attendance`. It shows one row per roster student with:

- name, roll number, email;
- status (`pending`, `present`, `absent`, `excused`);
- source (`manual`, `query`, `auto`, `override`, `pending`);
- evidence count and waves;
- attempt and teacher location distance, if both exist;
- the linked query, if any.

The teacher can set a status and a note per row. **Save changes** sends a batch to `PATCH /check-in-sessions/:sessionId/attendance`. The page sends only the rows that changed.

**Finalise attendance** is enabled after the session is closed. It converts every remaining `pending` row to `absent` with `source: "auto"`, marks the session finalised, and notifies students. The confirmation text says this explicitly, because auto-absent is a consequential action.

After finalisation, the table still allows edits. The header shows the finalisation time and actor, and any later edit is audited. The page does not pretend the register is locked.

### History

The history list shows closed sessions for the selected class, newest first. Each row shows the date, room, wave, roster count and a link to the register. It is read-only except through the modal.

### What can go wrong

- **Two tabs open** → both may show the same active session. Advancing from both produces one winner and one 409.
- **Countdown drift** → the countdown is based on server timestamps; a client clock that is minutes off can display the wrong remaining time. The server still enforces expiry.
- **Key copied to the wrong place** → the key is not secret from the teacher, but pasting it into a public chat would let anyone transmit it. The UI cannot prevent that.
- **Evidence poll fails** → the list is stale; the teacher can retry. The server remains the source of truth.
- **Register round limit** → the API accepts up to 500 rows per batch; the UI sends only changed rows, so a normal class is far below that.
- **Finalise on an active session** → the button is disabled and the server returns 409 if called directly.
- **Session closed while the modal is open** → marking still works (marking is allowed after close); finalising becomes available after a refresh.
## 75. Attendance analytics, session history and the query centre

### The shared analytics page

`AttendanceAnalytics` adapts to the role returned by `useRoleSession`:

- **student** — loads `/attendance/me` and `/attendance/me/sessions`, then shows the overall percentage, per-class cards, recent sessions and the last 50 queries;
- **teacher** — loads `/classes`, then `/attendance/classes/:classId/overview` for the selected class, with a student table, a trend chart, session summaries and query counts;
- **super-admin** — loads `/admin/classes`, can switch across every class, and can open a student's detail.

The teacher view also has a per-student detail panel backed by `/attendance/classes/:classId/students/:studentId`, where the id is the student's email (URL-encoded).

The page is read-only. It has no status controls and no save action. The **Open exports** button navigates to the export centre, where the same data can be downloaded with an audit entry.

### What the charts show

- **Trend** — one point per closed session, with the percentage of decided records. Pending rows lower the denominator rather than counting as absent; the point also carries present/absent/pending counts.
- **Class summary** — total, decided, percentage, class average, sessions and finalised count.
- **Student table** — present/absent/pending/excused/total and percentage, sorted by roll number then email.
- **Query counts** — pending, approved, rejected, expired.

The empty states are explicit: "No attendance records yet" or "No students on this roster". A percentage of `null` is rendered as "—", never as 0%.

### Session history

`SessionHistory` is used by teachers and super-admins. It has two tabs:

1. **Sessions** — filters by class, status, from and to. A teacher sees only their own sessions; a super-admin sees all and can filter by class. Each row shows the class, room, date, status, wave, roster count, present/absent/pending, finalisation and query-window state. Clicking a row opens `SessionAttendanceModal`.
2. **Audit trail** — a teacher sees `/audit/me`; a super-admin sees `/admin/audit`. The list is newest first and can be searched by action, actor email, summary or entity id. A super-admin's search is passed as `q`; the teacher route has no text search, so the field is hidden or ignored for them.

The audit timeline uses `EventTimeline` to render a readable event per entry. It is a view of the chain, not a verifier; chain verification lives in the admin console.

The modal is the same register component used by the check-in screen. It can mark, finalise and open a linked query. A super-admin's edits go through the admin override/delete routes, not the teacher route, because the teacher route requires ownership.

### The query centre

`QueryCenter` has the most role-dependent layout in the app.

**Student view**

- **My queries** — the last 200 queries with status, reason, expiry, decision note and a detail modal.
- **Sessions you can query** — `/attendance/me/sessions`, showing only sessions where `canRaiseQuery` is true, plus sessions where a query already exists.
- **Raise a query** opens a form with a reason (10–1000 characters), an optional note, and an optional location button.
- The location button calls `getCurrentLocation`; a denial leaves the location empty and says so. If the server requires a location (`requireQueryLocation`), the create request returns 400 and the page shows the message.

The student cannot edit a query after creation. The only path is a teacher reopen, after which the student can see the new state.

**Teacher and super-admin view**

- Tabs for **Pending**, **Approved**, **Rejected**, **Expired** and **All**.
- A class filter (the teacher's own classes; all classes for a super-admin).
- A query list with the student, class, session date, reason, distance/radius, location availability and status.
- A detail modal with the full evidence: teacher location, attempt location, student location, distance, within-radius flag, the student's reason, the decision note and the last 30 audit entries.
- **Approve** and **Reject** buttons with a note field. The approval warning says explicitly that approving changes the register.
- **Reopen** for an approved or rejected query, with a note. Reopening gives a fresh window and clears the previous decision fields.

The page never decides a query locally. It posts the decision, uses the response, and reloads the lists. This matters because approval also changes the attendance row and writes an audit entry; a local optimistic update could show a state the server rejected.

### The query detail contract

The detail response includes both the query and its audit trail. The page uses:

- `detail.query` — the current status, reason, locations, distance, decision, reopen count;
- `detail.audit` — the timeline.

If the query belongs to another teacher, the server returns 403 and the page shows the error. It does not hide the id in the URL; the server is the guard.

### What can go wrong

- **A query expires while the teacher is reading it** → the next reload shows `expired`. An expired query can still be decided; the page keeps the buttons available.
- **Two teachers decide the same query** → the second gets 409 ("already decided"); the page shows the message and reloads.
- **Approving after a manual present** → the row is set to `source: "query"`, overwriting the teacher's manual source. The audit records both actions. This is a real precedence choice: a query approval is the latest decision.
- **Location denied** → the distance is null; the teacher sees "no location" and decides on the reason. If the setting requires a location, the query could not have been created.
- **Student removed from the roster after the query** → the query remains decidable; the attendance row is the historical link.
- **A reopened query** → it returns to `pending` and appears in the pending tab. The previous decision note is cleared, but the audit still contains it.

## 76. The export centre, notifications, profile and help

### The export centre

`ExportCenter` is available to teachers and super-admins. It loads the class list and the teacher's sessions to populate two selectors, then offers:

- attendance workbook and PDF (a class is required);
- query workbook and PDF;
- session workbook and PDF (a session is required);
- for a super-admin only: the user directory and the audit log workbook.

The download helper uses `fetch`, not a plain link:

```js
const response = await fetch(`${SERVER_URL}${path}`, { credentials: "include" });
if (!response.ok) { /* parse JSON error */ }
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = filename;
link.click();
URL.revokeObjectURL(url);
```

Why not `window.open`? A plain navigation would show a JSON error page if the server rejected the request, and the page could not show a toast. The fetch path keeps the error in the app, reads the filename/content type, and creates a temporary object URL. The URL is revoked after the click.

The fallback filename is client-side only; the server also sets `Content-Disposition`. The browser generally prefers the server's filename when it is present.

The date fields are optional. Empty dates mean the configured term range. The query exports have no class filter in the UI; the server scopes them to the teacher's classes.

### Notifications

`Notifications` loads `GET /notifications?limit=...`, shows unread first (or filters to unread), and offers:

- **Mark all read**;
- **Mark one read**;
- **Clear read** (deletes only rows with a `readAt`);
- click-through to the notification's `link`.

The list is scoped to the signed-in user by the server. A notification from another account cannot be marked or read. The page polls nothing; it loads on mount and after an action. The shell's bell polls a six-item preview every 60 seconds, so the unread count stays roughly current without a second full list.

### Profile

`Profile` loads `/profile` and allows editing:

- full name (required, max 80);
- phone label (max 80);
- roll number (max 40).

The role, email, status and device binding are read-only. The page shows the role badge and, during impersonation, a banner naming the admin. A **Sign out everywhere** action posts to `/profile/sessions/revoke`, which bumps `tokenVersion`, clears the cookies and sends the user to `/login`.

The profile update is deliberately not audited; it does not change authorisation or attendance. The revoke action is audited as `session.revoked_all`.

### Help

`Help` is a static, role-aware page. It explains:

- how check-in works, including the evidence-only boundary;
- what to do when the key expires or the device is under review;
- how queries work and their 24-hour window;
- how teachers start and close sessions, advance waves and finalise;
- how the acoustic lab is used;
- common troubleshooting steps (microphone, HTTPS, sample rate, device approval).

It is static because it must render even when the API is down. It does not fetch the user's live state; the dashboard and check-in page do that.

### What can go wrong

- **Export fetch returns 401** → the page shows the server message; the user may need to sign in again.
- **Blob download blocked by a popup blocker** → the click is programmatic but not a popup; most browsers allow it. A very strict browser may require a direct user gesture, which the button click provides.
- **Large export** → the browser holds the blob in memory. A very large workbook can be slow; the server-side limits are the practical bound.
- **Notification link to a deleted record** → the target page shows its own not-found state.
- **Profile save with an empty name** → 400; the page keeps the form and shows the message.
- **Revoke sessions** → the current cookie is cleared, so the next request is 401. The page navigates to login.

## 77. The timetable page and PDF preview modal

### The weekly grid

`Timetable` renders seven day columns. `DAYS` is a shared constant, with Sunday = 0 to match the model. Each slot shows the start–end time, the class code, the title, the room, and, for a super-admin, the teacher's name.

Students see only slots for classes where they have an active enrollment. Teachers see their own slots. A super-admin sees all. The server enforces this; the page also filters defensively for a super-admin's class list.

### Editing

`canEdit` is true for teachers and super-admins. **Add slot** opens a modal with:

- class (from `/classes` or `/admin/classes`);
- day of week;
- room (optional; defaults to the class room);
- start and end time (`type="time"`, which yields `HH:MM`);
- term (defaults to the settings term).

The modal submits `POST /timetable` or `PATCH /timetable/:id`. A delete button appears in edit mode with a confirmation. The page reloads the list after each change; it does not splice local state, because the server may normalise the term or room.

The helper text says: "Starting a check-in is always an explicit teacher action. A timetable slot never starts a session or marks attendance on its own." That sentence is part of the product contract.

### The PDF preview modal

**Preview timetable PDF** opens a file picker. On selection, the page posts the file to `/timetable/pdf/preview` and opens a modal showing:

- the file name;
- page count and line count;
- a read-only monospace text panel;
- a notice that nothing was scheduled and no attendance changed;
- a note that structured row parsing is not built until representative samples are supplied;
- a **Close preview** button only.

There is no **Import** button. The teacher reads the text and uses **Add slot** for each row. A scanned PDF returns `pdf_no_text_layer`; the modal shows the mapped message.

The client helper `utils/timetableImport.js` mirrors the roster helper: `isPdfFile`, `extractionSummary` ("Extracted N pages and M lines. Nothing has been scheduled…") and `importErrorMessage` for the stable PDF codes.

### Why the UI is deliberately plain here

A timetable importer is where a demo can look magical and a real deployment can silently corrupt a term. The page therefore shows text, not inferred rows. It cannot create classes, cannot write slots from the PDF, and cannot start attendance. The only path from the preview to the database is the teacher's own **Add slot** action.

### What can go wrong

- **No classes** → **Add slot** is disabled with a message to create a class first.
- **Time validation** → the server rejects an end time before the start; the modal shows the message.
- **Room list empty** → the room is optional; the class default is used. If the class has no room, it could not have been created.
- **Super-admin creates a slot** → it is owned by the class's teacher, not the admin. The admin sees it because super-admins see all.
- **PDF too large or too many pages** → the mapped error appears; no partial preview.
- **Browser file picker accepts a non-PDF** → the server header check rejects it with `pdf_invalid`.

## 78. The acoustic lab, transmitter and receiver

### Why the lab is public

The lab measures whether a phone can emit and hear the high-frequency probes. It does not read attendance or expose student data. Requiring sign-in would make it impossible to test a phone before college accounts are configured. The transmitter can accept a key from the teacher screen, but the key is already visible to the teacher; the public page does not grant session access.

### The acoustic lab

`AcousticLab` is a local, speaker-to-microphone self-test. It:

1. Explains the safety rules: low volume, short runs, stop if uncomfortable, do not point the speaker into an ear.
2. Checks the audio context sample rate. A rate too low to represent the probes safely is blocked with a clear message.
3. Requests microphone access with echo cancellation, noise suppression and auto gain off.
4. Plays seven brief probe tones at `PROBE_FREQUENCIES`, including coarse and codec-edge bands.
5. Measures the microphone level at each frequency with the same Goertzel-based detector used by the receiver.
6. Establishes a baseline for each probe, then runs a sweep and compares each result to the baseline.
7. Reports a per-frequency margin and a verdict from `getVerdict(margin)`.
8. Shows missing data as "—", never a fake −120 dB.
9. Allows a report copy/download so a tester can attach it to a bug report.

The lab distinguishes:

- **codec-edge** frequencies — near the edge of what the browser/OS codec may preserve;
- **coarse** frequencies — lower, more likely to survive.

The result is a capability check for one phone at close range. It is **not** a classroom-distance test. A phone that passes the lab can still fail at 5 m; the lab only rules out a device that cannot hear the band at all.

### The transmitter

`AcousticTransmit`:

- accepts `?key=<decimal>&from=checkin`;
- validates the key (`0..MAX_KEY_VALUE`) and repeats (1–100);
- builds a transmission plan with `buildTransmissionPlan`;
- encodes the key to 7 data digits, builds the FSK frame at the context sample rate, and schedules repeated buffers through the Web Audio graph;
- shows the planned frames, the elapsed time and the current phase;
- provides **Copy receiver link**, which encodes the run id and conditions into the RX URL;
- can stop immediately and close the audio context.

The frame is the same `encodeFrame` used by the tested codec. The transmitter does not listen, does not verify, and does not know whether any phone decoded. Its report is a claim about what it played.

The run id is a random, URL-safe string. It exists only to pair the two reports; it is not a security token.

### The receiver

`AcousticReceive`:

- reads `?run=<id>&distance=...&room=...&notes=...`;
- generates a run id if none was supplied, and warns that the IDs will not match;
- requests microphone access with the same audio constraints;
- loads `pcm-capture-worklet.js`, appends chunks to a rolling buffer;
- runs `extractNextFrame` on an interval;
- accumulates decoded keys (last 200), counts frames and tracks the last margin;
- computes a decode rate against the planned repeat count;
- shows the run conditions, the device/user agent, the elapsed time and the report.

The receiver never sends audio anywhere. The report is generated locally as text and JSON. The **Copy transmitter link** and **Copy receiver link** utilities make it possible to run the two phones with matching metadata.

### The link arithmetic

The transmitter's plan determines how many frames are sent and how long the run lasts. The receiver's decode rate is:

```text
decodeRate = decodedFrames / plannedFrames
```

A rate below 1 means some frames were missed. The report includes the distance, room, notes and last margin so a failure can be diagnosed rather than guessed. The 9 dB detection margin is the same rule used by the student check-in decode.

### What can go wrong

- **No microphone permission** → the lab and receiver show a readable error; nothing is recorded.
- **Insecure context** → the page refuses to start.
- **Sample rate gate fails** → the page blocks rather than risk aliasing.
- **Phone speaker cannot reproduce the high band** → the lab shows a low/absent level at those probes; the transmitter will be inaudible to that phone.
- **Phone microphone rolls off the high band** → the lab shows it; no amount of volume fixes a hardware roll-off.
- **Two phones at different distances** → the receiver's report records the distance; the result is only meaningful with that context.
- **Browser resamples** → the context and track rates are recorded; a mismatch is a warning sign.
- **Tab backgrounded** → audio capture may stop; the receiver's running state becomes stale. The page is designed for foreground use.

## 79. The service worker and offline behaviour

### What is cached

`public/sw.js` is a production-only service worker registered from `src/index.js` when `process.env.NODE_ENV === "production"` and the browser supports it. It caches only the static shell:

```text
/, /index.html, /manifest.json, /theme-init.js,
/icon-192.png, /icon-512.png, /apple-touch-icon.png
```

The cache name is versioned (`bioattend-shell-v2`). On activation, every other cache is deleted.

### What is never cached

`isApiRequest(url)` returns true for any path that starts with `/api/` or contains:

```text
/check-in-sessions, /attendance, /queries, /notifications, /islogin
```

Those requests bypass the service worker entirely. This is a security and correctness rule: attendance, keys, proofs, queries and session state must always come from the server. A cached `/attendance/me` could show yesterday's register as if it were current.

The worker also ignores:

- non-GET requests (mutations are never cached);
- cross-origin requests;
- requests outside the app's origin.

### Navigation and assets

For a navigation request, the worker uses **network first**:

1. Fetch the page.
2. On success, clone the response and store it as `/index.html`.
3. On failure, serve the cached `/index.html`, then `/`.

For `/static/...` and the shell files, it uses **cache first**, then network, and stores a successful response. Hashed static assets are immutable, so cache-first is safe. `index.html` is refreshed by the navigation path.

This gives an offline shell: the app opens, the routes render, and API calls fail with their normal error states. It does not give offline attendance. That is intentional.

### Registration

```js
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
```

The registration is after `load`, so it does not compete with the first paint. A failure is ignored; offline support is optional. In development, the worker is not registered, so hot reload and fresh files are never hidden behind a stale cache.

### The headers that make this safe

The Express static layer sends:

- `Cache-Control: public, max-age=31536000, immutable` for `/build/static/...`;
- `Cache-Control: no-cache` for everything else, including `index.html`.

A new deploy produces new hashed asset names, so the old cache entries are harmless. `index.html` is revalidated, so the browser sees the new asset names. The service worker's network-first navigation path does the same at the worker layer.

### What can go wrong

- **Old worker controls a tab after deploy** → the new worker installs and calls `skipWaiting`, but an already-open tab may still run the old shell until reload. A hard reload or closing all tabs fixes it.
- **Cache storage full** → `cache.put` failures are swallowed; the page still works online.
- **API path not matching the deny list** → a new endpoint under a different prefix could be cached if it is a GET and same-origin. The deny list is explicit and must be updated when a new sensitive path is added.
- **Offline mutation** → the request fails; the UI shows an error. There is no offline queue. That is deliberate: queuing a proof or a query and replaying it later would be a correctness and security problem.
- **Private browsing** → service workers and IndexedDB may be unavailable; the app still works online, but device binding may fail.
# Part IX — The acoustic proof, end to end

This part traces one proof from the teacher's speaker to the teacher's register. It is the narrowest and most important path in the product: everything else exists to make this evidence trustworthy or to let a human act on it. The rule that governs every step is simple: **the phone proves what it heard and which approved device heard it; the server records that; the teacher decides what it means.**

## 80. Who knows which key, and when

### The cast

- **The server** mints the key and stores it on the session.
- **The teacher's browser** receives the key from an authenticated teacher-only response and plays it.
- **The teacher's phone speaker** emits the key as sound.
- **The room** hears the sound. Anyone with a working microphone and decoder can recover the key.
- **A student's phone** decodes the key locally, signs it, and sends the signature.
- **The server's proof table** stores the key alongside the signature.
- **The teacher's evidence panel** shows who submitted evidence for which wave, but not the key or signature.

### The timeline

| Moment | Server | Teacher UI | Student phone | Other people in the room |
| --- | --- | --- | --- | --- |
| Session starts | Mints wave 0 key, stores it | Receives it in the create response | Does not know it | Do not know it |
| Teacher opens transmitter | Still stores it | Passes it in the URL to `/acoustic-tx` | Does not know it | Do not know it |
| Tone plays | — | Speaker emits it | May decode it | May hear it; may decode it |
| Student submits | Verifies signature, wave and key | Does not see the submission yet | Knows the key it decoded | May also know it |
| Teacher polls evidence | Returns email, wave, time | Sees an evidence row | Sees "Evidence recorded" | — |
| Teacher advances | Archives the old key, mints a new one | Receives the new key | Must decode again | Must decode again |
| Session closes | Stops accepting new proofs | Sees closed status | Cannot submit a new wave | — |
| Proof TTL expires | Deletes the proof after 24 h | Evidence list no longer includes it | Its local UI is long gone | — |

### What "secret" means here

The key is **not** a password and **not** a bearer token. It is a short-lived, room-local challenge. Its security comes from four properties:

1. It is minted by the server with a cryptographically secure random generator.
2. It is never returned to a student through the API.
3. It expires after two minutes.
4. A proof must be signed by the student's approved device key.

The first three make it hard to obtain remotely; the fourth makes a copied key insufficient without the device. None of them proves the phone was inside the room. A phone in the corridor, a forwarded live audio call, or a replayed recording can still produce a valid decode. That is why the output is evidence, not attendance.

### Who can read the key from the database

The key is stored in plaintext on the `CheckInSession` document and on each `CheckInProof`. It is not hashed, because the server must compare it and the teacher must display it. Anyone with database read access can see current and historical keys. This is acceptable only because:

- the key expires in two minutes;
- a proof also needs a valid device signature;
- the database is the trusted boundary, not an untrusted client.

A production system with a stronger insider threat model might encrypt the key at rest or avoid storing it after the wave closes. That is not built.

### What the student phone knows

Before decoding, the phone knows:

- the session id (from discovery);
- the wave (from discovery);
- its own user id (from `/islogin`);
- its device private key (in IndexedDB).

It does **not** know the key. After decoding, it knows the key for that wave. It cannot ask the server for it. If it submits the wrong key, the server returns a generic mismatch; it cannot use error messages to search efficiently because the key space is 170,859,375 and the route is rate-limited.

### What the teacher's phone knows

The teacher's browser knows the current key because it must display and transmit it. The transmitter URL contains the key in the query string, which means:

- it appears in the teacher's browser history;
- it may appear in a proxy or server access log for the static page;
- it is visible to anyone looking at the teacher's screen.

The query string is not sent to the API; it is read by the static React page. The exposure is accepted because the teacher is the authority playing the key in the room, and the key expires quickly. A teacher should not screen-share the transmitter page or paste the URL into a public chat.

### What the server logs

`logProofOutcome` writes one JSON line per accepted or duplicate proof:

```json
{ "event": "check_in_proof", "sessionId": "...", "studentId": "...", "wave": 0, "outcome": "accept" }
```

It deliberately omits the email, key, signature and fingerprint. Rejections are not logged by this helper. The audit chain does not get an entry for each proof; the proof document itself is the evidence. This keeps the audit chain focused on decisions and administrative actions, while the proof table carries the high-volume acoustic events.

## 81. What the student phone signs

### The exact message

```text
bioattend-proof:v1|session=<sessionId>|wave=<wave>|key=<key>|student=<studentId>
```

The separators are literal `|` characters. The order is fixed. The version prefix is part of the signed bytes. There is no whitespace, no JSON, no trailing newline.

Example:

```text
bioattend-proof:v1|session=665f1c2a9b3e4d0012a4b6c7|wave=2|key=140238871|student=665f1c2a9b3e4d0012a4b6c8
```

`sessionId` and `studentId` are Mongo ObjectId hex strings, which match the `SAFE_ID` pattern. The server rebuilds this string from its own records; it never accepts a client-supplied message.

### What is signed, and what is not

Signed:

- the protocol version;
- the session id;
- the wave number;
- the decoded key;
- the student's user id.

Not signed:

- the timestamp;
- the student's email;
- the device fingerprint;
- the location;
- the session's class id.

Why this is enough:

- **Session id** binds the proof to one check-in. A proof from another session cannot be replayed into this one.
- **Wave** binds it to one key generation. A proof from wave 0 cannot be reused at wave 1.
- **Key** binds it to the acoustic decode. The signature proves the device signed *this* key.
- **Student id** binds it to one account. A signature from student A cannot be submitted as student B, because the server rebuilds the message with B's id and verification fails.
- **Version** allows a future protocol without accepting old signatures.

The timestamp is not signed because the server records `createdAt` when it receives the proof. A client timestamp would be untrusted anyway. Replay is bounded by the wave, the two-minute key life, and the unique `(session, student, wave)` index.

The location is not signed because it is optional supplementary evidence. Including it in the signed message would make a GPS failure block the proof, which the product explicitly avoids.

### The key pair

The browser generates a P-256 ECDSA key pair:

```js
crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign", "verify"]
)
```

- **P-256** is an elliptic curve with a 256-bit field. It is widely supported by Web Crypto and produces small keys and signatures.
- **ECDSA** is a signature scheme: the private key signs, the public key verifies.
- **`extractable: false`** means the private key cannot be exported through `crypto.subtle.exportKey`. It can still be used for signing by code on the same origin.
- The public key is exported as a JWK and sent to the server during binding.
- The private key stays in IndexedDB under the database `attendance-device-keys`, store `keys`, key `student-device-v1`.

### The signature format

Web Crypto produces a raw 64-byte signature: two 32-byte integers `r` and `s`, concatenated. Node's `crypto.verify` defaults to DER, which is a variable-length ASN.1 encoding. The server therefore passes:

```js
{ key, dsaEncoding: "ieee-p1363" }
```

Without this, every valid browser signature would fail. The server also enforces the exact base64 shape `^[A-Za-z0-9+/]{86}==$` and re-encodes the decoded bytes to reject non-canonical input.

### Why the private key never leaves the browser

The binding request contains only:

```json
{ "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." } }
```

The server rejects any JWK containing `d` (the private scalar) with **400** `"Private key material must never be uploaded."` The client never puts the private key in a request, a cookie, localStorage or a log. It is held as a non-extractable `CryptoKey` in IndexedDB.

This is a strong browser-level boundary, not a hardware boundary. Malware with code execution in the browser's origin, a compromised extension, or a rooted device can still ask the key to sign. The design reduces accidental leakage; it does not claim hardware attestation.

### What the signature proves

It proves:

- the signer held the private key corresponding to the public key stored on the account;
- the signed bytes were exactly the server-rebuilt message.

It does **not** prove:

- the device is the student's physical phone (the key could have been copied before binding, or the browser's storage could be cloned);
- the student was in the room;
- the student did not share the key;
- the audio was live rather than a recording.

Those are the honest limits of the evidence.

## 82. What the server checks, in order

The order is a security design, not an implementation accident. Each step is listed with its failure status.

### Step 0 — Route guards

1. **Origin guard** — unsafe request from an unknown origin → **403** before authentication.
2. **Authentication** — no valid cookie/bearer → **401**.
3. **Role** — not a student → **403**.
4. **Rate limit** — more than 60 proof submissions per minute for the account/IP → **429**.

### Step 1 — Body shape

`validateProofPayload`:

| Check | Failure |
| --- | --- |
| Body is a plain object | 400 |
| `wave` integer 0–1,000,000 | 400 |
| `key` integer 0–170,859,374 | 400 |
| `signature` canonical 64-byte base64 | 400 |

A malformed location is ignored, not rejected.

### Step 2 — Session id and existence

- Invalid ObjectId → **404** `"Check-in session not found"`.
- No document → **404**.

### Step 3 — Enrollment

- No active `Enrollment` for the session's class and the caller's email → **403** `"You are not on this class roster"`.

This is a live check, not the roster snapshot. A removed student cannot submit new proof.

### Step 4 — Device binding

- Missing `approvedAt`, `fingerprint` or `publicKeyJwk` → **403**.
- Any pending `DeviceBindingRequest` for the student → **403** `"A device change is awaiting teacher review..."`.

A pending change freezes proof from the old device, so one account cannot have two live devices during review.

### Step 5 — Rebuild the message

- Invalid session/student id, wave or key → **400** `"The proof could not be verified."`

### Step 6 — Verify the signature

- Bad signature, malformed public key, or crypto error → **403** `"The proof signature is invalid for this device."`

The key is the stored public key, not the fingerprint. The fingerprint is an identifier for review, not a verification input.

### Step 7 — Existing proof

- Find `(session, student, wave)`.
- If it exists with the same key → **200 duplicate** (checked before status).
- If it exists with a different key → **409** `"A different proof is already recorded for this wave."`

### Step 8 — Evaluate session and wave

In `evaluateProof`:

| Condition | Result |
| --- | --- |
| Session missing | 404 |
| Existing same key | 200 duplicate |
| Existing different key | 409 |
| Session not `active` | 409 `"This check-in session is closed."` |
| `wave` not the current wave | 409 `"This wave is no longer current."` |
| Key not fresh (`now >= keyExpiresAt`) | 409 `"The current wave key has expired."` |
| Key not equal to the session key | 400 `"The decoded key does not match the current wave."` |
| All pass | Accept |

The freshness check before key equality is deliberate. After expiry, a correct key and a wrong key both return 409. If equality were checked first, an attacker could distinguish "right key, expired" from "wrong key" and use the error as an oracle.

The duplicate check before status is also deliberate. A phone that retries after the session closes should see success for evidence the server already accepted, not a confusing failure.

### Step 9 — Create

- Insert the proof with the stored fingerprint, protocol version and optional location.
- A unique-index collision is resolved by reading the raced row:
  - same key → 200 duplicate;
  - different key → 409;
  - no row found → rethrow (500).

### Step 10 — Update the register counter

- `findOneAndUpdate` by `(session, studentEmail)`, `upsert: false`.
- Increment `evidence.proofCount`, add the wave to `evidence.waves`, update first/last proof times.
- A failure is logged and does not fail the proof.

### Step 11 — Respond

- **201** with `recorded: true`, `duplicate: false`, `attendanceDecided: false`, and a minimal proof view.
- **200** duplicate with `duplicate: true`.

### Why this order matters

| Ordering choice | Attack or bug it prevents |
| --- | --- |
| Origin guard before auth | A cross-site form cannot use the victim's cookie to submit |
| Auth before body parsing | An anonymous caller cannot probe validation messages |
| Enrollment before device binding | A non-roster account learns nothing about device state |
| Binding before signature | A caller without an approved key cannot use the route as a signature oracle |
| Signature before existing-proof lookup | A forged signature cannot discover whether a proof exists |
| Duplicate before status | A safe retry after close succeeds |
| Freshness before key equality | The error code cannot confirm a guessed key after expiry |
| Unique index after read | A concurrent retry still produces one proof |

## 83. What the database stores

### The `CheckInProof` document

| Field | Meaning | Retention |
| --- | --- | --- |
| `session` | The check-in session id | Deleted with the proof |
| `courseClass` | The class id at submission time | Deleted with the proof |
| `student` | The user id | Deleted with the proof |
| `studentEmail` | Lowercased email snapshot | Deleted with the proof |
| `deviceFingerprint` | SHA-256 of the bound public JWK | Deleted with the proof |
| `wave` | Wave number | Deleted with the proof |
| `key` | The decoded key | Deleted with the proof |
| `signature` | Raw P-256 signature, base64 | Deleted with the proof |
| `protocolVersion` | `"bioattend-proof:v1"` | Deleted with the proof |
| `location` | Optional browser location | Deleted with the proof |
| `createdAt` | Server receipt time | TTL anchor |
| `updatedAt` | Mongoose timestamp | Deleted with the proof |

Indexes:

- unique `(session, student, wave)` — one piece of evidence per student per wave;
- `(session, wave)` — teacher evidence queries and future summaries;
- `createdAt` with `expireAfterSeconds: 86400` — MongoDB's TTL monitor deletes the document about 24 hours after creation.

The TTL is a retention promise for the **proof**. It is not a promise that the attendance record disappears. The register row keeps aggregate counters (`evidence.proofCount`, `evidence.waves`, first/last proof times) after the proof is gone. This is why the teacher's register still shows that evidence existed even after the detailed proof rows expire.

The TTL monitor runs roughly every 60 seconds, so a proof may live slightly longer than 24 hours. It is not an exact scheduler.

### What is deliberately absent

- no `status` (`present`/`absent`) field;
- no `score` or confidence;
- no `attendance` reference;
- no raw audio;
- no IP address;
- no user agent;
- no private key;
- no decrypted message.

The proof is a record of transport, not a decision. The absence of an attendance field is the schema-level expression of the evidence-only rule.

### The attendance record's evidence fields

```js
evidence: {
  proofCount: Number,
  waves: [Number],
  firstProofAt: Date,
  lastProofAt: Date
}
```

This is a denormalised convenience for the register. It can drift if the counter update fails; the proof table is the source of truth while it exists. After 24 hours, the counter is the only remaining trace.

### The audit relationship

Proof submission does **not** write an `AuditLog` entry. The audit action enum has no `proof.submitted`. The reasons:

- proof submission is high-volume and student-driven;
- the proof document already records who, what, when and the signature;
- the audit chain is reserved for decisions and administrative actions.

The teacher's decision, the query decision and admin overrides are audited. This separation keeps the chain readable and keeps proof volume out of the hash chain.

### What can go wrong

- **TTL monitor delayed** → a proof may be visible slightly beyond 24 hours. The API still returns it if queried; there is no application-level expiry check on reads.
- **Counter update failed** → the proof exists but `proofCount` is low. The teacher's proof list is still complete until the TTL.
- **Counter incremented, proof insert rolled back** → impossible in the current code: the counter runs after a successful insert. A crash between the two leaves a proof with no counter, not a counter with no proof.
- **Database restored from backup** → TTL indexes are rebuilt; proofs older than 24 hours may be deleted on the next monitor pass. The register counters survive.
- **Fingerprint changed later** → the proof keeps the fingerprint at submission time, so history is not rewritten.

## 84. What the teacher sees

### The evidence panel

`GET /check-in-sessions/:sessionId/proofs` returns:

```json
{
  "success": true,
  "sessionId": "...",
  "attendanceDecided": false,
  "total": 12,
  "byWave": [{ "wave": 0, "count": 7 }, { "wave": 1, "count": 5 }],
  "proofs": [
    { "id": "...", "studentEmail": "student@nitjsr.ac.in", "wave": 0, "recordedAt": "..." }
  ]
}
```

`toTeacherProofView` deliberately omits:

- the key;
- the signature;
- the protocol version;
- the device fingerprint;
- the location;
- the student's user id (the email is shown, which is the human identifier).

The teacher sees **who** submitted evidence for **which wave** and **when**. That is enough to answer the question the panel is for: "did this student's phone hear the tone?"

### The register

The register is a separate view (`GET /check-in-sessions/:sessionId/attendance`). Each row includes:

- status and source;
- `evidence.proofCount` and `evidence.waves`;
- attempt location and teacher location, with a distance if both exist;
- the linked query, if any.

The teacher can compare the evidence to the status. A student with three proofs and status `pending` is a candidate for `present`. A student with no proof and status `pending` is a candidate for `absent` or `excused`. The system does not make that choice.

### What the teacher should infer

- A proof means the phone decoded the wave key and signed it with the bound device key.
- It does not mean the phone was in the room; it means the microphone heard the tone.
- Multiple waves increase confidence that the phone was present across time, but do not prove continuous presence.
- A proof from a student who is not on the roster is impossible; the enrollment check rejects it.
- A proof submitted after the teacher advanced is rejected; the student must decode the new wave.
- A duplicate is not extra evidence; it is the same evidence retried.

### Why the key is not shown

The teacher already has the current key on the key panel. Showing historical keys in the evidence list would widen the exposure for no operational benefit. The teacher needs to know which wave, not the old secret.

### Why the signature is not shown

A signature is not human-readable and cannot be checked by eye. Showing it would invite a false sense of verification. The server already verified it; the audit and the register are the human-facing record. A developer can inspect the proof document directly if debugging.

### The evidence lifetime in the UI

The proof panel shows what the API returns. After 24 hours, the TTL deletes the proof rows, and the panel becomes empty for that session. The register's `evidence.proofCount` remains, so the historical register still says evidence existed. The UI should not imply that an empty proof list means no evidence was ever submitted; it may simply be older than the retention window.

### What can go wrong

- **Teacher polls before any proof** → empty list with a helpful prompt; that is not an error.
- **Teacher opens a closed session's proofs** → the route still returns the stored evidence until TTL. The session being closed does not hide history.
- **Proof expires while the panel is open** → the next poll drops it. The register counter remains.
- **Teacher expects a "present" badge** → there is none by design. The register is the decision surface.

## 85. What the system deliberately does not do

### It does not mark attendance

The proof response says `attendanceDecided: false`. The proof model has no attendance field. No controller sets a status from a proof. The only paths that change attendance are:

- a teacher marking the register;
- a teacher finalising (pending → auto-absent);
- a query approval/rejection;
- an admin override/delete.

This is the central product decision. Automatic attendance would turn a probabilistic acoustic signal into an academic record with no human review. The project deliberately refuses that.

### It does not score or rank

There is no confidence score, no per-student rank, no "proof strength" number. The evidence panel shows counts and waves; the teacher interprets them. A score would imply a precision the physics does not support.

### It does not run an ID round

An ID round would ask each phone to transmit a unique signal back, or require a challenge-response across waves. It is not built. The current proof is one-way: the phone listens and signs what it heard. A future cascade might add rounds, but it is gated.

### It does not build a student cascade

There is no multi-hop relay where one phone's proof helps another student. Every proof is per student, per device. The `evidence.waves` array is a summary for one student, not a graph.

### It does not send the key back to the student

Discovery returns `toStudentSession`, which omits `key` and `keyHistory`. There is no endpoint that returns the current key to a student. The only way to learn it is to decode the sound.

### It does not upload audio

The microphone stream is processed in the browser. The PCM worklet sends samples to the page's rolling buffer; the decoder extracts digits. Only the decoded key, wave, signature and optional location are sent. Raw audio never leaves the phone.

### It does not gate on location

Location is optional evidence. A denied permission does not block a proof. The query flow can require a location (`requireQueryLocation`), but the proof flow never does.

### It does not prove physical presence

It proves a phone's microphone heard a tone and an approved key signed the decode. It does not prove:

- the phone was inside the room;
- the student was holding the phone;
- the sound was live;
- the device was not compromised.

A student in the corridor, a forwarded live call, a replayed recording, or a rooted device can defeat the inference. The teacher's judgement and the query process are the compensating controls.

### It does not prevent replay across devices

If two students hear the same key, both can submit valid proofs. That is expected: one wave produces many evidence rows. The system does not try to make the key unique per student; it makes the **signature** unique per student.

A recording of the tone can be replayed to a phone that did not hear the live transmission. The server cannot distinguish a live decode from a replayed one, because it never sees the audio. The two-minute key and the wave sequence limit the window, but they do not eliminate replay.

### It does not provide non-repudiation

The signature proves possession of the device key, not the identity of the human. A student can claim the phone was borrowed, the key was stolen, or the browser was compromised. The audit and the device-review process provide accountability, not legal non-repudiation.

### It does not automate the teacher's decision

The teacher can mark a student present without a proof (manual roll-call) and absent with a proof (suspicious circumstances). The system records both the evidence and the decision. That freedom is intentional: the teacher is accountable, and the audit chain makes the decision visible.
# Part X — Imports and document handling

A class list usually exists as a spreadsheet, a PDF or a photocopy. Typing forty email addresses is slow and error-prone; importing them blindly is worse. This part explains the narrow, deliberate path the project takes: extract text, show it to the teacher, let the teacher edit and preview it, and only then save. At no point does a document create a class, save a roster or mark attendance by itself.

## 86. Roster parsing rules

### What the parser is for

`utils/roster.js` takes pasted text and turns it into a list of `{ email, name, identity }` entries plus a list of line-numbered errors. It is a pure function: it reads a string and returns an object. It does not touch the database. The same function backs both the preview route and the save route, so the two cannot disagree about what a line means.

### Accepted shapes

The input is line-oriented. Each non-empty line is one candidate student. A line can be:

- a bare college email: `2023ugcs059@nitjsr.ac.in`;
- an email followed by a comma and a name: `2023ugcs059@nitjsr.ac.in, Shivansh Singh`;
- a quoted CSV field: `2023ugcs059@nitjsr.ac.in, "Singh, Shivansh"`;
- a header line such as `email`, `college email` or `student email`, which is skipped.

There is no requirement for a header. There is no requirement for a name. A roster of bare emails is valid.

### The line-by-line algorithm

1. Strip a UTF-8 byte-order mark (`\uFEFF`) from the start. Spreadsheet exports often include one.
2. Split on `\r?\n`, so Windows and Unix line endings both work.
3. Trim each line. Blank lines are skipped but still consume a row number, so error messages match what the teacher sees in the textarea.
4. Split the line with a small CSV reader.
5. Take the first cell as the email, lowercased and trimmed. Take the second cell as the name, trimmed.
6. On the first data line only, skip a header if the first cell is exactly `email`, `college email` or `student email` (case-insensitive after lowercasing).
7. Validate the email against the institutional rule.
8. Reject a duplicate email already seen in this same input.
9. Derive identity fields from the email.
10. Push the entry.

### The CSV reader

`splitCsvLine` is deliberately tiny:

- a `"` toggles quoted mode;
- `""` inside quoted mode produces one literal `"`;
- a `,` outside quoted mode ends the current cell;
- every cell is trimmed;
- an unterminated quote returns `valid: false`.

It does not support multi-line quoted fields. A name containing a newline inside quotes is not a supported case; the line splitter would have already broken it. That is an acceptable limit for a roster, where names are short.

### The institutional rule

```js
const INSTITUTIONAL_DOMAIN = "nitjsr.ac.in";

const isInstitutionalEmail = (email) =>
  email.endsWith(`@${INSTITUTIONAL_DOMAIN}`) &&
  /^[^\s@]+@nitjsr\.ac\.in$/i.test(email);
```

The first check is a fast suffix test. The second is the real shape test: at least one character that is not whitespace or `@`, then `@nitjsr.ac.in`, case-insensitive. This rejects:

- `student@example.com`;
- `student@nitjsr.ac.in.evil.com`;
- `student@@nitjsr.ac.in`;
- `student @nitjsr.ac.in`;
- `@nitjsr.ac.in`.

The domain is hardcoded. This is a single-college product. A multi-tenant deployment would need a configuration table, not a string replacement, because allowing arbitrary domains would turn the roster into an open sign-up list.

### Why the email is the identity

The college email encodes the batch, programme, branch and roll number:

```text
2023ugcs059@nitjsr.ac.in
^^^^  ^^  ^^^
year  branch  roll
```

`deriveIdentity` extracts:

```js
const loginId = email.split("@")[0];
const match = loginId.match(/^(\d{4})([a-z]+)(\d+)$/i);
```

If it matches:

```js
{
  loginId: "2023ugcs059",
  batch: "2023",
  programmeBranch: "UGCS",
  rollNumber: "059"
}
```

If it does not match, it returns only `{ loginId }`. This is a display convenience, not a gate. A college email that does not follow the pattern is still accepted as long as it passes the domain check. The parser never rejects a student because the roll-number pattern is unfamiliar; it just stores less metadata.

The roll number keeps leading zeroes because it is a string. `059` must not become `59`.

### Duplicate handling

`seenEmails` is a `Set` of lowercased emails. A second occurrence in the same input produces:

```text
Duplicate email in this roster.
```

The duplicate is not accepted, and the first occurrence remains. This is important because the save route refuses to proceed if there are **any** errors. A teacher who pastes the same student twice must fix it, rather than silently getting one enrollment through an upsert.

Across different classes, the same email is allowed. Across different sessions, the same email is expected. Uniqueness is per class roster, not global.

### The 250-student cap

After parsing, if `entries.length > 250`, the parser adds one error with `row: null`:

```text
A single class roster can contain at most 250 students.
```

It does not throw away the entries. The preview still shows them, so the teacher can see what was pasted. The save route refuses because an error exists. The cap is a prototype bound: a class of 250 is already large for this workflow, and the attendance batch limit is 500 rows.

The parser has no explicit line-count cap. The JSON body limit (200 KB) is the practical bound. A 200 KB roster of short lines is far below a denial-of-service size, but it is still enough to make the preview UI large.

### Error shape

Errors are `{ row, message }`:

- `row` is the 1-based line number in the original text, including blank lines;
- `row: null` means the error is about the whole document, such as the 250-student cap.

Examples:

| Input | Result |
| --- | --- |
| empty string | one error: "Paste a CSV or one college email per line." |
| `student@example.com` | one error: "Use a valid @nitjsr.ac.in email." |
| `a@nitjsr.ac.in` twice | second row: "Duplicate email in this roster." |
| `a@nitjsr.ac.in, "Patel` | row error: "Unclosed quote in CSV row." |
| header + 3 valid emails | 3 entries, 0 errors |

### The rehearsal exception

In development and test only, `rosterOptions()` can supply `allowedTestEmails` from `TEST_STUDENT_EMAILS` when `ALLOW_TEST_ROSTER_EMAILS=true`. The parser then accepts an exact allowlisted non-college email in addition to institutional ones.

The exception is narrow:

- it requires the flag;
- it requires a non-production environment;
- it requires at least one test student address to be configured;
- it matches the exact lowercased address, not a domain;
- it does not change the institutional rule for college addresses.

Production startup refuses the flag outright. Without it, a Gmail address on a real roster is an error. This exists so a two-phone rehearsal can include the owner's Gmail test student without weakening the production rule.

### What the parser deliberately does not do

- It does not read XLSX or CSV files. The UI pastes or uploads a PDF, extracts text, and the teacher edits it.
- It does not create user accounts. An enrollment is an email; the user row appears when that student signs in.
- It does not send invitations or emails.
- It does not guess a name from the email. The name is blank unless the second column supplies one.
- It does not validate that the roll number is unique or plausible.
- It does not normalise Unicode names beyond trimming.
- It does not merge two rosters. The save is a replacement, as chapter 61 explains.

### What can go wrong

- **Excel exports with semicolons** → the line is treated as one email cell, fails the institutional check. The teacher must export as comma-separated or use one-email-per-line.
- **Names containing commas without quotes** → the second cell is only the first fragment; the rest is ignored because only cells 0 and 1 are read.
- **A smart quote or non-breaking space** → the email may fail the shape check. The teacher can fix it in the textarea.
- **A trailing comment** → `student@nitjsr.ac.in # section A` is not a valid email; the comment becomes part of the cell.
- **A header variant** such as `E-mail` → not in the skip list, so it is treated as a bad email. The teacher removes it.
- **More than 250 students** → the save is blocked; the class must be split or the limit raised in code.
- **Two different people sharing a mailbox** → one email, one enrollment, one account.

## 87. Roster PDF extraction flow

### The route

```text
POST /api/v1/classes/:classId/roster/pdf/preview
Access: teacher, owns the class
Body: multipart/form-data, one field named "file"
Limit: 10 MB, 20 pages, 200,000 characters
Rate: 20 uploads per 10 minutes per account/IP
```

The handler is `classController.previewRosterPdf`. The chain is:

```text
guards
  -> createPdfPreviewLimiter()
  -> acceptPdfUpload
  -> previewRosterPdf
```

`guards` is the usual `isAuthenticated → authorizeRoles("teacher")`. The limiter is created per router, so the roster budget is separate from the timetable budget. `acceptPdfUpload` uses multer's memory storage, one file, no extra fields.

### Order of checks

1. **Class ownership** via `getOwnedClass`. An invalid or unowned class returns **404** before multer is asked about the file. This avoids confirming class existence to someone who uploads junk.
2. **File presence** → `pdf_missing` (400).
3. **Extraction** → a `PdfTextError` is mapped to its code and status.
4. **Text layer presence** → if `hasText` is false, **422** `pdf_no_text_layer` with a message that local OCR is not built.
5. **Email count** → a regex counts addresses ending in `@nitjsr.ac.in`.
6. **Response** with the full extraction plus the count and the original filename.

### Why ownership comes before the file

A malicious caller could otherwise use the route as a PDF oracle: upload arbitrary documents and learn whether they parse, without proving they own a class. Checking the class first makes the route useless without a real class the caller owns.

The file is still parsed by PDF.js, which is a large parser processing untrusted input. The size, page and character bounds exist for that reason. They do not make the parser safe in an absolute sense; they bound the work.

### What the response looks like

```json
{
  "success": true,
  "extraction": {
    "text": "2023ugcs001@nitjsr.ac.in, Aarav Mehta\n...",
    "pageCount": 2,
    "extractedPages": 2,
    "lineCount": 41,
    "charCount": 1180,
    "hasText": true,
    "institutionalEmailCount": 40,
    "fileName": "CS301_roster.pdf"
  }
}
```

`pageCount` is the document's page count. `extractedPages` is how many were processed before a limit or the end. They are equal unless a limit stopped extraction. `lineCount` is the number of reconstructed non-empty lines. `charCount` is the total character count of the returned text.

`institutionalEmailCount` is convenience, not validation. Forty addresses is a strong hint that this is a college roster, but the server still does not turn them into enrollments. A PDF with zero addresses can still return text (for example, a roster with names only); the teacher decides what to do.

The filename is returned for display. It is user-supplied and must be rendered as text. React escapes it by default; the code must not use `dangerouslySetInnerHTML`.

### The frontend flow

`ClassManagement` keeps a `pdfRequestRef` counter to discard stale responses when the teacher switches classes quickly.

1. The teacher chooses a file.
2. `isPdfFile(file)` accepts `application/pdf` or a `.pdf` extension. This is a convenience check; the server is authoritative.
3. The page builds `FormData`, appends `file`, and posts with `withCredentials`.
4. On success, it replaces the roster textarea with `extraction.text`, shows `extractionSummary(extraction)`, and leaves the preview empty.
5. On failure, `importErrorMessage(code, message)` maps the stable codes to readable copy.

`extractionSummary` produces text such as:

> Extracted 2 pages; 40 college emails found. Review the text, then run Preview roster.

The count is deliberately described as "found", not "imported". The UI is telling the teacher what the extraction contains, not claiming a save.

### The two-step confirmation that follows

Extraction is only step one. The teacher must:

1. read and edit the text;
2. press **Preview roster**, which calls `POST /classes/:id/roster/preview` and runs the real parser;
3. fix every line error;
4. press **Save roster**, which sends the **original text** to `PUT /classes/:id/roster`.

The save route parses again. The client never sends the preview's parsed entries. This matters: a stale or tampered preview cannot become the save payload. The server's parse of the text is the only authority.

### The roster PDF spinner and errors

While the upload is in flight, the button is disabled and a spinner is shown. A second click cannot start a parallel upload. If the teacher navigates away, the request continues in the browser but its response is ignored by the request-id guard.

The mapped errors are:

| Code | Message |
| --- | --- |
| `pdf_missing` | Choose a PDF file to extract. |
| `pdf_invalid` | That file is not a readable PDF. |
| `pdf_too_large` | The PDF is larger than 10 MB. |
| `pdf_too_many_pages` | The PDF has more than 20 pages. |
| `pdf_too_much_text` | The PDF has more text than the preview can handle. |
| `pdf_password_protected` | Remove the password and try again. |
| `pdf_no_text_layer` | This looks scanned. Local OCR is not built yet; use CSV/paste. |
| `pdf_unreadable` | The PDF could not be read. |
| `pdf_upload_invalid` | Upload exactly one PDF file. |

The exact wording lives in `utils/rosterImport.js`; the codes are stable and are the contract.

### What A1 proved and what it did not

The tests use generated PDF fixtures. They prove:

- a text-layer PDF is extracted into visual lines;
- a second page is preserved;
- per-character fragments are joined into words;
- a scanned/no-text PDF returns the specific code;
- a non-PDF is rejected;
- the multipart route requires a signed-in teacher;
- another teacher's class never reaches extraction;
- the route does not write enrollments.

They do **not** prove that a real college roster PDF looks good. No representative samples were supplied. A two-column roster, a merged header, a watermark, a table with ruled lines or a Devanagari font could all produce text that needs heavy editing. The feature is honest about that: it extracts, it does not promise a clean roster.

### What can go wrong

- **A PDF with selectable text but a table layout** → the text arrives, but columns may interleave. The teacher edits.
- **A scanned image PDF** → 422, no partial save. The teacher types or uses CSV.
- **A password-protected PDF** → 422, no password prompt. The teacher removes the password outside the app.
- **A PDF over 20 pages** → 422. A roster should not be that long; a combined document must be split.
- **The class is deleted while the upload runs** → the controller already loaded it; extraction still returns. No write depends on it.
- **The upload is retried after a timeout** → the limiter counts both attempts. Twenty is a generous budget for a manual action.
- **The browser sends a different field name** → multer sees no file → `pdf_missing`.
- **The file is a valid PDF but not a roster** → text is returned. The teacher sees it is wrong and does not save.

## 88. Timetable PDF extraction flow

### The route

```text
POST /api/v1/timetable/pdf/preview
Access: staff (teacher or super-admin)
Body: multipart/form-data, one field named "file"
Limit: 10 MB, 20 pages, 200,000 characters
Rate: 20 uploads per 10 minutes per account/IP
```

The handler is `timetableController.previewTimetablePdf`. It calls the same `extractPdfText` as the roster route. The difference is scope and output:

- no class id, because a teacher may be preparing next term before classes exist;
- no ownership check beyond the staff role;
- no email count;
- no parsing into rows;
- no writes of any kind.

### What the response contains

```json
{
  "success": true,
  "extraction": {
    "text": "MONDAY\n09:00-10:00 CS301 DAA C-101\n...",
    "pageCount": 1,
    "extractedPages": 1,
    "lineCount": 32,
    "charCount": 940,
    "hasText": true,
    "fileName": "timetable.pdf"
  }
}
```

There is no `slots` array, no `classes` match, no `unmatched` list. Those would imply the server understood the table. It does not.

### The frontend flow

`Timetable` opens a file picker, posts the file, and shows a modal with:

- the filename;
- page and line counts;
- a read-only monospace panel containing the text;
- a notice that nothing was scheduled and no attendance changed;
- a note that structured row parsing is not built until representative samples are supplied;
- a **Close preview** button.

There is no **Import** button. The teacher reads the text and adds each slot through the normal form. The PDF helper `utils/timetableImport.js` mirrors the roster helper, including the stable error mapping.

### Why the route is staff-only rather than teacher-only

A super-admin may need to inspect a timetable while helping a teacher or preparing a term. The route reads no private roster and writes nothing, so staff scope is enough. It does not accept a student: a student has no reason to upload a timetable, and the route would be an unnecessary parsing surface.

### Why there is no class scope

A roster PDF belongs to one class, so the route requires that class and checks ownership. A timetable PDF belongs to a term, not to one class. It may contain many teachers, rooms and sections. Requiring a class would be artificial and would block the useful case of previewing the document before the classes exist.

The cost is that a staff member can upload any PDF and get its text back. That is a generic PDF-to-text service inside the app, bounded by staff authentication, the rate limit and the parser bounds. It does not expose other users' data; the response contains only what the uploader supplied.

### The visual-line reconstruction

The extractor is shared, so the mechanics are in chapter 63. For a timetable, the practical consequences are:

- **Row order is visual**, top-to-bottom by PDF y coordinate, then left-to-right by x.
- **A table's columns are not preserved.** If a row is `MON | 09:00 | CS301 | C-101`, the fragments may be joined with spaces in x order, which is usually readable.
- **Merged cells** produce one label next to the first row and nothing next to the spanned rows.
- **Multi-column page layouts** can interleave lines. A two-column timetable (morning and afternoon side by side) may merge each pair of rows.
- **Rotated headers** may appear in the wrong position.
- **Lines are not rows.** The extractor returns text lines; it has no concept of a table row or a cell.

This is exactly why the output is read-only. A parser that guessed cells from this text would be making up structure. It might look correct on one sample and silently assign a class to the wrong time on another.

### What the timetable modal does not do

- It does not create a class.
- It does not create a room.
- It does not create a timetable slot.
- It does not update an existing slot.
- It does not match a course code to a class.
- It does not detect conflicts.
- It does not start a check-in.
- It does not mark attendance.
- It does not store the PDF or the extracted text.

The only path from the preview to the database is the teacher pressing **Add slot** and submitting the normal form, which is validated like any other slot.

### What can go wrong

- **A scanned timetable** → `pdf_no_text_layer`; OCR is not built.
- **A timetable with a graphic header** → the header may be missing; the rows may still extract.
- **A page with a background image and text on top** → the text layer usually still extracts; the image is ignored.
- **A PDF with 100 pages** → 422 at 20 pages. Split it.
- **A PDF that is actually a screenshot pasted into Word** → no text layer; rejected.
- **A timetable with abbreviations** → text is returned as-is; the teacher interprets `DAA` as the course.
- **A slot already exists at that time** → the preview does not know or care; the teacher sees the duplicate when adding.
- **The teacher expects an import button** → there is none, and the modal says so.

## 89. Why there is no automatic save

### The tempting shortcut

The shortest implementation would be:

```text
upload PDF -> extract text -> regex emails -> insert enrollments
```

or:

```text
upload timetable -> extract text -> guess rows -> insert slots
```

Both are easy to demo and dangerous in production. A single misread character can:

- enroll the wrong student;
- drop a student from the active roster;
- assign a class to the wrong day or time;
- create a duplicate class;
- overwrite a slot the teacher carefully arranged;
- make an attendance register appear to have the wrong expected set.

None of these is visible in a screenshot. All of them are hard to reconstruct later.

### The rule

> Extraction may read. Only a teacher's explicit preview-and-save may write.

This is enforced in three places:

1. **Route surface** — the PDF routes have no write code. There is no hidden `save` flag. The controllers call `extractPdfText` and return JSON.
2. **UI surface** — the roster modal fills a textarea but does not save; the timetable modal has no import button.
3. **Parser surface** — the roster parser is pure; the timetable has no row parser at all. The save route re-parses the text server-side, so the client cannot submit a pre-parsed list.

### Why preview is not just a courtesy

A preview is a contract: the teacher sees exactly what the server will store. For the roster, the preview response contains the accepted entries and the errors. The save sends the same text. For the timetable, there is no structured preview because there is no structured save; the teacher adds slots one by one.

The roster preview is also a dry run of the **same code**. It is not a separate validator that might drift from the save path. This is a common source of bugs: a client-side preview accepts a line that the server later rejects, or vice versa. Here, both call `parseRosterText`.

### The cost

The cost is manual work:

- the teacher must read the extracted text;
- the teacher must fix lines;
- the teacher must add timetable slots one at a time;
- a large timetable takes minutes, not seconds.

That cost is visible and bounded. The cost of a silent wrong import is not. The project chooses the visible cost.

### What would have to be true for automatic save

An automatic save would need, at minimum:

- a parser validated against a representative corpus of real college documents;
- a confidence measure per row;
- a mandatory diff view showing every change;
- an explicit confirmation that names every created, updated and deactivated record;
- a rollback plan for a bad import;
- tests for duplicate keys, merged cells, electives, lab batches and mid-term room changes.

None of that exists. Building the extraction without it is the honest intermediate step.

### The evidence-only connection

The same principle governs attendance. A decoded tone is evidence; a teacher decides. A parsed roster line is a proposal; a teacher confirms. A parsed timetable row would be a proposal too. The product consistently refuses to let a machine's inference become an academic record without a human decision.

### What can go wrong with the manual flow

- **The teacher edits the text but forgets to preview** → save is disabled until a clean preview exists in the UI. The server also re-parses and refuses on errors.
- **The teacher saves a roster with a missing student** → that student is deactivated. The preview shows the accepted count; the teacher should compare it to the expected class size.
- **The teacher pastes the PDF text into the wrong class** → the save replaces that class's roster. Ownership prevents another teacher, but it cannot prevent a mistake within the teacher's own classes.
- **The teacher adds a timetable slot twice** → the database has no unique constraint on the slot; the UI does not prevent it. The teacher must notice.
- **A PDF is uploaded for preview and then discarded** → nothing is stored; there is no cleanup job because there is nothing to clean.

## 90. The gates on OCR and LLM extraction

### The problem with scanned documents

A scanned PDF is a picture of a page. PDF.js can extract no text because there is no text layer. The project returns `pdf_no_text_layer` and tells the teacher to use CSV/paste. That is an honest refusal, not a silent empty result.

The next step would be OCR: render each page to an image and run a text recogniser. That is a much heavier operation than PDF.js text extraction:

- rendering uses CPU and memory proportional to page size and resolution;
- OCR is CPU-intensive and can take seconds per page;
- accuracy depends on scan quality, skew, language, fonts and table lines;
- a wrong character in an email is a wrong student;
- the runtime must fit a web request or move to a background job.

### A3 — local OCR is blocked

The plan is to use a free, in-process OCR engine, not a paid API. No paid service and no card-required free tier is allowed. The output would still go through the same editable preview: OCR text is not saved directly.

The gate is **representative scanned samples**. Without them, the project cannot answer:

- what accuracy does the engine achieve on real college scans?
- how long does a typical page take on the deployment CPU?
- does it handle the college's fonts and table rules?
- does it misread `0` as `O`, `1` as `l`, or `@` as something else in emails?
- what is the memory peak for a 20-page document?
- does it need preprocessing (deskew, threshold, crop)?

Claiming OCR works without measuring those is exactly the kind of unverified claim the project avoids. A3 stays unbuilt until samples exist and a measurement is recorded.

### A4 — optional Gemini extraction is gated

Gemini is a hosted large-language model. It could, in principle, turn messy text into structured rows. It is **not coded**. The gate is consent and risk acceptance, not just technical feasibility.

The free tier may use submitted content to improve products and may involve human review. A roster contains student names and college emails. Sending it to a third party is a privacy decision that the owner must make in writing, with a student-facing notice.

The gate in `plan.md` requires five things before any code sends a roster or timetable to Gemini:

1. **The exact student-facing notice and where it is shown.** A line in a help page is not enough if students never see it; it must be shown before the data leaves.
2. **The data fields that may leave the server.** For example: names, emails, course codes, times. Not device keys, signatures, passwords or attendance records.
3. **The retention and training risk of the chosen free tier.** "Free" does not mean "private".
4. **The owner's written acceptance and date.** A decision recorded in the repository, not a verbal assumption.
5. **The fallback when a student or teacher opts out.** If a student refuses, the manual path must still work, and their data must not be sent.

That text does not exist yet. Until it does, A4 is unbuilt and raw rosters remain server-side.

### Why the order is OCR before LLM

A local OCR engine keeps the document on the server. A hosted LLM sends it out. The lower-risk step comes first. If local OCR is accurate enough, the LLM may never be needed for the common case. If OCR fails on a particular layout, the LLM is a last resort with a documented privacy cost.

### Why the LLM is not a parser replacement

A language model can produce plausible rows that are wrong. It has no database, no class list and no conflict detection unless the prompt supplies them. Using it to invent a timetable is a recipe for hallucinated slots. If it is ever used, it must be constrained to extraction, followed by the same preview and confirmation, and never allowed to write directly.

### The non-negotiable rules for any future extraction

- **No automatic save.** Extract → preview → teacher confirms.
- **No class creation from a timetable.** Unmatched rows are flagged for manual creation.
- **No attendance change.** A document import never marks anyone.
- **No raw roster to an LLM before consent and risk text exist.**
- **No paid service or card-required free tier.**
- **No claim of accuracy without representative samples and a recorded measurement.**
- **No secret in the extracted text.** The parser never needs passwords, tokens or device keys; if a document contains them, the teacher should not paste them.
- **No silent fallback.** A scanned PDF is a clear error, not an empty success.

### What can go wrong at the gate

- **A vendor changes its free-tier terms** → the risk text is stale; the owner must re-accept.
- **A sample is from one department only** → the accuracy claim is too broad; collect across programmes and layouts.
- **OCR is fast on a laptop but slow on the deployment CPU** → measure on the target instance, not locally.
- **A teacher uploads a document containing personal data beyond the roster** → the preview shows it; the teacher should remove it before saving. The server does not scan for extra PII.
- **A student opts out after a previous import** → the opt-out must prevent future sends; it cannot un-send what was already sent. The notice must be honest about that.
- **The LLM returns a valid-looking but invented email** → the roster parser rejects it unless it matches the institutional domain; a plausible college email could still pass. Human review is the only defence.

### The state of play

| Capability | Status | Gate |
| --- | --- | --- |
| PDF text-layer extraction | Built | None; bounded and preview-only |
| Roster paste/CSV parsing | Built | None; preview and explicit save |
| Timetable PDF text preview | Built | None; read-only |
| Structured timetable parsing | Not built | Representative timetable PDFs |
| Local OCR | Not built | Representative scanned samples; accuracy and runtime measurement |
| Hosted LLM extraction | Not built | Student notice, data-field list, risk acceptance, opt-out path |

The table is the honest summary. The built column is useful today; the not-built column is not a hidden feature.
# Part XI — Operations

This part is for the person who has to run the thing: start it locally, deploy it, understand the environment, tell whether it is alive, back it up, and diagnose a failure without guessing. The project is deliberately small — one Node service and one MongoDB database — but the ordering rules and the security gates still matter.

## 91. Local development

### What you need

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 22.13+ or 24+ | PDF.js 6 will not load on older Node 22 builds |
| npm | Bundled with Node | Dependency install and scripts |
| MongoDB | A recent community edition | Local data store |
| Chrome | Current | The supported browser for microphone and acoustic flows |
| cloudflared | Optional | HTTPS tunnel for testing microphone pages on a real phone |

The backend and frontend are separate npm projects. There is no monorepo workspace and no shared package. Install each once:

```bash
cd attendance-backend
npm install

cd ../attendance-frontend
npm install
```

### The backend configuration file

The backend reads `attendance-backend/config/config.env` in development and test. In production it reads real environment variables and does **not** load the file. The file is gitignored and must never be committed.

Start from the example:

```bash
cd attendance-backend
cp config/config.env.example config/config.env
```

A minimal local file:

```dotenv
PORT=4000
DB_URI=mongodb://127.0.0.1:27017/attendance
JWT_SECRET=replace-with-a-long-random-local-secret
JWT_EXPIRE=5d
COOKIE_EXPIRE=2
CLIENT_URL=http://localhost:3000
TEACHER_EMAILS=teacher@nitjsr.ac.in
SUPER_ADMIN_EMAILS=owner@example.com
SUPER_ADMIN_SESSION_HOURS=12
```

Do not copy a production secret into this file. Do not paste a real database password into a chat, a screenshot, a commit, a test fixture or this book. The repository's working copy may contain a real local configuration; that is exactly why the file is ignored and why this book describes variable names, not values.

### Starting MongoDB

Any local data directory works. One common command:

```bash
mkdir -p ~/data/db-attendance-dev ~/data/log
mongod --dbpath ~/data/db-attendance-dev \
  --logpath ~/data/log/mongod-attendance.log
```

Leave it running. If MongoDB is installed as a service, confirm it listens on `127.0.0.1:27017` instead.

### Starting the backend

```bash
cd attendance-backend
npm run dev
```

`npm run dev` is:

```json
"NODE_ENV=development DEV_AUTH_ENABLED=true node index.js"
```

It enables the one-click dev personas. It also loads `config/config.env`. `npm start` is the normal entry point; it does **not** set `DEV_AUTH_ENABLED`, so the dev routes are absent.

The startup log must show, in order:

```text
mongodb connected with server:...
MongoDB indexes are ready for N model(s): ...
server is working at http://localhost:4000
```

If the connection fails, the process logs `Refusing to start: database connection failed: ...` and exits 1. If an index cannot build, it logs `Refusing to start: database index initialization failed: ...` and exits 1. It never opens the listener first. Chapter 94 explains why.

### Starting the frontend

```bash
cd attendance-frontend
npm start
```

Open `http://localhost:3000`. The frontend's fallback API URL is `http://localhost:4000/api/v1`. CORS allows `http://localhost:3000` and `http://127.0.0.1:3000` in development.

There is also a same-origin development mode:

```bash
npm run start:shared
```

This sets `REACT_APP_API_URL=/api/v1` and uses `setupProxy.js` to forward API requests to the backend. It is useful when testing cookie behaviour that resembles the one-service deployment.

### The dev personas

When `DEV_AUTH_ENABLED=true` and `NODE_ENV` is `development` or `test`, the login page shows a persona picker. The default accounts are:

- `teacher@dev.invalid` — teacher;
- `student1@dev.invalid`, `student2@dev.invalid`, `student3@dev.invalid` — students.

The backend exposes `GET /auth/dev/accounts` and `POST /auth/dev/login`. The accounts are defined by `DEV_AUTH_ACCOUNTS` if set, or by a built-in list. The parser enforces:

- `key:role:name:email` shape;
- key 2–24 lowercase letters, digits, `_` or `-`;
- role `teacher`, `student` or `superadmin`;
- email ending in `@dev.invalid`;
- no duplicate key or email;
- at most 10 accounts.

The dev route is not mounted in production. `DEV_AUTH_ENABLED=true` in production stops startup; it is not silently ignored.

Dev personas auto-approve device binding. That is a rehearsal convenience. A real Google account does not.

### Real Google sign-in locally

The local OAuth client must list `http://localhost:3000` as an authorized JavaScript origin. While the Google consent screen is in Testing, every account that signs in must be on the Test users list. The server still applies its own allowlists after Google returns the identity.

A Gmail owner needs `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty or unset. Setting it to `nitjsr.ac.in` filters the Google chooser to that Workspace domain, even if the server would allow a Gmail address.

### Testing on real phones

Microphone access requires a secure context: HTTPS or `localhost`. A LAN IP such as `http://192.168.1.10:3000` is not secure for `getUserMedia` in Chrome. The local workflow uses a tunnel:

```bash
# terminal 1
cd attendance-frontend
npm run start:shared

# terminal 2
cloudflared tunnel --url http://localhost:3000
```

Open the printed `https://....trycloudflare.com` link on the phones. The acoustic lab, transmitter and receiver need no sign-in. The signed-in check-in page needs Google sign-in, and Google will reject a tunnel origin that is not registered in the OAuth client.

The quick tunnel URL changes every run and dies when the process stops. Do not bookmark it. Do not use it for a real session.

### Running the test gate locally

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
CI=true REACT_APP_API_URL=/api/v1 npm run build
```

The expected totals are described in Part XII. A green build writes `attendance-frontend/build/`; the backend serves that folder automatically when it exists.

### What can go wrong locally

- **`Cannot find module`** → run `npm install` in the right project.
- **Backend exits on database connection** → MongoDB is not running or `DB_URI` is wrong.
- **Backend exits on index initialization** → a unique index cannot build, often because duplicate data already exists. The error names the collection; fix the data before restarting.
- **Port already in use** → stop the old process (`lsof -tiTCP:3000 | xargs kill`, same for 4000) or change `PORT`.
- **Google sign-in blocked** → the account is not a Google Test user, or the origin is not registered for the OAuth client.
- **Microphone refuses** → the page is not HTTPS/localhost, permission was denied, or another app holds the device.
- **Frontend calls the wrong API** → `REACT_APP_API_URL` is baked at build time; restart/rebuild after changing it.
- **A stale service worker serves an old shell** → the worker is registered only in production builds, but if one is active, unregister it or hard-reload.
- **The tunnel URL stops working** → the `cloudflared` process exited or the laptop slept. Start a new tunnel; the URL changes.

## 92. Production deployment shape

### The recommended shape

```text
Browser ──HTTPS──> Render Web Service (Node 24)
                     ├── Express API under /api/v1
                     ├── React production build at /
                     └── MongoDB Atlas (managed database)
```

One origin. The API and the static React build are served by the same Express process. Cookies are first-party and `SameSite=Lax` is sufficient. There is no CORS between the frontend and API, because there is no second origin.

A split deployment (Vercel frontend + Render backend) is possible but not recommended. It makes cookies third-party, requires `SameSite=None; Secure`, and some browsers block third-party cookies entirely. The single-service shape removes a whole class of "sign-in succeeded but the session did not stick" failures.

### The Render settings

| Field | Value |
| --- | --- |
| Runtime | Node |
| Build Command | `cd attendance-frontend && npm ci && npm run build && cd ../attendance-backend && npm ci` |
| Start Command | `cd attendance-backend && npm start` |
| Health Check Path | `/api/v1/health/ready` |
| Instance Type | Free to try; Starter for a real pilot |

The build runs before the start. The frontend build writes `attendance-frontend/build`; the backend's `app.js` checks for that folder and serves it. If the build is missing, the API still runs but `/` returns the API's JSON greeting and frontend routes 404.

The start command runs `prestart`, which checks the Node version, then `node index.js`. The service must be Node 22.13+; the documented production setting is `NODE_VERSION=24`.

### MongoDB Atlas

The M0 free tier is enough for a pilot. It has **no automated backups**, which is why chapter 95 exists. The database user needs read/write access to the `attendance` database. Network access must allow Render's outbound addresses; free Render instances have no fixed IP, so the pragmatic pilot setting is `0.0.0.0/0`, which is broad and should be tightened if the deployment moves to static egress.

The connection string must include the database name:

```text
mongodb+srv://USER:PASSWORD@cluster/attendance?retryWrites=true&w=majority
```

If the password contains characters that are special in a URL (`@`, `:`, `/`, `?`, `#`, `%`), URL-encode it. A wrong password produces a connection failure at startup, not a half-running service.

### Google OAuth

Create an OAuth **Web application** client. Add the exact Render origin to **Authorized JavaScript origins**. No redirect URI is needed: the app uses Google Identity Services' credential callback, not a redirect flow.

The backend verifies the ID token's audience against `GOOGLE_CLIENT_ID`. The frontend renders the button with `REACT_APP_GOOGLE_CLIENT_ID`. They must be the same client ID. If they differ, Google may issue a token the server refuses.

### Static serving and caching

`app.js` serves the build if `attendance-frontend/build/index.html` exists:

- paths under `build/static/` get `Cache-Control: public, max-age=31536000, immutable`, because Create React App hashes the filenames;
- everything else, including `index.html`, gets `no-cache`;
- any non-`/api/` path falls back to `index.html`, so React Router deep links work;
- `/api/*` is excluded from the fallback and reaches the API or its 404.

This is why a new deploy is visible on a normal reload: the HTML is revalidated, it references new hashed assets, and the old assets can stay cached harmlessly.

### Free-tier behaviour

Render free services sleep after about 15 minutes of inactivity. The next request can take 30–60 seconds. For a real check-in, warm the service a minute before the session or use a paid instance. A sleeping service is not a bug; it is a hosting tradeoff.

### Deployment order

1. Set environment variables.
2. Deploy.
3. Check `/health` and `/health/ready`.
4. Confirm the startup log shows the database connection and index readiness.
5. Confirm the dev routes are absent.
6. Sign in as the super-admin, register a passkey and verify the audit chain.
7. Take a backup before the pilot.

The full checklist is in `docs/deployment.md`. This book does not replace it; it explains why each item exists.

### What can go wrong

- **Build fails with warnings as errors** → `CI=true` makes CRA warnings fatal. Fix the warning; do not disable CI.
- **Start fails with a configuration error** → read the `Refusing to start:` line. It names the variable or the failed check.
- **Start fails on index initialization** → duplicate data or an incompatible existing index. Inspect the collection named in the error.
- **App loads but API calls fail** → the static build is served but the API is down, or `REACT_APP_API_URL` points at the wrong origin. Check the network tab and `/health`.
- **Sign-in succeeds but the session does not persist** → cookies are cross-site (split deployment) or `Secure` is missing over HTTPS. Use the one-service shape.
- **Google button does not render** → the client ID is missing or the CSP blocked the Google script. Check the browser console.
- **Health check fails and Render restarts the service** → `/health/ready` is 503 because MongoDB is not connected. Check `DB_URI` and Atlas network access. Do not point the health check at `/health` to hide the problem; that would route traffic to a service that cannot serve data.

## 93. Environment variables

### The rule

Production reads the process environment only. Development and test load `attendance-backend/config/config.env`. The file is not a backup of production configuration and must never be committed.

### Core

| Variable | Required | Meaning |
| --- | --- | --- |
| `NODE_ENV` | Yes in production | `production` enables production checks, secure cookies, HSTS and static serving behaviour |
| `PORT` | Provided by Render | HTTP port. Do not set it manually on Render |
| `DB_URI` | Yes | MongoDB connection string, including the database name |
| `MONGODB_URI` | Alias | Accepted if `DB_URI` is absent; prefer `DB_URI` |
| `JWT_SECRET` | Yes in production | Signing secret, at least 32 characters, not a placeholder |
| `JWT_SECRET_PREVIOUS` | No | Verification-only secret for a rotation window; must differ and be removed afterwards |
| `JWT_EXPIRE` | No | Token lifetime, default `5d` |
| `COOKIE_EXPIRE` | No | Cookie lifetime in days; must be positive |
| `COOKIE_SAMESITE` | No | `lax` (default), `strict` or `none`; `none` forces `Secure` |
| `CLIENT_URL` | Yes for split hosting | Exact frontend origin |
| `CLIENT_URLS` | No | Comma-separated extra allowed origins |

### Identity and access

| Variable | Meaning |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth Web client ID the server verifies |
| `TEACHER_EMAILS` | College addresses that may bootstrap a teacher account on first sign-in. Must be `@nitjsr.ac.in` |
| `TEST_STUDENT_EMAILS` | Non-college addresses allowed to sign in as students without a roster. Rehearsal only, max 10 |
| `TEST_TEACHER_EMAILS` | Non-college addresses allowed to sign in as teachers. Rehearsal only, max 10 |
| `SUPER_ADMIN_EMAILS` | Exact addresses granted `superadmin`. May be Gmail. Must not overlap any other list, max 10 |
| `SUPER_ADMIN_SESSION_HOURS` | Admin session lifetime, 1–72, default 12 |

Startup validation rejects:

- a malformed address;
- a duplicate within a list;
- an address in more than one list;
- a college address in a test list;
- a Gmail address in `TEACHER_EMAILS`;
- more than 10 entries in a test or super-admin list;
- an `@dev.invalid` address in a real allowlist.

Removing an address from `TEACHER_EMAILS` or a `TEST_*` list blocks new sign-ins and rejects a live session on its next request. It does not demote the stored user row. Removing a super-admin has the same immediate effect and is re-checked on every authenticated request.

### Development-only

| Variable | Meaning |
| --- | --- |
| `DEV_AUTH_ENABLED` | `true` mounts the dev persona routes; refused in production |
| `DEV_AUTH_ACCOUNTS` | Optional persona list in `key:role:name:email` form |
| `ALLOW_TEST_ROSTER_EMAILS` | Allows exact `TEST_STUDENT_EMAILS` on a dev/test roster; refused in production |

### WebAuthn and passkeys

| Variable | Meaning |
| --- | --- |
| `WEBAUTHN_ORIGINS` | Comma-separated HTTPS origins allowed to use passkeys. Required in production unless `RENDER_EXTERNAL_URL` supplies one |
| `WEBAUTHN_RP_ID` | Optional relying-party ID; defaults to the first origin's hostname. Must be that hostname or a parent domain |
| `WEBAUTHN_RP_NAME` | Optional display name, default `Bio Attend` |
| `RENDER_EXTERNAL_URL` | Render's automatic external URL; used as a WebAuthn origin fallback |

The server reads WebAuthn origins from configuration, never from the request's `Origin` header. A request header is attacker-controlled; the expected origin must not be.

### Frontend build-time variables

| Variable | Meaning |
| --- | --- |
| `REACT_APP_API_URL` | API base; `/api/v1` for the one-service shape |
| `REACT_APP_GOOGLE_CLIENT_ID` | Must match the backend client ID |
| `REACT_APP_GOOGLE_HOSTED_DOMAIN` | Leave empty for Gmail owners; setting it filters the Google chooser |
| `REACT_APP_VERSION` | Optional display/report version |

Create React App embeds `REACT_APP_*` values in the JavaScript bundle. Changing one requires a rebuild and redeploy, not a restart. Treat them as public: anyone can read the bundle.

### What must not be set in production

```text
DEV_AUTH_ENABLED=true
ALLOW_TEST_ROSTER_EMAILS=true
```

Startup refuses both. The reason is not tidiness: both widen who can sign in or be placed on a roster. A production deployment should not depend on an operator remembering to unset them.

### Configuration validation

`utils/validateEnv.js` runs before the app loads. It:

- rejects a missing, short or placeholder `JWT_SECRET`;
- validates `JWT_SECRET_PREVIOUS`;
- checks `DB_URI` starts with `mongodb://` or `mongodb+srv://`;
- warns if `GOOGLE_CLIENT_ID` is empty;
- validates `COOKIE_EXPIRE` and `SUPER_ADMIN_SESSION_HOURS`;
- rejects an unknown `COOKIE_SAMESITE`;
- warns if `SUPER_ADMIN_EMAILS` is empty (the console would be unreachable);
- refuses the rehearsal roster flag;
- requires a valid HTTPS WebAuthn origin and a compatible RP ID.

`utils/signInPolicy.js` and `utils/devAuth.js` add the allowlist and persona checks. All three run in `index.js` before `require('./app')`, so a bad configuration stops the process before it can open a listener.

### What can go wrong

- **A secret in the repository** → rotate it immediately. Removing the commit is not enough; assume it is compromised.
- **A trailing slash in `CLIENT_URL`** → the CORS/origin comparison normalises it, but a mismatch in a separate browser origin can still fail. Prefer no trailing slash.
- **`COOKIE_SAMESITE=none` on a single-origin deployment** → unnecessary and weaker; use the default.
- **A Gmail in `TEACHER_EMAILS`** → startup refuses it. Use `SUPER_ADMIN_EMAILS` for the owner, or a college address for a teacher.
- **Overlapping allowlists** → startup refuses; the error names both lists.
- **Missing `WEBAUTHN_ORIGINS`** → production startup refuses, because every destructive admin action would be unreachable.
- **An HTTP WebAuthn origin in production** → refused. Passkeys require a secure context.
- **Changing `JWT_SECRET` without a rotation window** → every session is signed out. That may be exactly what an incident needs, but it should be deliberate.
- **Leaving `JWT_SECRET_PREVIOUS` forever** → an old leaked secret remains valid for verification. Remove it after one session lifetime.

## 94. Health and readiness

### Two probes, two questions

| Endpoint | Question | Response |
| --- | --- | --- |
| `GET /api/v1/health` | Is the process alive? | `200 {"success":true,"status":"ok"}` |
| `GET /api/v1/health/ready` | Can it serve data? | `200` when MongoDB is connected; `503` otherwise |

The split matters. A process can be alive but unable to reach the database. If the liveness probe also checked the database, an orchestrator would restart a healthy process during a database outage, making the outage worse. If the readiness probe only checked the process, traffic would be routed to a service that returns 500 for every data request.

The readiness response is:

```json
{
  "success": true,
  "status": "ready",
  "checks": { "database": true }
}
```

When not ready:

```json
{
  "success": false,
  "status": "not-ready",
  "checks": { "database": false }
}
```

`isDbReady()` checks Mongoose's connection state. It does not run a query. A connection can be technically open while the database is slow; readiness does not measure latency. It answers the coarse question.

### The startup order

`index.js` calls `startServer`:

```text
connect -> initIndexes -> log readiness -> listen
```

Each step is awaited:

1. `connectdatabase()` opens Mongoose.
2. `initIndexes()` calls `.init()` on every registered model and waits for all of them.
3. The process logs how many models are ready.
4. Only then does `app.listen` run.

Why not listen first? A fresh database with no indexes would accept concurrent writes. Two requests could insert documents that a unique index would have rejected. The later index build would then fail because duplicates already exist. On a fresh deployment this can leave a permanently broken unique constraint. Building indexes before accepting traffic removes that race.

If connection, index initialization or the listener fails, the process logs the reason and exits 1. It does not retry forever in-process. Render's restart policy or the operator handles the retry.

### The query sweeper

After the listener starts, `index.js` sets an interval every five minutes:

```js
expireStaleQueries().catch(...)
```

The interval is `unref()`ed, so it does not keep the process alive by itself. The API also expires queries lazily before most query and attendance reads. The sweeper exists so an expired query changes state even if nobody opens a page.

The sweep is not a transaction. Each query is expired with an atomic `findOneAndUpdate`, then audited. A crash between the two leaves an expired query with no audit row; the next sweep will not pick it up because it is no longer pending. This is a known small gap.

### Graceful shutdown

`index.js` handles:

- `uncaughtException` → log, shut down, exit 1;
- `unhandledRejection` → log, shut down, exit 1;
- `SIGTERM` → shut down, exit 0;
- `SIGINT` → shut down, exit 0.

The shutdown:

1. Sets a `shuttingDown` flag, so a second signal does not run the sequence twice.
2. Clears the query sweeper.
3. Stops accepting new connections with `server.close`.
4. Allows in-flight requests to finish.
5. Sets a 10-second force timer; if a stuck keep-alive connection prevents close, the process exits anyway.
6. Calls `server.closeIdleConnections()` if available.
7. Closes Mongoose with `false` (do not wait for background index builds).
8. Exits with the appropriate code.

Render sends `SIGTERM` on deploy or restart. A clean shutdown avoids cutting a request in half. The 10-second bound prevents a deploy from hanging forever on an idle socket.

### Why readiness uses 503, not 500

`503 Service Unavailable` is the standard signal that the service is temporarily unable to handle the request. A load balancer can remove the instance and retry later. `500` suggests an application bug. The distinction matters to monitoring and to Render's health check.

### What health does not cover

- **Disk space** — not checked.
- **Memory pressure** — not checked.
- **Atlas latency** — not checked.
- **Google reachability** — not checked.
- **PDF.js loadability** — not checked.
- **Rate-limit state** — in-memory, not checked.
- **Audit chain integrity** — not checked; the admin verify route is separate.

A green health check means "the process is up and Mongoose is connected", not "every dependency is healthy".

### What can go wrong

- **`/health` is 200 but `/health/ready` is 503** → the process is alive, MongoDB is down or still connecting. Check `DB_URI`, Atlas network access and the startup log.
- **Both are unreachable** → Render is sleeping, the process crashed, or the port is wrong.
- **Health check passes but requests 500** → the database is connected but a query/model/index is failing. Check the logs.
- **Restart loop** → the startup log names the failure. A bad secret, a bad allowlist or a bad index all stop before listening.
- **Deploy hangs on shutdown** → a stuck connection hits the 10-second force timer; the deploy continues, but investigate the leak.
- **The sweeper never runs** → the interval is set only after a successful listen. If the process never listened, there is nothing to sweep.
- **Clock skew** → expiry is based on server time. A skewed server changes when keys and queries expire; use a time-synchronised host.

## 95. Backup and restore

### Why this is not optional

Atlas M0 has **no automated backups**. A bad migration, an accidental attendance deletion, a wrong roster replacement or a compromised database account has no recovery path without a backup. The repository's scripts and runbook exist so the recovery path is tested before it is needed.

The backup contains student names, emails, attendance records, queries and audit data. It is personal data. Treat the encrypted file as carefully as the database.

### The encryption pipeline

`scripts/backup-db.sh`:

1. Requires `DB_URI` and `BACKUP_PASSPHRASE`.
2. Refuses a passphrase shorter than 16 characters.
3. Requires `mongodump` and `openssl`.
4. Streams `mongodump --archive --gzip` directly into:

```text
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt
```

5. Writes one file: `backups/attendance-<UTC timestamp>.archive.gz.enc`.
6. Decrypts the file back through `gzip -t` to verify the passphrase and archive integrity.
7. Writes a `.sha256` sidecar if `sha256sum` or `shasum` is available.

No plaintext dump is written to disk. The checksum detects accidental corruption; it is not a keyed signature, so an attacker who can rewrite the backup can also rewrite the checksum. Protect the storage account.

### Taking a backup

```bash
export DB_URI='mongodb+srv://...'
export BACKUP_PASSPHRASE='...'
./scripts/backup-db.sh
```

Take one:

- before every production deploy;
- weekly during the pilot;
- before any migration or bulk roster change;
- before a demo reset if the demo data matters.

Keep at least seven daily and four weekly encrypted copies. Store one copy off the machine that runs the backup. The `backups/` directory and encrypted archive patterns are gitignored.

### The restore drill

`scripts/restore-db.sh` deliberately refuses to restore over the source database:

- `RESTORE_DB` must not equal `SOURCE_DB`;
- `RESTORE_DB` must contain `_restore_` or `_drill_`;
- the backup file must exist;
- `mongorestore` and `openssl` must be installed.

It decrypts the archive and pipes it into:

```text
mongorestore --uri=... --archive --gzip \
  --nsFrom="attendance.*" --nsTo="attendance_restore_YYYYMMDD.*"
```

The namespace mapping is what keeps production untouched. Run it with:

```bash
export DB_URI='mongodb+srv://...'
export BACKUP_PASSPHRASE='...'
export BACKUP_FILE='backups/attendance-....archive.gz.enc'
export SOURCE_DB='attendance'
export RESTORE_DB='attendance_restore_20261105'
./scripts/restore-db.sh
```

### Verifying the drill

Compare collection counts between source and restored:

```javascript
const source = db.getSiblingDB("attendance");
const restored = db.getSiblingDB("attendance_restore_20261105");
for (const name of source.getCollectionNames().sort()) {
  print(name, source.getCollection(name).countDocuments(), restored.getCollection(name).countDocuments());
}
```

Acceptance:

1. `users`, `courseclasses`, `enrollments`, `checkinsessions`, `attendancerecords`, `attendancequeries`, `timetables` and `auditlogs` counts match.
2. One known student and one known class can be read from the restored database.
3. The scratch database is deleted.
4. The date, backup file name, passphrase location and result are recorded in an operator log — never the passphrase itself.

### What the current status actually proves

The scripts have been exercised with stub `mongodump`/`mongorestore` binaries:

- the encrypted file passes decrypt-and-gzip;
- the restore arguments map `attendance.*` to a scratch database;
- a wrong passphrase is rejected.

That proves the script plumbing, not MongoDB restore correctness. A real drill needs the Atlas URI, the passphrase and MongoDB Database Tools. Until it is done, the recovery path is unverified.

### Restore is not a merge

`mongorestore` writes documents into the target namespace. It does not reconcile conflicts, re-run application validation or repair references. A restore into a database that already has data can create duplicates or overwrite documents. That is why the drill uses a fresh scratch database and why production restore is a deliberate, documented operation, not a casual command.

### The audit chain after a restore

The audit rows are restored with their `seq`, `hash` and `prevHash`. If the backup was internally consistent, the chain verifies after restore. If the restore spans a backup taken mid-write, the last rows may be missing; the chain still verifies up to the last complete row. Do not "fix" a chain by editing rows.

### What backups do not cover

- **Deleted files outside MongoDB** — there are none that matter; uploads are not stored.
- **Lost device private keys** — they live in the student's browser, not the database. A restore does not bring them back; the student re-binds and waits for approval.
- **Lost passkeys** — they live in the authenticator, not the database. A restore does not recover them. The recovery path is removing the account's `adminpasskeys` rows and registering a new first passkey.
- **Secrets** — `JWT_SECRET`, `DB_URI` and the backup passphrase are environment/operator secrets. A database restore does not restore them.
- **A compromised backup passphrase** — an attacker with the encrypted file and the passphrase has the data. Rotate the passphrase and re-encrypt future backups.

### What can go wrong

- **Wrong passphrase** → decryption fails; the script exits non-zero. The backup file is not corrupted; the passphrase is wrong.
- **Corrupted file** → `gzip -t` fails. Try another copy.
- **`mongodump` missing** → the script tells you to install MongoDB Database Tools.
- **Disk full** → the encrypted file is truncated; the verification fails. Free space and retry.
- **Restoring to the source database** → the script refuses. Do not bypass it.
- **Deleting the scratch database before verifying** → you lose the evidence of the drill. Verify counts first.
- **Leaving the backup on the same laptop** → a theft or disk failure loses both the database and the backup. Keep an off-machine copy.
- **Putting the passphrase in shell history** → use a password manager and a non-echoing prompt, not a pasted command in a shared terminal.

## 96. Troubleshooting by symptom

### The service will not start

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `Refusing to start: JWT_SECRET ...` | Missing, short or placeholder secret | Set a random 32+ character secret |
| `Refusing to start: DB_URI ...` | Missing or malformed connection string | Set `DB_URI` or `MONGODB_URI` |
| `Refusing to start: database connection failed` | MongoDB/Atlas unreachable, wrong credentials, IP access | Check the URI, user, password and network access |
| `Refusing to start: database index initialization failed` | Duplicate data or an incompatible index | Read the collection name in the error; clean the data |
| `Refusing to start: ... EMAIL ...` | Bad allowlist, overlap or wrong domain | Fix the named variable |
| `Refusing to start: WEBAUTHN ...` | Missing/insecure origin or bad RP ID | Set an HTTPS origin that matches the console |
| `Refusing to start: DEV_AUTH_ENABLED ...` | Dev auth in production | Remove the flag |
| `Refusing to start: ALLOW_TEST_ROSTER_EMAILS ...` | Rehearsal flag in production | Remove the flag |
| `Cannot find module` | Dependencies not installed | `npm install` in the right project |
| Node version error | Node older than 22.13 | Upgrade Node or set `NODE_VERSION=24` |

### The service starts but requests fail

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `/health` 200, `/health/ready` 503 | MongoDB not connected | Check `DB_URI`, Atlas access, startup log |
| Every API call 500 | Database connected but a model/query fails | Check the server log for the stack trace |
| 401 on every page | No session, expired cookie, changed `JWT_SECRET`, disabled account | Sign in again; check the secret and account status |
| 403 on a teacher route | Wrong role, or the class belongs to another teacher | Use the right account; teacher routes do not accept a super-admin |
| 404 on a known class | Invalid id or not owned by the caller | Check the id and ownership; 404 deliberately hides existence |
| 428 on an admin action | No recent passkey step-up | Register a passkey, open Admin → Security, retry |
| 429 on a route | Rate limit exceeded | Wait for the window; limits are in-memory per account/IP |
| CORS error in the browser | Frontend origin not in `CLIENT_URL`/`CLIENT_URLS` | Add the exact origin, no trailing slash |
| 403 `Origin not allowed` on a POST | CSRF origin guard rejected the origin | Add the exact origin, or use same-origin hosting |
| Cookie set but not sent | Cross-site cookie blocked, `Secure` mismatch, wrong domain | Use one origin; check `COOKIE_SAMESITE` and HTTPS |
| `x-powered-by` present | A proxy stripped/re-added headers | Check the proxy; Express disables it |

### Sign-in and accounts

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Google "Access blocked" | Account not a Test user while the consent screen is in Testing | Add it in Google Cloud, or publish the app |
| Gmail missing from the chooser | `REACT_APP_GOOGLE_HOSTED_DOMAIN` set | Clear it, rebuild the frontend |
| Super-admin lands on a student dashboard | Address not in `SUPER_ADMIN_EMAILS`, or overlaps another list | Fix the backend environment; restart |
| A student is rejected at sign-in | Not on an active roster and not in `TEST_STUDENT_EMAILS` | Add to the roster or the test list |
| A removed test account still has access | The stored user row keeps its role; a live session may persist briefly | Removal rejects the next request; delete/demote the row if needed |
| Device approval never appears | Student is not on any class the teacher owns, or the request was already decided | Check the roster and the request status |
| Device key lost after clearing site data | IndexedDB was cleared | Sign in again, claim a new device, wait for approval |

### Check-in and evidence

| Symptom | Likely cause | Action |
| --- | --- | --- |
| "No live session" | Teacher has not started one, or the session closed | Start/resume the session; refresh discovery |
| Microphone will not start | Insecure origin, denied permission, another app holds the mic | Use HTTPS/localhost, allow the mic, close other apps |
| Sample-rate gate blocks | Browser/device cannot represent the band | Use a supported Chrome/device; do not bypass the gate |
| No frame decoded | Phone cannot hear the tone, volume low, distance too far, expired key | Move closer, raise media volume, replay/advance, retry |
| "Key expired" | More than two minutes passed | Teacher advances/replays; student listens again |
| "Wave is no longer current" | Teacher advanced while the phone was decoding | Listen again for the new wave |
| "Proof signature is invalid" | Device key changed, wrong stored public key, corrupted signature | Re-bind the device; check the browser key |
| "Device not approved" | First binding or a pending change | Teacher approves the device |
| "A device change is awaiting review" | A pending request freezes the old device | Teacher decides the request |
| "Not on this class roster" | Student removed after the session started | Add them back if appropriate; the historical row remains |
| Evidence list empty | No proofs yet, wrong session, or proofs older than 24 h TTL | Check the session and time; the register counter may remain |
| Advance returns 409 | No proof for the current wave, session closed, or a concurrent advance | Wait for evidence; refresh; do not blind-increment |
| Start returns 409 | An active session already exists, or the class has no room | Resume the active session; set a default room |
| Register missing a student | They were not on the active roster when the session started | Check enrollments; the snapshot is historical |
| Finalise returns 409 | The session is still active | Close it first |
| Query button hidden | Record already present, query exists, window closed, or queries disabled | Check the session window and settings |

### PDFs and imports

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `pdf_no_text_layer` | Scanned PDF or image-only export | OCR is not built; use CSV/paste |
| `pdf_password_protected` | PDF is encrypted | Remove the password outside the app |
| `pdf_too_large` | Over 10 MB | Compress or split |
| `pdf_too_many_pages` | Over 20 pages | Split the document |
| `pdf_too_much_text` | Over 200,000 characters | Split or reduce |
| `pdf_invalid` | Not a PDF, or no `%PDF-` header in the first 1 KB | Check the file type |
| `pdf_unreadable` | Damaged or unsupported PDF | Re-export it |
| `pdf_missing` | Wrong multipart field name or no file | Send one file in the `file` field |
| `pdf_upload_invalid` | More than one file or a multer error | Send exactly one file |
| Timetable preview shows text but no slots | Expected: A2a is preview-only | Add slots manually |
| Roster extraction works but save fails | Parser errors or no entries | Run Preview roster, fix the lines |
| Roster save drops a student | The save replaces the roster; omitted emails are deactivated | Include every active student before saving |

### Exports and audit

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Export 403 | Not staff, or not the class/session owner | Use the right account or the admin route |
| Export 429 | 30 downloads per 10 minutes | Wait for the window |
| Empty export | Wrong range/class, no sessions, or inverted dates | Check the filters |
| PDF class-average label looks wrong | Known cosmetic bug: `keyValue(doc, doc, ...)` | Do not rely on that label; data is present |
| Audit verify reports a break | A row's hash or link does not match | Restore from a known-good backup; do not edit rows |
| Audit `legacy` count is non-zero | Rows without `seq`/`hash`, including system-expired queries | Informational, not necessarily a break |
| Demo routes 404 | Production, or demo mode disabled | Expected in production; enable in development |

### Frontend and deployment

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Old UI after deploy | Service worker or cached HTML | Hard reload; confirm the new `main.*.js` hash |
| API calls go to localhost in production | Build used the fallback URL | Rebuild with `REACT_APP_API_URL=/api/v1` |
| Google button blocked by CSP | New Google domain or inline script | Check the console; update the policy deliberately |
| Deep link 404 | Static fallback not served | Confirm the build exists and `app.js` mounted it |
| Render sleeps | Free tier inactivity | Warm it before a session or use Starter |
| Split deployment cannot keep a session | Third-party cookies blocked | Move to the one-service shape |
| Passkey prompt says origin is wrong | `WEBAUTHN_ORIGINS` does not match the page origin | Fix the server origin configuration |
| Passkey says already registered | The authenticator already has this credential | Use it, or register a different device |

### The diagnostic order

When something fails, check in this order:

1. **Is the process alive?** `/health`.
2. **Can it reach the database?** `/health/ready` and the startup log.
3. **Is the session valid and the role right?** `/islogin`, then the route's 401/403/404.
4. **Is the origin allowed?** The browser console and the `Origin not allowed` message.
5. **Is a rate limit hit?** 429 and `Retry-After`.
6. **Is the data in the expected state?** The register, the session status, the roster, the query window.
7. **Is the device approved and the key fresh?** The device card and the key countdown.
8. **Is the client running the expected build?** The asset hash and `REACT_APP_*` values.

Do not skip to step 8. A correct build cannot fix a 503 readiness failure, and a fresh deploy cannot fix an expired key.
# Part XII — Tests and verification

The test suites are the project's evidence that the code behaves as described. They are not a proof of the whole product. This part explains what runs, what each group covers, what the counts mean, and where the boundary between automated tests, browser smoke tests and physical measurement lies.

## 97. The backend suite

### How it runs

```bash
cd attendance-backend
npm test
```

`package.json` maps `test` to `node --test`. The runner discovers `test/*.js`, executes each file in its own process by default, and reports pass/fail counts. The second mode:

```bash
npm test -- --test-isolation=none
```

runs every test file in the same process. This catches accidental reliance on process-global state, module cache order or environment mutation. A suite that passes with isolation but fails without it is hiding a shared-state bug; a suite that passes both ways is more trustworthy.

The current recorded result is **255/255 in both modes**. The repository has 39 test files. The static `test(...)` count is lower than 255 because several files generate cases in loops or tables; the runner counts each generated case.

No test requires a live MongoDB. The tests either:

- exercise pure functions directly (parser, proof verification, chain hashing, session state);
- mount an Express router with mocked Mongoose methods and use `fetch` against a random port;
- spawn `index.js` with a deliberately unreachable database to test startup refusal;
- use `node:test` mocks (`t.mock.method`) for model calls.

This keeps the suite fast and deterministic. It also means the suite does **not** prove that a real MongoDB accepts every query, that indexes build on an existing database, or that a real Atlas connection behaves like the mock.

### The groups

#### Startup and configuration

| File | What it checks |
| --- | --- |
| `startup.test.js` | A bad allowlist stops the process before listening; production refuses the rehearsal flag; a database failure exits 1 with the right log and no listener |
| `startServer.test.js` | `listen` waits for both connect and index initialization; connection/index/listener failures exit 1 and never listen |
| `validateEnv.test.js` | Production secret, database URI, cookie, admin-hours, SameSite and WebAuthn checks; placeholder and rotation rules |
| `signInPolicy.test.js` | Role resolution for college, test, super-admin and roster accounts; overlap/domain/size validation |
| `devAuth.test.js` | Dev auth requires non-production plus the explicit flag; persona parsing; production refusal; no email leakage |
| `rehearsalEnrollment.test.js` | The test-roster flag requires non-production, the flag and a test student; the allowlist is exact |
| `envFlag` coverage (inside config tests) | Truthy parsing is explicit, not `Boolean("false")` |

These tests protect the "refuse to start" posture. A missing secret or a Gmail in `TEACHER_EMAILS` is not a warning; it stops the service.

#### Authentication, sessions and devices

| File | What it checks |
| --- | --- |
| `googleAuthController.test.js` | The Google token exchange path returns a cookie session and never the JWT in JSON |
| `sendToken.test.js` | Cookie options and token sending, including production flags |
| `verifyJwt.test.js` | Expired/invalid tokens map to 401, not 400 |
| `authMiddleware.test.js` | A disabled account or changed version is rejected |
| `logout.test.js` | Logout is POST-only; GET returns 405 with `Allow: POST` |
| `sessionVersion.test.js` | Role/status changes and explicit revocation bump the version; a profile edit does not |
| `adminUserRevocation.test.js` | Admin revocation bumps the target and invalidates its live session |
| `deviceBinding.test.js` | Fingerprint stability, public-only storage, P-256 validation |
| `deviceBindingClaim.test.js` | First binding waits for review; private key material is rejected; test accounts auto-approve; an approved device stays approved; approving one retires other pending requests |
| `deviceReview.test.js` | A teacher decision resolves the request and is scoped correctly |
| `impersonation.test.js` | Cookie impersonation never returns a JWT; bearer clients get one; stopping restores the admin cookie; a pre-bump admin token is rejected |
| `cookieOptions.test.js` | Lax default, Secure in production, `none` forces Secure, Strict honoured, unknown falls back |
| `adminPasskey.test.js` | First passkey trust-on-first-use; additional passkey needs step-up; only the public credential is saved; no-passkey step-up fails; a verified assertion sets the cookie |
| `webauthn.test.js` | Origin/RP-ID configuration, challenge handling and verification helpers |

#### Security headers, origins and limits

| File | What it checks |
| --- | --- |
| `csp.test.js` | Production forbids inline scripts and frames; development does not force HTTPS upgrades; the policy is not tied to a stale `NODE_ENV` |
| `appWiring.test.js` | The real app mounts the origin guard before the proof route, the proof/PDF routes behind auth, health and readiness, no-store and baseline headers |
| `originGuard.test.js` | Evil origins cannot mutate with any unsafe method; same-origin and allowlisted origins pass; no-Origin CLI traffic passes; cross-site no-Origin browser requests are rejected; GET is unaffected; dev tunnels are dev-only; a cross-site cookie cannot start or close a session |
| `rateLimit.test.js` | The window allows up to the limit, returns 429, resets, and counts each IP separately |

#### Acoustic proof and sessions

| File | What it checks |
| --- | --- |
| `checkInProof.test.js` | Browser/server message equality, shared key/wave bounds, malformed input rejection, real P-256 verification and tamper failure, payload shape, accept/duplicate/closed/stale/expired/wrong-key decisions, evidence-only views, unique index, stored signature/version, pending-device block, structured logging without secrets, rate limiting |
| `checkInProofController.test.js` | The controller-level proof path, including the evidence response contract |
| `checkInSession.test.js` | Key space equals 15^7, full-space minting, initial wave 0 and two-minute key, validation, exact-expiry behaviour, idempotent close, bounded history, teacher/student views, model's one-active-session index and key range |
| `checkInSessionAdvance.test.js` | The advance route/state transition, including the evidence gate and concurrency behaviour |
| `studentActiveSessions.test.js` | Student discovery returns live sessions without a key and handles multiple/no sessions |

#### Audit

| File | What it checks |
| --- | --- |
| `auditChain.test.js` | Hash stability across key order, previous sequence/hash linkage, clean verification, tamper detection, fork detection, gap detection, IP source |
| `auditActions.test.js` | Every literal audit action is in the model allowlist; revocation, device decisions, passkey events and export actions are auditable |

#### Rosters, PDFs and HTTP errors

| File | What it checks |
| --- | --- |
| `roster.test.js` | CSV header + identity derivation, duplicate/non-institutional errors, quoted names, exact rehearsal allowlist, college rule unchanged |
| `pdfText.test.js` | Visual line reconstruction, per-character joining, top-to-bottom order, multi-page output, no-text result, header/size/page rejection |
| `pdfImport.test.js` | Roster PDF extraction is preview-only; non-PDF, no-text, missing file, unowned class |
| `pdfRoute.test.js` | The real multipart roster route extracts without saving, rejects non-PDF with a stable code, requires a teacher |
| `timetablePdf.test.js` | The timetable preview controller extracts text and statistics; no slot writes |
| `timetablePdfRoute.test.js` | The multipart timetable route, auth, limits and stable errors |
| `errorMiddleware.test.js` | 401/400 mapping, duplicate-key messages, malformed JSON safety, stable import error code, `status`/`statusCode` normalisation |

#### Settings and admin

| File | What it checks |
| --- | --- |
| `settingsUpdate.test.js` | Settings validation, ranges, production demo gate and audit fields |
| `adminPasskey.test.js`, `adminUserRevocation.test.js`, `impersonation.test.js` | Covered above; these are the high-privilege admin controls |

### What the counts mean

A test case is not a line of code. The 255 cases include table-driven cases generated inside a single `test(...)` call. The number is useful as a regression signal: a drop means a test disappeared; a failure names the behaviour. It is not a coverage percentage. The project does not publish a line-coverage figure, and this book does not invent one.

### Why `node:test` instead of a framework

- No extra dependency beyond Node.
- Built-in mocking (`t.mock.method`).
- Parallel file execution by default.
- The same runner in CI and locally.
- No transpiler or config file to drift.

The tradeoff is fewer conveniences than Jest: no snapshot testing, no built-in coverage UI, no watch mode as polished. For this codebase, the assertions are explicit and the tests read as code.

### The isolation mode

Running with `--test-isolation=none` shares the module cache and process globals. Several tests deliberately mutate `process.env` before requiring a module, because `app.js` and some utils read configuration at require time. Without isolation, a test that changes `NODE_ENV` can leak into the next file. The suite passes both modes because those tests restore their environment in `t.after` or set it before the first require.

This is fragile by design. A future test that forgets to restore an environment variable could pass in isolation and fail in shared mode, or vice versa. Running both modes is the guard.

### What can go wrong when running the suite

- **A test hangs** → usually a server that was not closed. Each route test should `t.after(stop)`.
- **A port conflict** → tests use `listen(0)` for a random port; a fixed port would collide.
- **An environment leak** → a test that sets `NODE_ENV=production` and does not restore it changes the next test's behaviour. Use `t.after`.
- **A mocked model masks a real query error** → the suite cannot catch it. That is a known boundary.
- **A generated PDF differs across PDFKit versions** → the fixture tests assert text content, not byte equality, so minor rendering changes are tolerated.
- **Node version drift** → PDF.js 6 requires 22.13+; an older Node fails at import, not at an assertion.
- **A flaky timing test** → rate-limit and expiry tests use explicit clocks where possible; a wall-clock test can flake on a loaded machine.

## 98. The frontend helper suites

### Why the frontend tests are separate

The frontend has no Jest component suite. The tested logic is extracted into pure helper modules under `src/acoustic`, `src/components/.../*.node-tests.js` and `src/utils/*.node-tests.js`, and run with `node --test`. That means:

- no jsdom, no React renderer, no browser;
- fast, deterministic tests of the maths, parsing and formatting;
- the components are smoke-tested manually in a browser.

The test files use the suffix `*.node-tests.js`, not `*.test.js`, so Create React App's Jest runner does not pick them up. The npm scripts name each file explicitly.

### The seven suites

| Script | File | Count | What it covers |
| --- | --- | --- | --- |
| `test:proof` | `src/acoustic/proof.node-tests.js` | 15 | Proof message format, malformed fields, shared bounds, P-256 signing, signature length, missing key/WebCrypto, submit body, server error surfacing, non-JSON response, missing API URL, 204, null body, unreadable body, network failure |
| `test:acoustic` | `fsk`, `lab`, `worklet`, `link`, `pcm-worklet` | 51 | Frame structure, value↔digits, random round trips, 48 kHz and 44.1 kHz decoding, leading silence, noise, echo, false positives, checksum, detection margins, probe list, sample-rate gate, verdict boundaries, sweep summary, tone plan/fades, medians, baseline gate, peak hold, meter clamping, mic errors, 19.5 kHz alias test, report formatting, run IDs, links, TX/RX plans and reports, PCM buffer |
| `test:checkin` | `checkInSessionView.node-tests.js` | 7 | Active-session selection, labels, live key state, wave/key helpers, countdown formatting, history durations |
| `test:studentcheckin` | `studentCheckInView.node-tests.js` | 9 | Session selection, Join gate order, decoded-key bounds, evidence view without key, idempotent retry, malformed response, countdown/time formatting |
| `test:auth` | `auth.node-tests.js` | 2 | Role-to-dashboard routing |
| `test:rosterimport` | `rosterImport.node-tests.js` | 6 | PDF detection by MIME/extension, extraction summary plurals, no-email warning, scanned-PDF message, server-message fallback |
| `test:timetableimport` | `timetableImport.node-tests.js` | 6 | PDF detection, page/line summary without claiming a slot, missing counts, scanned message, password/size errors, fallback |

Total: **96/96**.

### What the acoustic tests actually do

The codec tests are the strongest evidence in the frontend suite:

- **Synthetic encode/decode**: 1000 random keys at 48 kHz and 200 at 44.1 kHz, with no noise. This proves the maths, not the room.
- **Leading silence**: the decoder finds a frame after 0–500 ms of silence. This proves the search window.
- **Noise sweep**: a decode rate at several noise levels. The test records the rate; it is not a claim about a real classroom.
- **Echo**: one echo tap plus noise. This models a wall reflection, not a full reverberant room.
- **False positives**: audio with no valid frame should not decode. This is the guard against a confident wrong key.
- **Checksum**: flipped symbols are rejected. This is the last line of defence against a corrupted frame.
- **Sample-rate gate**: 44.1 kHz is accepted, below it is refused, a missing track rate warns. The 19.5 kHz alias test shows why: a 32 kHz recording aliases 19.5 kHz to 12.5 kHz and the tone is not recoverable.
- **Detection margin**: silence is quiet, a played tone is detected with a healthy margin. The 9 dB rule is tested at the decision boundary, not on a phone speaker.

The tests use generated buffers, not a microphone. They cannot prove that a particular phone's speaker or microphone behaves as modelled.

### What the proof tests do

- The browser and server build the **same** versioned message. This is a cross-language contract test: a change on one side without the other fails.
- The key and wave bounds are shared constants.
- A real P-256 key signs and the server-side verifier accepts; tampering fails.
- `submitProof` posts the exact body and surfaces the server's message.
- A 204 is accepted as no body; a 200 JSON `null` is rejected; an unreadable body is rejected; a network failure becomes status 0.

These tests exercise Web Crypto in Node. They do not prove that a specific browser's IndexedDB and `crypto.subtle` behave identically, though the APIs are standard.

### What the view-helper tests do

The check-in and student-check-in helpers are pure functions extracted from large JSX files. They test:

- which session is selected when several are live;
- the order of the Join gate: device, session, expiry, consent;
- that a decoded key uses the same bounds as the proof;
- that an evidence response becomes a view without the key;
- that a duplicate is marked "already recorded";
- that a malformed response never looks like evidence;
- countdown and duration formatting, including bad values.

This is where the evidence-only contract is tested at the UI boundary: the evidence view cannot contain an attendance status because the helper never produces one.

### What is not tested on the frontend

- React rendering, hooks, effects, routing and CSS.
- The actual `getUserMedia` call and AudioWorklet loading in a browser.
- IndexedDB persistence across reloads.
- The Google Identity Services callback.
- The service worker lifecycle.
- The PDF upload UI and modal.
- Accessibility.

Those are manual smoke areas. The build catches syntax and import errors; it does not catch a broken button handler.

### What can go wrong

- **A helper test passes but the component ignores the helper** → the component must call the tested function. A code review or a browser smoke is the guard.
- **The Node version differs from the browser** → Web Crypto and `TextEncoder` are standard, but subtle differences exist. The P-256 test is strong evidence, not a guarantee.
- **A test uses a fake clock** → a real countdown can still drift. The server enforces expiry regardless.
- **A generated tone is too clean** → the test proves the decoder, not the speaker/microphone chain.
- **`npm run test:acoustic` is not run in CI** → the counts are only as good as the last local run. The deployment checklist requires all seven scripts.

## 99. Browser smoke tests and their limits

### What "browser smoke" means here

There is no Playwright, Cypress or Selenium suite in the repository. Browser verification is a manual walkthrough in Chrome, recorded in the project's status notes. It checks that pages render, requests succeed, cookies behave, and the major flows can be completed. It is not automated and not reproducible from a single command.

### What has been smoke-tested

The recorded local walkthroughs cover:

- the landing, login and role dashboards;
- teacher room/class/roster creation and persistence across refresh;
- device binding, teacher review, approval and a second-browser review;
- starting a check-in, viewing the key and countdown, opening the transmitter;
- student consent, capture, proof submission and the evidence card;
- advancing a wave and closing a session;
- the register, marking, finalising and a student query;
- analytics, exports, notifications and profile;
- the admin console, passkey registration and the audit verify button;
- CSP page loads on seven pages with zero violations;
- a Chrome virtual-authenticator passkey run.

The exact dates and results are in `progress.md`. This book treats them as recorded manual evidence, not as a repeatable automated gate.

### What has not been browser-tested

- **The A2a timetable PDF modal** — the route and helper tests exist, but no browser smoke was recorded for the modal with a real PDF.
- **A real text-based college timetable PDF** — no representative sample has been supplied.
- **A real scanned PDF** — OCR is not built; the error path is tested, not a real scan.
- **A real Google sign-in on the deployed Render URL** — the owner controls the OAuth client and the deployment. The signed run in [`docs/testing-plan.md`](../testing-plan.md) is the pending browser check.
- **A physical two-phone multi-wave rehearsal on the deployed site** — pending.
- **iOS/Safari** — out of scope.
- **Screen readers and keyboard-only navigation** — partially checked, not audited.
- **Slow networks and offline transitions** — the service worker path is reasoned and manually checked, not systematically tested.
- **A 40-student class at once** — no load test.

### The CSP audit

The recorded audit loaded seven pages and checked the browser console for Content-Security-Policy violations. A clean result means the current policy allows everything the app actually loads on those pages. It does not mean the policy is complete: a new dependency, a new Google endpoint or a new inline style can violate it later. The policy is strict by design (`script-src 'self' https://accounts.google.com`, no `unsafe-inline` for scripts, `frame-ancestors 'none'`). When a page breaks after a dependency change, check the console before widening the policy.

### The virtual-authenticator run

Chrome's virtual authenticator can create and assert a passkey without hardware. The recorded run proves:

- the registration options reach the browser;
- the credential is created and verified;
- the public credential is stored;
- a destructive admin action returns 428 before step-up and succeeds after;
- the audit chain records the passkey events.

It does **not** prove that a real Touch ID, Windows Hello or hardware key behaves identically. The WebAuthn protocol is standard; the authenticator UX is not.

### Why manual smoke still matters

Automated tests mock the database and the browser. A manual smoke catches:

- a route that renders but calls the wrong endpoint;
- a cookie that is set but not sent;
- a button that is disabled by a stale state;
- a modal that is clipped or unreachable;
- a CSS change that hides an important control;
- a real microphone permission prompt;
- a real Google popup;
- a service worker serving an old shell.

None of these are visible in `node --test`.

### How to run a smoke test responsibly

1. Use a development build and a local database you can reset.
2. Sign in as each role: student, teacher, super-admin.
3. Check the browser console and network tab, not just the screen.
4. Confirm the evidence card says "Evidence recorded", not "Present".
5. Confirm a timetable PDF preview creates no slot.
6. Confirm a roster PDF fills the textarea but does not save.
7. Confirm the admin destructive action returns 428 before a passkey.
8. Confirm `/health/ready` is 200 before starting.
9. Record what was tested, on which browser/device, with which commit.

These steps are the short local smoke. The full deployed run — 4 phones, 3–4 laptops, real college accounts, acoustic range, admin security, PDF previews and the conditional restore drill — has its own click-level script in [`docs/testing-plan.md`](../testing-plan.md). Follow its preflight gates; do not start signed testing until the Render dashboard commit matches the reviewed `HEAD`.

### What can go wrong

- **A smoke passes on localhost but fails on HTTPS** → secure-context differences, cookie flags, or a proxy header.
- **A smoke passes with one account but fails with two** → role scoping or a cached session.
- **A smoke passes on a desktop but fails on a phone** → microphone, audio context, viewport or touch.
- **A smoke passes before a deploy but not after** → a build-time environment variable or a stale cache.
- **A smoke is treated as a regression suite** → it is not automated; a future change can break the same flow without anyone re-running it.

## 100. What the tests prove and what they do not

### What the suite proves

- The pure algorithms behave as specified: FSK encode/decode, checksum, Goertzel detection, Haversine distance, proof message construction, P-256 verification, audit hashing.
- The parsers enforce their rules: roster emails, CSV quotes, duplicates, bounds; PDF header, size, page and character limits.
- The route wiring is in the right order: origin guard before mutation, auth before body handling, teacher ownership before PDF extraction.
- The security decisions are implemented: device review, pending-change freeze, passkey step-up, role/status version bumps, POST-only logout, no-store headers, CSP.
- The evidence-only contract is enforced in code and views: no attendance field on a proof, `attendanceDecided: false`, no key in student views, no secret in teacher proof views.
- The audit chain detects tampering, forks and gaps.
- The startup refuses unsafe production configuration.
- The frontend helpers sign the exact server message and never turn a malformed response into evidence.

### What the suite does not prove

- **Physical range.** No automated test sends sound through air. The recorded sweep is 10/10 at 1 m, 9/10 at 2 m, 9/10 at 3 m, 4/10 at 5 m, 1/10 at 10 m. Reverse direction and the muted control were not measured.
- **Real device behaviour.** The tests use synthetic buffers and Node's Web Crypto, not a phone speaker, microphone, codec or browser audio pipeline.
- **Real college PDFs.** The fixtures are generated. No representative roster or timetable PDFs exist.
- **OCR or LLM extraction.** Neither is built.
- **A live MongoDB.** Queries are mocked. Index builds, transactions, Atlas latency and duplicate-key races on a real database are not exercised.
- **A real Google sign-in.** The token verification path is tested with mocks; the Google popup and consent screen are manual.
- **The deployed Render version.** The working tree and the live service were not compared.
- **Load and concurrency at classroom scale.** A 40-student burst, two teachers, many proofs per second and a slow network are not load-tested. The rate limiter is in-memory and per process.
- **Accessibility.** No screen-reader or WCAG audit.
- **A real passkey authenticator.** Virtual authenticator only.
- **Browser rendering.** No component tests, no visual regression.
- **Backup restore correctness.** The scripts are plumbed with stubs; no real Atlas restore drill is recorded.
- **Security against a determined attacker.** The tests check the implemented controls, not the absence of unknown vulnerabilities.

### How to describe the evidence honestly

A safe sentence:

> The backend suite passes 255/255 in both isolation modes, the frontend helper suites pass 96/96, and the production build is green. Those tests cover the algorithms, route wiring, validation and security contracts. The acoustic range, real college PDFs, live deployment and physical phone rehearsal remain open and are listed as such.

An unsafe sentence:

> The system is fully tested and works at 10 metres.

The first is specific and bounded. The second turns a build-planning assumption into a claim the evidence does not support.

### The evidence ladder

| Level | Evidence | What it supports |
| --- | --- | --- |
| 1 | Unit tests of pure functions | The maths and parsing are correct for the tested inputs |
| 2 | Route tests with mocked models | The HTTP contract and middleware order are correct |
| 3 | Startup tests with a real process | The service refuses bad configuration and exits cleanly |
| 4 | Manual browser smoke | The pages render and the main flows can be completed on one machine |
| 5 | Physical phone measurement | The acoustic link works at a given distance in a given room |
| 6 | Live deployment verification | The hosted version matches the working tree |
| 7 | Pilot with real users | The product is usable under real classroom conditions |

The project has strong evidence at levels 1–3, recorded manual evidence at level 4, partial evidence at level 5 (1–3 m strong, 5–10 m weak), and no verified evidence at levels 6–7. The book says so rather than blurring the levels.

### What would raise the evidence

- A representative PDF corpus and a measured extraction accuracy per layout.
- A repeatable two-phone test harness with a recorded distance and decode rate.
- A real Atlas restore drill.
- A deployed-version check pinned to a commit hash.
- A browser automation suite for the critical flows.
- A load test for a 40-student session.
- A real Google and passkey rehearsal on the deployed origin.
- A classroom pilot with a teacher and students, including the query workflow.

Until then, the honest claim is: **the code is tested; the physical and operational claims are bounded.**
# Part XIII — Design decisions and tradeoffs

Every engineering project is a pile of choices. This part explains the choices that shaped Bio Attend, the alternatives that were rejected, and the cost of each decision. The goal is not to defend every choice as optimal; it is to make the reasoning visible so someone can disagree intelligently.

## 101. Why evidence-only instead of automatic attendance

### The tempting design

A phone hears the tone, the server verifies the key and signature, and the student is marked present. It is simple, fast, and demo-friendly. For a product whose selling point is "acoustic proof", it looks like the obvious endpoint.

### Why it is wrong

The acoustic signal proves a chain of events:

```text
a speaker played key K in wave W
a microphone heard K
a browser decoded K
a device key signed (session, W, K, student)
```

It does **not** prove:

- the phone was inside the room;
- the student was holding the phone;
- the sound was live rather than a recording;
- the student attended the whole class;
- the device was not compromised;
- the student did not share the key with someone outside.

Each gap is small in a cooperative classroom and large in an adversarial one. A student in the corridor can hear the tone. A friend can play a recording. A rooted phone can expose the key. A phone can be left on a desk while its owner leaves.

Automatic attendance turns a probabilistic signal into an academic record. An error is not a failed demo; it is a wrong mark that can affect a grade, a scholarship or an disciplinary process. The system has no way to appeal an automatic decision because there is no human decision to appeal.

### The chosen boundary

> The acoustic subsystem records evidence. A teacher decides attendance.

The design enforces this in several layers:

| Layer | Enforcement |
| --- | --- |
| Proof model | No `status`, `score` or `attendance` field |
| Proof response | `attendanceDecided: false` |
| Student UI | "Evidence recorded", never "Present" |
| Teacher UI | Evidence list is separate from the register |
| Register | Only a teacher/admin action changes status |
| Audit | Decisions are audited; proofs are not decisions |

The teacher can mark present without evidence (manual roll-call) and absent despite evidence (suspicious circumstances). Both are recorded. The human is accountable, and the audit chain makes the decision visible.

### The cost

- A teacher must spend time marking.
- A student with a working proof can still be marked absent if the teacher has a reason.
- The product cannot claim "zero-touch attendance".
- A large class is more work than an automatic system.

The benefit is that every attendance outcome has a human decision behind it, and the evidence is available to challenge or support that decision.

### Why not a confidence threshold

A tempting middle ground is "auto-mark present above 95% confidence". The project does not have a calibrated confidence measure. The decoder has a detection margin and a checksum, but those measure signal quality, not the probability that the student was in the room. A strong signal from a corridor is still a strong signal. A threshold would create a false precision and hide the judgement inside a number.

### Why not a teacher override with no evidence

The teacher can always mark manually. The evidence is not a gate; it is an input. This preserves the manual roll-call path when the acoustic layer fails, which is important because the 5 m and 10 m measurements show it does fail at range.

### What can go wrong

- **A teacher marks everyone present without looking** → the audit records it, but the system cannot prevent it. The query process and the evidence view are the checks.
- **A teacher marks a student absent despite a proof** → allowed; the teacher may know the phone was shared. The evidence remains.
- **A student assumes a proof is attendance** → the UI must keep saying it is not. The wording is part of the contract.
- **An examiner asks "why not automate?"** → the answer is the gap list above, not a lack of time.

## 102. Why FSK instead of QR, GPS or ultrasonic data

### The alternatives

| Approach | How it works | Why it was not chosen |
| --- | --- | --- |
| QR code | Teacher displays a QR; student scans it | Proves the camera saw the screen, not that the phone was in the room. A screenshot or a shared photo defeats it. It also requires the student to look at the teacher's screen, which is awkward at scale |
| GPS geofence | Student's phone reports a location | Indoor GPS is inaccurate, spoofable and privacy-heavy. A 30 m geofence can include the corridor, the canteen and the next building. It does not prove the phone heard anything |
| Wi-Fi/BLE proximity | Detect a beacon or network | Requires infrastructure, permissions and a beacon per room. BLE addresses rotate; Wi-Fi association is coarse. It proves radio range, not classroom presence |
| Ultrasonic data | Encode a payload in near-ultrasound | The project uses ultrasound as the carrier, but only for a short key, not for a data-rich student identity. A longer payload is slower, more fragile and easier to record and replay |
| NFC tap | Tap the phone on a reader | Proves a tap, not attendance; requires hardware; a friend can tap your phone |
| Manual code | Teacher reads a code, student types it | Proves the student can see/hear the code, not that they are in the room. A shared code travels instantly |
| Camera/face | Face recognition | Privacy, consent, lighting, bias, spoofing and a much larger legal surface. Out of scope |

### Why FSK

FSK — frequency-shift keying — encodes digits as tones. It is:

- **Simple to decode**: a Goertzel filter per tone, no machine learning.
- **Audible to a phone microphone**: the 18–19.8 kHz band is near ultrasound but within the range of many phone speakers and microphones.
- **Short**: seven data symbols plus a marker and checksum fit in about 1.3 seconds.
- **Local**: the phone decodes without sending audio anywhere.
- **Testable**: the same codec runs in Node with synthetic buffers.
- **Cheap**: no extra hardware, no paid API, no beacon.

The key is only a number. The security comes from the device signature and the server's wave state, not from the carrier's data capacity.

### Why not a data-rich ultrasonic payload

A longer payload could include a student id or a nonce per student. That would:

- make the frame much longer and more fragile;
- make the teacher's transmission student-specific, which is impractical for a class;
- make replay easier to record and reuse;
- increase the chance of a decode error in a noisy room.

The chosen design transmits one short key per wave. Every student hears the same key; each signs it with a different device key. The uniqueness is in the signature, not the sound.

### Why not just a QR code

A QR code is more reliable than ultrasound. It also has a fatal semantic gap: a student can scan a photo of the code from anywhere. The acoustic link at least requires the phone's microphone to be in the room at the moment of transmission (or to have a recording of it). Neither proves presence, but the acoustic path is harder to forward casually and leaves a different evidence trail.

The project does not claim ultrasound is unforgeable. It claims it is a useful, low-cost signal that a phone can verify locally, and it pairs that with a device signature and a human decision.

### What can go wrong

- **A phone speaker cannot reproduce 18 kHz** → the lab shows a weak probe; the phone cannot transmit.
- **A phone microphone rolls off above 18 kHz** → the lab shows it; the phone cannot receive.
- **The room is noisy** → the decoder may miss frames; the teacher replays or advances.
- **A student records the tone** → a replay can produce a valid proof if played to a phone. The two-minute key and wave limit the window but do not eliminate replay.
- **A phone is rooted** → the private key can be used by malware. The device review is the compensating control.
- **A QR would have been easier** → true, and that is why the book states the tradeoff rather than pretending acoustics is strictly superior.

## 103. Why this band, this frame and these thresholds

### The band

The codec uses 17 tones from **18,000 Hz to 19,760 Hz**, spaced **110 Hz** apart:

```text
f(tone) = 18,000 + 110 * tone,  tone = 0..16
```

Why this band?

- **Above most speech and room noise.** Human speech energy is concentrated lower; the high band is quieter, which helps detection.
- **Below the Nyquist limit at 44.1 kHz.** 44,100 / 2 = 22,050 Hz. The top tone at 19,760 Hz is below it, with about 2.3 kHz of margin.
- **Within some phone speakers and microphones.** Many devices can reproduce and hear near 20 kHz, though performance varies. The lab measures it per device.
- **Near ultrasound, not audible data.** The tone is at the edge of hearing for many adults; it is not a hidden data channel that can carry a lot of information.

Why not higher? Above 20 kHz, many phone speakers and microphones roll off sharply, and the 44.1 kHz Nyquist limit leaves little room. Why not lower? The band would overlap speech and room noise, and the "near ultrasonic" privacy/attention property would be lost.

The tone spacing of 110 Hz is a tradeoff:

- wider spacing is easier to distinguish but uses more bandwidth and pushes the top tone higher;
- narrower spacing fits more tones but needs a longer detection window and is more sensitive to frequency offset.

At 120 ms per symbol, 110 Hz spacing gives enough cycles for a Goertzel bin to separate adjacent tones. The exact margin is tested with synthetic audio.

### The frame

```text
2 marker symbols + 7 data symbols + 2 check symbols = 11 symbols
11 × 120 ms = 1,320 ms
```

- **Two markers** at 18,000 Hz make the frame easy to find. A single marker could be a random tone; two in a row is a stronger start pattern.
- **Seven data symbols** in base 15 give:

```text
15^7 = 170,859,375 possible keys
```

That is the server's `KEY_SPACE`. A key is an integer in `0..170,859,374`. Seven symbols is enough to make guessing impractical at the route's rate limit, while keeping the frame short.

- **Two check symbols** carry a weighted checksum modulo 225:

```text
check = (1*d0 + 2*d1 + 4*d2 + 7*d3 + 8*d4 + 11*d5 + 13*d6) mod 225
first check digit  = floor(check / 15)
second check digit = check mod 15
```

The weights are fixed and co-prime-ish with 15; they spread a single-symbol error across the check value. Two base-15 digits represent 225 values, which is enough to catch the common single-symbol and many multi-symbol errors. It is not a cryptographic MAC; it is an error-detecting code.

- **No adjacent repeat**: two consecutive data/check tones are never the same. The encoder walks the 16 data tones with a step that skips the previous slot; the decoder inverts the walk. This removes the hardest case for a tone detector (deciding whether a repeated tone is one long symbol or two) and adds a structural check.

- **6 ms raised-cosine fade** at each symbol edge avoids clicks. A click is broadband and can confuse the detector; a smooth envelope keeps the spectrum inside the tone.

### The thresholds

| Constant | Value | Why |
| --- | --- | --- |
| Detection margin | 9 dB | A tone must stand 9 dB above the local noise floor to count. The lab calls 6 dB tentative and 12 dB strong; the decoder uses 9 dB as the minimum for a symbol |
| Decision window | 35% of a symbol | The detector measures near the centre of the symbol, avoiding the fade edges |
| Search hop | 10 ms | The decoder slides a window in 10 ms steps to find the frame start |
| Minimum marker span | 1.5 symbols | Two markers must be present for at least 1.5 symbol lengths; this rejects a single stray tone |
| Sample-rate minimum | 44,100 Hz | Below this, the 19.76 kHz top tone is at or above Nyquist and aliases |
| Key TTL | 120,000 ms | Two minutes: long enough for a class to decode, short enough to limit replay |
| Max wave | 1,000,000 | A sanity ceiling; a real session uses a handful of waves |

The 9 dB margin is not a physical constant. It is a starting value chosen to reject noise while accepting a real tone. It was tuned with synthetic tests, not a full classroom measurement. The 5 m and 10 m sweep shows the link degrades before the margin can help; a stronger margin does not create signal that the microphone did not receive.

### Why 120 ms per symbol

- Long enough for a Goertzel bin to resolve 110 Hz spacing.
- Short enough that 11 symbols fit in 1.32 seconds.
- A human listener hears a short chirp, not a long annoying tone.
- A phone's audio pipeline can process it without a large buffer.

A longer symbol would improve frequency resolution but make the frame slower and more exposed to room changes. A shorter symbol would make adjacent tones harder to separate.

### What can go wrong

- **A device resamples to 32 kHz** → the top tones alias; the sample-rate gate refuses.
- **A Bluetooth headset in call mode** → the capture rate drops or the high band is filtered; the gate warns/refuses.
- **A speaker rolls off at 17 kHz** → the upper tones are weak; the lab shows it.
- **A room with high-frequency noise** (fans, some lighting) → the margin shrinks; frames are missed.
- **A frequency offset** between speaker and microphone → the Goertzel bin may miss; the 110 Hz spacing gives some tolerance, not unlimited.
- **A multi-path echo** → the symbol may smear; the tests include one echo tap, but a real reverberant room is harsher.

## 104. Why P-256 device keys

### The requirement

The server must know that the phone submitting a proof is the same phone the teacher approved, without storing a secret that can be replayed. A password or a bearer token would be copied; a shared secret would be stored on the server and sent on every request. A public-key signature is the natural fit.

### Why ECDSA P-256

- **Web Crypto support**: `crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" })` works in current Chrome, Edge, Safari and Firefox.
- **Small keys and signatures**: a public JWK is a few hundred bytes; a signature is 64 raw bytes.
- **Non-extractable private key**: the browser can generate the pair with `extractable: false`, so the private key cannot be exported through the Web Crypto API. It stays in IndexedDB as a `CryptoKey`.
- **Standard verification**: Node's `crypto.verify` verifies P-256 with SHA-256.
- **No shared secret on the server**: the server stores only the public key.

### Why not RSA

RSA keys and signatures are much larger, generation is slower, and the browser API is heavier. P-256 is sufficient for this threat model.

### Why not a passkey for students

Passkeys are designed for account authentication. They are synced by the platform, which means the credential can move between devices. For attendance, the project wants a **device-bound** key that does not silently sync to a second phone. A non-extractable P-256 key in IndexedDB is device/browser-bound and requires an explicit re-bind if the student changes device.

This is a tradeoff: a student who clears site data loses the key and must be re-approved. A passkey would be more convenient but less clearly device-bound.

### Why not a server-issued device token

A token is a bearer secret. If it leaks, anyone can submit proofs. A signature requires the private key, which never leaves the browser. The server can still be fooled by a compromised browser, but a database leak does not expose signing keys.

### The binding flow

1. The browser generates a P-256 key pair, non-extractable.
2. It exports the public JWK.
3. It posts the public JWK to `/device-bindings/claim`.
4. The server computes a fingerprint (SHA-256 of the canonical public JWK) and stores the public key.
5. A teacher approves the first device or a changed device.
6. Proof submission signs the canonical message with the private key.
7. The server verifies with the stored public key.

The fingerprint identifies the device for review; the public key is what verifies. A changed fingerprint triggers a review, so a stolen account cannot silently bind a new phone.

### The signature format trap

Web Crypto produces a raw 64-byte `r || s` signature (IEEE P1363). Node's default ECDSA format is DER, which is variable-length. The server must pass:

```js
{ key, dsaEncoding: "ieee-p1363" }
```

Without it, a valid browser signature fails. The test "a real P-256 device signature verifies" is the guard.

### What P-256 does not prove

- The human holding the phone is the account owner.
- The phone is not rooted or the browser not compromised.
- The key was not copied before binding.
- The phone was in the room.

It proves possession of the private key at signing time. That is one link in the chain, not the whole chain.

### What can go wrong

- **IndexedDB cleared** → the private key is gone; the student re-binds and waits for approval.
- **A browser without Web Crypto** → the page cannot sign; a current browser is required.
- **A cloned browser profile** → the private key may be cloned; the server cannot tell. Device review and anomaly detection are the compensating controls.
- **A compromised extension** → it can call `sign` on the origin's key. CSP and browser hygiene matter.
- **A signature format mismatch** → every proof fails; the `ieee-p1363` option is essential.
- **A public key with private material** → the server rejects a JWK containing `d`. The client never sends it.

## 105. Why passkeys for the console

### The problem

The super-admin console can change roles, revoke sessions, delete attendance, impersonate users and rewrite settings. A stolen admin cookie would be enough to do enormous damage. A password is not part of this app (Google sign-in is), but a Google session can be phished or a laptop left unlocked. The console needs a second, phishing-resistant factor for destructive actions.

### Why passkeys

- **Phishing-resistant**: the credential is bound to the origin; a lookalike site cannot use it.
- **No shared secret**: the private key stays in the authenticator.
- **Standard**: WebAuthn is supported by Chrome, Edge, Safari, Firefox and hardware keys.
- **User-friendly**: a fingerprint, face or device PIN, not a code to type.
- **Scoped**: the project uses a step-up assertion for destructive actions, not for every page load.

### The step-up design

1. The super-admin signs in with Google.
2. `GET /admin/webauthn/status` reports whether a passkey exists and whether the five-minute window is open.
3. A destructive route passes through `requireAdminStepUp`.
4. Without a fresh assertion, it returns **428** `step_up_required`.
5. The browser calls `/admin/webauthn/step-up/options`, gets a challenge, asserts with the passkey, and posts to `/verify`.
6. The server verifies the assertion, sets an `admin_step_up` HttpOnly cookie scoped to `/api/v1/admin`, and the original request can retry.
7. The cookie expires after five minutes.

The first passkey is **trust-on-first-use**: there is no existing credential to approve it. After that, adding another passkey requires an existing assertion. This prevents an attacker with a live admin session from silently enrolling their own authenticator.

### Why not require a passkey on every admin request

That would be exhausting and would train the admin to approve reflexively. A five-minute window covers a burst of related actions while still requiring a fresh proof for a new destructive session.

### Why the step-up cookie is separate

It is:

- `HttpOnly`;
- scoped to `/api/v1/admin`;
- short-lived;
- signed as a JWT with a purpose claim.

It is not the main session cookie. A stolen main cookie does not include step-up. A stolen step-up cookie is useless outside the admin path and expires quickly.

### Why not SMS or TOTP

SMS is phishable and SIM-swappable. TOTP is phishable in real time. Passkeys are bound to the origin and resist both. The project already depends on a browser, so WebAuthn is a natural fit.

### Recovery

If every passkey is lost, destructive admin routes stay at 428. There is no self-service reset. An operator with database access must remove the account's `adminpasskeys` rows, and the owner registers a new first passkey. This is deliberately painful: the alternative is a recovery path an attacker can use.

The deployment guide recommends registering a second passkey on another device.

### What can go wrong

- **No passkey registered** → every destructive action is 428. Register one before sharing the account.
- **Wrong origin** → the browser refuses with `SecurityError`; `WEBAUTHN_ORIGINS` must match the console's exact origin.
- **Cancelled prompt** → `NotAllowedError`/`AbortError`; retry.
- **Already registered** → `InvalidStateError`; use the existing passkey or a different authenticator.
- **Lost all passkeys** → database-level recovery only.
- **A virtual authenticator** → fine for testing, not a real second factor for production.
- **A compromised admin browser** → the attacker can use the step-up window while it is open. The short window and audit limit the damage.

## 106. Why an audit hash chain

### The problem

An audit log that can be edited is not an audit log. A database administrator, a bug or an attacker could change a record and leave no trace. The project needs tamper **evidence**, not tamper prevention: it cannot stop someone with database write access, but it can make a change detectable.

### The construction

Each new audit row gets:

```text
seq       = previous seq + 1
prevHash  = previous row's hash
hash      = SHA-256(canonical fields + prevHash)
```

The canonical fields include the action, actor, entity, timestamp, metadata and the previous hash. The hash is computed over a stable serialisation, so object key order does not matter.

The chain starts at `seq: 1` with `prevHash: null` (or a genesis value). Verification:

1. Load rows in sequence order.
2. Recompute each hash.
3. Check `prevHash` matches the previous row's `hash`.
4. Check the sequence is contiguous.
5. Report the first break, the expected hash, and the count of legacy rows without a hash.

### What it detects

- A changed field in a row → its hash no longer matches.
- A deleted row → the next row's `prevHash` points at a missing hash, or the sequence has a gap.
- A reordered row → the sequence/hash linkage breaks.
- A forked row with a valid hash but the wrong predecessor → the `prevHash` check fails.
- A truncated tail → verification passes up to the last row, but the missing tail is not detectable from the chain alone. A backup or an external anchor would be needed for that.

### What it does not detect

- A full rewrite of the entire chain by someone who recomputes every hash. Without an external anchor (a published hash, a separate signer, a transparency log), a determined database admin can forge a consistent chain.
- A deletion of the last rows. The chain has no "length" commitment outside itself.
- A change to the verification code. The verifier is part of the trusted computing base.

The chain raises the cost and makes casual tampering visible. It is not a blockchain and does not claim Byzantine guarantees.

### Why SHA-256

- Standard, fast, available in Node's `crypto`.
- Collision-resistant for this purpose.
- No key management; the chain is not a MAC.

A keyed hash (HMAC) would require a secret and would let someone with the key forge. A public hash chain is simpler and sufficient for tamper evidence.

### Why the chain is serialised in-process

Appending requires reading the previous `seq` and `hash`, then writing the next row. Two concurrent appends could read the same predecessor and fork the chain. The project serialises appends in-process (a promise chain/lock). That is correct for one Render instance. A multi-instance deployment needs a database transaction, a unique sequence index with retry, or a distributed lock. This is a known limitation.

### The legacy rows

Rows written before the chain was introduced have no `seq`/`hash`. They are counted as `legacy`, not treated as breaks. A system-expired query audit row is written with `AuditLog.create` directly, bypassing the chain helper, so it also lacks `seq`/`hash`. That is an inconsistency: the row is in the collection and queryable, but not tamper-evident in the same way. The book records it rather than hiding it.

### What can go wrong

- **Two instances append concurrently** → a fork. The current deployment is one instance.
- **A row is edited** → verify reports the first bad `seq` and whether the stored hash or the link is wrong.
- **A row is deleted** → the next row's `prevHash` does not match, or `seq` has a gap.
- **A legacy row sits between chained rows** → the verifier must skip/count it without treating it as a break. The exact policy is in the verifier.
- **The audit write fails** → the primary action may still succeed (audit is best-effort in some paths). That is a gap; the decision is not lost, but the audit entry is.
- **The chain is restored from backup** → it verifies up to the backup's last row. A tail deletion after the backup is not detectable.

## 107. Why one service and one database

### The shape

```text
Render Web Service
  ├── Express API
  ├── React build
  └── MongoDB Atlas
```

### Why one service

- **Cookies are first-party.** The session cookie is set and sent to the same origin. `SameSite=Lax` works; no third-party cookie blocking.
- **No CORS drift.** The frontend and API cannot point at different versions.
- **One deploy.** The build and the API ship together.
- **One URL.** No separate frontend environment variable to misconfigure.
- **Simpler CSP.** The app only loads its own origin plus Google Identity Services.

### The cost

- The Node service serves static files as well as API requests. A CDN would be faster for a global audience; this is a single-college pilot.
- Scaling the API scales the static serving too.
- A frontend-only change still redeploys the backend.
- The free tier sleeps the whole product, including the static shell (though the service worker can serve a cached shell).

### Why one database

- Attendance, queries, audit and sessions are relational in practice. MongoDB documents with references are enough for this scale.
- One Atlas cluster is simpler to back up and restore.
- There is no cross-database transaction to reason about.
- The unique indexes that enforce one active session and one proof per wave live in the same database as the records they protect.

### Why MongoDB

- The data model is document-shaped: a session with snapshots, a proof with optional location, an audit row with metadata.
- Mongoose provides schema validation, indexes and hooks.
- Atlas M0 is free and managed.
- The project does not need joins at a scale that would demand PostgreSQL.

The cost is weaker relational guarantees: no foreign keys, no multi-document transactions in the common paths, and duplicate prevention relies on unique indexes. The code documents where a transaction would be stronger.

### Why not serverless functions

- Cold starts are bad for a live check-in.
- WebAuthn and long-lived MongoDB connections are easier in a persistent process.
- The rate limiters are in-memory; serverless instances would each have their own bucket.
- The audit chain serialisation assumes one process.

### Why not a separate frontend host

The split layout is possible but not recommended. It turns cookies third-party, requires `SameSite=None; Secure`, and adds a CORS/origin configuration surface. The one-service shape removes those failure modes for a pilot.

### What can go wrong

- **The single instance restarts** → in-memory rate limits and the audit append lock reset. Persistent state is in MongoDB.
- **The instance is CPU-bound by PDF extraction** → API latency rises. The PDF bounds limit the work, but there is no separate worker.
- **Atlas is unreachable** → readiness fails; the API cannot serve data. The static shell may still load from the service worker.
- **A second instance is added** → the audit chain and in-memory limits need redesign. Do not scale horizontally without addressing them.
- **A frontend build is missing** → the API runs but the UI 404s. The build command must run before start.

## 108. Why PDF preview instead of import

This decision is covered in detail in Part X; here is the summary.

### The options

1. **No PDF support** — paste/CSV only. Safe, but tedious for a real roster.
2. **Automatic import** — extract and save. Fast, but a parser bug becomes a data corruption bug.
3. **Preview only** — extract text, show it, let the teacher confirm. Slower, but the teacher is the author.

### Why preview

- The extraction is useful even when it is imperfect: it saves typing.
- The teacher can see and fix errors before they become enrollments or slots.
- The server never writes from a PDF route.
- The feature can ship before the layout inference is trustworthy.
- The same parser backs preview and save, so there is no drift.

### Why not automatic import with a confirmation dialog

A confirmation dialog that says "Import 40 students?" is not enough. The teacher cannot see which 40, which line was misread, or which student was dropped. A real confirmation must show the diff, not a count.

### Why not a structured timetable parser yet

A timetable is a two-dimensional table with merged cells, breaks, electives, lab batches and room changes. Guessing cells from raw text is exactly the kind of parser that looks impressive on one sample and fails on the next. The project requires representative PDFs before inventing it. None have been supplied.

### The cost

- Manual copying for rosters.
- Manual slot entry for timetables.
- The preview is not a one-click import.

The cost is visible and bounded. The cost of a silent wrong import is not.

### What can go wrong

- **A teacher assumes the preview saved** → the UI must say "nothing has been scheduled" and the save button must be separate.
- **A teacher saves without reading** → the preview shows errors and counts, but it cannot force attention.
- **A scanned PDF** → rejected with a clear code; OCR is not built.
- **A real layout extracts badly** → the teacher edits; the feature does not claim accuracy it has not measured.

## 109. Why no paid services

### The constraint

The project must run on free tiers that do not require a card. This is a capstone constraint, not a claim that free is always better.

### What is used

| Service | Tier | Role |
| --- | --- | --- |
| Render | Free (Starter optional) | Node service and static build |
| MongoDB Atlas | M0 free | Database |
| Google Cloud OAuth | Free | Sign-in |
| GitHub | Free | Source and deploy trigger |
| Cloudflare quick tunnel | Free | Local HTTPS for phone testing |
| PDF.js, PDFKit, ExcelJS, Mongoose, Express | Open source | Libraries |

No paid API, no card-required free tier, no SMS gateway, no hosted OCR, no LLM API.

### The consequences

- The free Render instance sleeps; a real session needs a warm-up or Starter.
- Atlas M0 has no automated backups; the encrypted dump is the recovery path.
- Google OAuth in Testing requires test users; the consent screen is not verified.
- No hosted OCR, so scanned PDFs are rejected.
- No hosted LLM, so A4 is gated rather than built.
- Rate limits are in-memory, so they reset on restart and do not coordinate across instances.

### Why not a free OCR/LLM tier

Some free tiers require a card, train on submitted data, or have unclear retention. A student roster is personal data. The project refuses to send it to a third party before a written risk acceptance and a student notice. That is a privacy decision, not a technical incapability.

### What can go wrong

- **A free tier changes its terms** → the deployment assumptions change. Re-read the terms before relying on them.
- **The free instance sleeps mid-session** → warm it up or pay for Starter.
- **A free database has no backup** → take your own; do not assume the provider does it.
- **A vendor starts charging** → the project must be able to move. The stack is standard Node + MongoDB, not a proprietary platform.

## 110. The decisions that were deliberately deferred

### Not built

| Capability | Why deferred |
| --- | --- |
| Automatic attendance | The evidence does not prove presence; a human decision is required |
| Confidence scoring | No calibrated probability; a score would imply precision the physics does not support |
| ID round | A future challenge-response layer; not needed for evidence-only |
| Student cascade | Multi-hop relay adds complexity and new trust assumptions |
| Native mobile app | The web app is sufficient; a native app would need a new device-key story |
| Structured timetable import | Blocked on representative PDFs |
| Local OCR | Blocked on representative scans and accuracy/runtime measurement |
| Hosted LLM extraction | Gated on consent and risk acceptance |
| Multi-instance scaling | The audit chain and in-memory limits are single-process |
| iOS support | Untested; the acoustic and Web Crypto behaviour may differ |
| Offline attendance | Queuing a proof and replaying it later is a correctness/security risk |
| SMS/email notifications | In-app notifications are enough; external delivery adds a provider |
| Payment/billing | Not a product requirement |
| Face recognition | Privacy and legal surface; out of scope |

### Why an explicit deferral list matters

A deferral is not an omission if it is written down. The list tells an examiner, a future maintainer and the owner what is intentionally absent. It also prevents a demo from implying a capability that does not exist.

### The gates that must be satisfied first

- **A2b** — representative timetable PDFs; match existing owned classes only; preview every slot; flag unmatched rows; never auto-create a class.
- **A3** — representative scans; measure accuracy and runtime; keep the editable preview.
- **A4** — student notice, data-field list, retention/training risk, written owner acceptance, opt-out fallback.
- **Automatic attendance** — would need a calibrated presence probability, an appeal process and a much stronger physical validation. The project does not claim to have any of these.
- **Multi-instance** — a transactional audit append and a shared rate-limit store.

### What would change the decision

- A measured 95%+ decode rate at 5–10 m in real classrooms would strengthen the acoustic case, but would not by itself justify automatic attendance.
- A representative PDF corpus with high extraction accuracy would unblock structured import.
- A written privacy acceptance would unblock A4, but not remove the need for a preview.
- A real pilot with teachers and students would reveal usability issues the tests cannot.

### The honest framing

The project is complete as an evidence-only prototype. It is not complete as an automatic attendance product, and it should not be described as one. The deferred list is the boundary between what exists and what would be a different, larger project.
# Part XIV — Honest limits and open work

A system description that only lists successes is marketing. This part lists what the product cannot do, what has not been measured, and what would have to change before a stronger claim is honest. None of this makes the software useless; it defines the boundary of what the software is evidence for.

## 111. Physical-range limitations

### The measured result

The current distance sweep is from 2026-10-25. Both ends reported Android 10, Chrome 155, 48 kHz context and track rates, 10 planned frames, 120 ms symbols and a 450 ms gap.

| Distance | Frames sent | Frames decoded | Rate | Receiver margin range |
| --- | --- | --- | --- | --- |
| 1 m | 10 | 10 | 100% | 22.8–34.6 dB |
| 2 m | 10 | 9 | 90% | 20.4–32.8 dB |
| 3 m | 10 | 9 | 90% | 24.7–34.5 dB |
| 5 m | 10 | 4 | 40% | 11.1–12.9 dB |
| 10 m | 10 | 1 | 10% | 10.2 dB |

Overall: **33 of 50 frames decoded (66%)**.

The proposed Layer 1 gate was **≥95% at 1 m, 5 m and 10 m**. The 1 m run meets it. The 5 m and 10 m runs do not. The gate is **not met**.

### What the numbers mean

- At 1 m the link is solid. The margin is high above the 9 dB detection threshold.
- At 2–3 m the link is usable but already loses one frame in ten.
- At 5 m the margin sits at 11–13 dB, close to the 9 dB threshold, and more than half the frames are missed.
- At 10 m a single frame gets through, with a 10.2 dB margin. That is not a working link.

A check-in does not need every frame. The phone listens for up to 60 seconds and the transmitter can repeat frames; one successful decode is enough to submit evidence. But a 10% decode rate means the phone may listen for a long time and still fail, and a student may give up. The product's usability assumption — a student can check in within a short window — does not hold at 10 m with this hardware.

### What was not measured

- **Reverse direction.** The M01 → M32 and M32 → M01 roles were not recorded. One phone's speaker measured only 0.7 dB at 19.5 kHz in the lab, so the direction matters.
- **Muted-transmitter control.** The gate requires a muted transmitter to decode **0** frames. That control was not run in the recorded sweep.
- **Phone models and media volume.** They were not recorded, so the results cannot be attributed to a specific device pair.
- **Room and notes.** They are null in every report. The room's reverberation, noise and layout are unknown.
- **Amplitude consistency.** The 5 m run used 45% amplitude; the others used 50%. The comparison is not perfectly controlled.
- **Repeats and gaps beyond one setting.** The sweep used 10 repeats and a 450 ms gap. More repeats or a different gap might change the decode rate, but not the underlying signal-to-noise ratio.
- **Several rooms and several phone pairs.** One pair in one room is not a classroom corpus.

### The owner's assumption

The owner has directed that Layer 1 be treated as **passed for build planning only**. That is an assumption, not a measurement. It lets the rest of the product be built and tested without waiting for a hardware breakthrough. It does not make the 5 m and 10 m results disappear.

The book repeats this because it is the easiest thing to misstate. A demo at 1 m looks excellent. A claim that the system works at 10 m is false on the current evidence.

### Why the link degrades

The likely causes, in order:

1. **Speaker roll-off.** A phone speaker is small; it cannot move much air at 18–19.8 kHz. The output level falls with distance and frequency.
2. **Microphone roll-off.** Many phone microphones are optimised for speech and attenuate near ultrasound.
3. **Inverse-square loss.** Sound intensity falls with the square of distance. Doubling the distance quarters the intensity, about −6 dB before any extra absorption.
4. **Air absorption.** High frequencies are absorbed more than low frequencies; the effect grows with distance and humidity.
5. **Room noise.** Fans, air conditioning, projectors and lighting can raise the noise floor in the high band.
6. **Reverberation.** Reflections smear each 120 ms symbol; a delayed copy can confuse the detector.
7. **Device processing.** Automatic gain control, noise suppression, echo cancellation and codecs can attenuate or distort the band. The app disables them, but the OS may still apply processing.
8. **Orientation.** A phone lying flat on a desk points its speaker away from the room; a phone in a hand points differently.

The measured margins tell the story: 20–35 dB at 1–3 m, 10–13 dB at 5–10 m. The signal is still present at 5 m, but close to the detector's threshold.

### What would improve range

- A louder, better speaker, or a dedicated ultrasonic emitter.
- A lower carrier frequency, at the cost of overlap with speech/noise.
- More repeats and a longer listening window, at the cost of time.
- A more sensitive detector or a narrower band with a longer symbol, at the cost of latency.
- A different room layout with the transmitter elevated and unobstructed.
- A phone with a microphone that is known to work in the band.

None of these is a software fix that can be claimed without measurement. The project does not pretend otherwise.

### What can go wrong in a real classroom

- **A student at the back cannot decode** → no evidence, even if present. The teacher can mark manually.
- **The teacher's phone speaker is weak** → the whole room suffers.
- **The room is noisy** → margins fall.
- **A phone case or hand covers the speaker/microphone** → the link fails.
- **The student's media volume is low** → the tone is quiet relative to the noise.
- **The phone is on battery saver** → audio processing may change.
- **A Bluetooth headset is connected** → the capture route may be narrowband; the sample-rate gate should catch it.
- **The teacher moves around** → distance and orientation change mid-session.

The manual register and the query process exist precisely because the acoustic path is not guaranteed.

## 112. Security limitations

### What is strong

- Google sign-in with server-side allowlists.
- HttpOnly, Secure (in production), SameSite cookies.
- JWT algorithm pinning and secret validation.
- Per-account `tokenVersion` revocation.
- Teacher-approved device binding with public-key cryptography.
- Passkey step-up for destructive admin actions.
- Origin guard for unsafe requests.
- Strict CSP, no inline scripts, no framing.
- Rate limits on sign-in, proofs, PDF uploads, exports and passkey routes.
- Audit hash chain with verification.
- No private key material stored on the server.

### What is not solved

#### Account takeover

If an attacker steals a student's Google session or device, they can act as that student. The device binding helps: a new browser needs teacher approval. But an attacker with the live session and the unlocked device is indistinguishable from the student. The system does not have behavioural biometrics or a second factor for students.

#### Device-key compromise

The private key is non-extractable through Web Crypto, but it is still usable by any script on the origin. A compromised browser extension, a malicious dependency, a rooted device or a debugger can ask it to sign. The design reduces accidental leakage; it does not provide hardware attestation.

#### Key sharing and replay

A student can share the decoded key with a friend outside the room. The friend can submit a valid proof with their own device if they are on the roster. A recording of the tone can be replayed to a phone that was not present. The server never sees the audio, so it cannot distinguish live from replayed. The two-minute key, the wave sequence and the device signature limit the window; they do not eliminate the attack.

#### Teacher collusion or mistake

A teacher can mark anyone present or absent. The audit records the decision, but it does not prevent it. A teacher can also approve a device for the wrong student if the review queue is rushed. The system is accountable, not incorruptible.

#### Super-admin compromise

A stolen super-admin session without step-up cannot perform destructive actions. With a stolen passkey or an unlocked authenticator, it can. The five-minute step-up window limits the duration but not the damage within it. The audit chain records the actions, but a determined attacker with database access could rewrite the chain (see below).

#### Database administrator

Someone with database write access can:

- edit attendance, queries and users;
- delete audit rows;
- recompute the entire audit chain;
- read every key, proof and roster.

The chain is tamper-**evident**, not tamper-**proof**. It has no external anchor, so a full rewrite by a privileged attacker is not detectable from the database alone. The backup and the operator log are the practical checks.

#### Audit gaps

- `expireStaleQueries()` writes `query.expired` with `AuditLog.create` directly, bypassing `appendAuditEntry`, so those rows have no `seq` or `hash` and are counted as legacy.
- Some audit writes are best-effort. If the audit write fails, the primary action may still succeed.
- The chain append is serialised in-process. Two instances could fork it.
- A tail deletion is not detectable without an external commitment.

#### Rate limits

The limiters are in-memory per process. They:

- reset on restart;
- do not coordinate across instances;
- share a bucket per account/IP, so a shared college NAT can fill a bucket for many users;
- do not stop a distributed attacker with many IPs.

They raise the cost of brute force. They are not a DDoS defence.

#### Enumeration and error messages

The code deliberately returns 404 for unowned classes, 404 for another user's notification, and generic proof errors. Some differences remain (for example, a duplicate query returns its status), and timing side channels are not analysed. The threat model is a college pilot, not a hostile internet audience.

#### Supply chain

The frontend audit recorded **4 critical / 36 high** findings, mostly Create React App 5 build-chain debt; the backend recorded **0 high / 0 critical** and 2 moderate (`uuid` via `exceljs`, no non-breaking fix). A critical build-chain finding is not automatically an exploitable runtime vulnerability, but it is not nothing. The project keeps the frontend audit report-only until a Vite migration; that is a known debt, not a clean bill of health.

#### No CSRF token

The app relies on SameSite cookies plus an Origin guard instead of a per-request CSRF token. This is a reasonable defence for modern browsers, but it depends on browser behaviour and correct origin configuration. A legacy browser or a misconfigured proxy could weaken it.

#### No Content-Security-Policy reporting endpoint

Violations appear in the browser console, not in a server-side report stream. A production operator will not see a violation unless a user reports it or someone checks manually.

#### No intrusion detection

There is no anomaly detection for unusual proof patterns, a sudden device change, a burst of queries or an admin action at 3 a.m. The audit is reactive.

### What the security posture actually is

It is a well-hardened prototype for a known college audience, not a hardened multi-tenant SaaS. The highest-risk assets (attendance records, admin actions) have layered controls. The physical-presence claim remains the weakest link, and the product responds by refusing automatic attendance.

## 113. Privacy and retention limitations

### What data is stored

- **Users** — name, email, role, status, phone label, roll number, demo flag, device public key, fingerprint, approval time.
- **Classes and enrollments** — course code, title, section, room, student email, name, derived identity, status.
- **Sessions** — class/teacher/room references, snapshots, wave, key, key history (20), timestamps, roster count.
- **Proofs** — session, class, student, email, device fingerprint, wave, key, signature, protocol version, optional location, timestamps. **Deleted after 24 hours by TTL.**
- **Attendance records** — status, source, markers, note, evidence counters, locations, snapshots. They persist.
- **Queries** — reason, locations, distance, status, decision note, reopen history. They persist.
- **Notifications** — title, message, link, read time. They persist until deleted.
- **Audit logs** — action, actor, entity, metadata, IP, timestamps, chain hashes. They persist.
- **Admin passkeys** — public credential, counter, transports. No private key.
- **System settings** — term dates, query window, geofence radius, feature flags.

### Retention asymmetry

The **proof** is deleted after 24 hours. The **attendance record** keeps `evidence.proofCount`, `evidence.waves`, `firstProofAt` and `lastProofAt`. The query keeps its location and decision. The audit keeps the action.

This means:

- Detailed acoustic evidence is short-lived.
- The fact that evidence existed, and its aggregate, persists.
- A student cannot inspect the raw signature after a day.
- A teacher cannot re-verify a proof after a day.
- A query can reference a proof that no longer exists.

The asymmetry is deliberate: the proof is high-volume and sensitive; the register is the durable academic record. It is also a limitation: a dispute a week later cannot examine the original signature.

### Location

Location is optional. If a student grants it:

- the proof stores a location snapshot;
- the attendance record stores an attempt location;
- a query can store a student location and compute a distance to the teacher's location.

If a student denies it, the proof still works and the query is still allowed unless `requireQueryLocation` is on. The system does not track continuous location, only one-shot captures at specific actions.

### Audio

Raw audio never leaves the phone. It is not stored on the server, not logged, not uploaded. The decoded key, wave and signature are sent. This is a strong privacy property and a limitation: the server cannot re-analyse the audio to resolve a dispute.

### What is not built

- **Data export for a student** — a student can see their attendance and queries, but there is no "download all my data" button.
- **Account deletion** — a user row can be disabled, but there is no self-service deletion. An admin can delete rows, but the audit and historical records complicate a true erasure.
- **Retention policy for old attendance** — records persist indefinitely. A real deployment needs a retention schedule and a legal basis.
- **Consent management beyond the check-in checkbox** — the checkbox covers the acoustic capture; it is not a full privacy consent management system.
- **Data processing agreement with Atlas/Render/Google** — the deployment relies on providers; the owner must handle the legal agreements.
- **Anonymisation** — exports and analytics use names and emails.
- **Audit log redaction** — metadata can contain emails and notes. The audit is not a pseudonymous store.

### The consent notice

The student check-in page requires a checkbox before the microphone opens. It explains:

- audio is processed on the phone;
- raw audio is not sent;
- the server receives session, wave, key and signature;
- evidence is not attendance;
- location is optional and a denial never blocks check-in.

This is a product-level notice, not a legal privacy policy. A real deployment needs a policy that covers retention, access, correction, withdrawal and the providers involved.

### What can go wrong

- **A student denies location** → distance is null; the teacher sees less evidence. The query may still work.
- **A student wants their data deleted** → there is no self-service path; an admin must act, and the audit may retain the action.
- **A proof expires before a dispute** → the aggregate remains, the detail is gone.
- **A teacher exports a register** → the file contains names and emails. It is the teacher's responsibility to store it safely.
- **A backup is stolen** → it contains all of the above. The encryption passphrase is the only protection.
- **A demo reset is run on real data misflagged as demo** → data loss. The reset filters on `isDemo`; correct flags matter.

## 114. Usability and accessibility limitations

### Device and browser support

- **Chrome on Android** is the supported target.
- **Desktop Chrome** is used for the teacher and admin console.
- **Safari/iOS** is not validated. Web Crypto, AudioContext, IndexedDB and microphone behaviour differ; the acoustic band may behave differently.
- **Firefox/Edge** are not systematically tested for the acoustic flow.
- **WebView or in-app browsers** are not supported; microphone and crypto behaviour varies.

### The acoustic dependency

A deaf or hard-of-hearing student cannot use the acoustic path. The manual register and the query process remain available, but the product's signature feature is inaccessible to them. There is no alternative proof method in the app.

A student with a phone that cannot reproduce or hear the band is similarly blocked from the acoustic path. The lab can diagnose it, but not fix it.

### Microphone consent and browser friction

- The student must tap Join; audio capture needs a user gesture.
- The browser may ask for microphone permission every session, depending on settings.
- The page must stay visible; backgrounding stops capture.
- A phone call, another audio app or a Bluetooth route can interrupt.
- The student must hold the phone or place it where the microphone can hear the tone.

This is more friction than tapping a QR code.

### The teacher's workload

- Starting a session, showing the key, opening the transmitter on a second device, waiting for evidence, advancing waves and closing is a multi-step flow.
- The teacher must monitor the evidence list and decide when to advance.
- The teacher must mark the register and finalise.
- The teacher must review device requests.
- A large class is real work.

The product does not automate the teacher's judgement, which is the point, but it also does not minimise the clicks.

### Accessibility of the UI

The app uses semantic landmarks, labels, focus management and keyboard handling. Known gaps:

- Charts are visual; the numeric table is the accessible alternative, but a screen-reader user may not get a useful chart summary.
- Some status changes are not announced in a live region.
- Colour contrast was not audited against WCAG AAA.
- The acoustic lab is inherently audio-based; its report is text, but the experiment is not accessible to a deaf user.
- The PDF preview panel is a large text block; it is readable but not structured as a table.
- There is no high-contrast mode beyond the dark/light theme.
- There is no reduced-motion preference handling beyond CSS defaults.
- Touch targets on the smallest screens were checked manually, not exhaustively.

### Language and locale

- The UI is English.
- Dates and times use the browser locale in some places and server timestamps in others.
- The roster parser is tuned to `@nitjsr.ac.in` and a specific email pattern.
- Names with non-Latin scripts are stored as text but not specifically tested.
- The acoustic lab's report is English.

### Error recovery

- A failed proof submission shows the server message and allows a retry.
- A failed PDF extraction shows a mapped message.
- A failed export shows a toast.
- A 401 does not always redirect automatically; the page may show the error until the user navigates.
- A stale session in a background tab is not proactively refreshed.
- A device in review has no estimated approval time.

### What can go wrong

- **A student cannot hear the tone** → no evidence; manual marking.
- **A student has no camera** → irrelevant; the app does not use one.
- **A student uses iOS** → untested; may fail at Web Crypto, IndexedDB or audio.
- **A teacher uses a small phone** → the console is desktop-first; tables may scroll.
- **A screen-reader user edits a register** → the table is usable but not optimised.
- **A user with low vision** → the theme may help, but no formal contrast audit exists.
- **A slow phone** → PDF extraction happens server-side; the UI waits. The acoustic worklet may struggle on an old device.

## 115. Operational limitations

### Single instance

The service is designed for one Render instance. That assumption is baked into:

- the in-memory rate limiters;
- the in-process audit chain append;
- the in-memory PDF upload limiter;
- the service worker cache versioning (per deploy, not per instance).

Adding a second instance without addressing these can produce:

- rate limits that are twice as permissive;
- a forked audit chain;
- inconsistent export limits.

### Free-tier constraints

- Render free sleeps after about 15 minutes; a cold start takes 30–60 seconds.
- Atlas M0 has no automated backups.
- Google OAuth in Testing requires test users and has a user cap.
- No paid OCR or LLM.
- No CDN beyond Render's static serving.

### Backups

The scripts are tested with stubs, not a real Atlas restore. Until a drill is recorded:

- the encryption pipeline is plausible but not proven against a real dump;
- the restore namespace mapping is plausible but not proven against Atlas;
- the recovery time is unknown.

### Deployment verification

The repository's `HEAD`, `origin/main` and `origin/HEAD` are `003f900`, which includes the committed A2a timetable text preview. The live Render service answered `/api/v1/health` and `/api/v1/health/ready`, and its `main.14c6a1a8.js` bundle contained the A2a UI strings. The exact deployed commit was not compared with the Render dashboard while writing, so that comparison is a hard gate (**G2** in [`docs/testing-plan.md`](../testing-plan.md)) before signed testing:

- a deploy may be from a different commit than the book describes;
- a fix may be in the working tree but not deployed;
- a bug may be fixed in the book's description but still live.

### Observability

- Logs are `console.log`/`console.error` lines, not structured JSON for every event.
- There is no metrics endpoint, no tracing, no error tracker (Sentry or similar).
- The audit chain is an application-level record, not a monitoring signal.
- Rate-limit hits are not counted centrally.
- PDF extraction duration is not recorded.
- There is no alert when readiness fails or when the audit chain breaks.

An operator reads Render logs and the admin console. That is enough for a pilot, not for a production SLA.

### Maintenance

- No migration framework. Mongoose creates collections/indexes on demand; a schema change that needs a data migration must be scripted manually.
- No dependency update automation beyond Dependabot/security workflow; the frontend build chain is old (CRA 5).
- No staging environment separate from local and production.
- No feature flags beyond the settings singleton and environment variables.
- No blue/green deploy; Render restarts the single instance.
- No canary or smoke test automatically run against the deployed URL.

### What can go wrong

- **The free instance sleeps before a class** → students see a slow page. Warm it up.
- **A deploy restarts mid-session** → in-flight requests may fail; keys in MongoDB survive; students can retry.
- **A backup is taken but never restored** → the recovery path is unproven.
- **A schema change ships without a migration** → old documents may fail validation or read differently.
- **A dependency breaks the build** → `CI=true` fails the deploy; the previous version stays live if Render keeps it.
- **A log line contains a secret** → the code avoids logging keys/signatures, but a future change could leak. Review logs before sharing.
- **The single instance runs out of memory during a PDF upload** → the process restarts; the upload fails. The 10 MB/20-page bound reduces but does not eliminate the risk.

## 116. The open-work list

This is the current, honest list. Each item names the gate or the missing evidence.

### Blocked on samples

| Item | Gate |
| --- | --- |
| A2b structured timetable parsing | Representative timetable PDFs. Must match existing owned classes only, preview every slot, flag unmatched rows, never auto-create a class or overwrite a slot silently |
| A3 local OCR | Representative scanned samples. Must measure accuracy and runtime on the deployment CPU; output still goes through the editable preview |
| Real roster layout validation | Representative college roster PDFs. The current extraction is tested only with generated fixtures |

### Gated on consent and risk acceptance

| Item | Gate |
| --- | --- |
| A4 Gemini extraction | Student notice, data-field list, retention/training risk, written owner acceptance with a date, opt-out fallback. None exists yet |

### Physical and rehearsal work

| Item | Status |
| --- | --- |
| 5 m and 10 m range diagnosis | Open. The current sweep is 40% and 10% |
| Reverse-direction measurement | Not recorded |
| Muted-transmitter control | Not recorded; must decode 0 frames |
| Real Google sign-in on the deployed URL | Pending |
| Physical two-phone multi-wave rehearsal on the deployed site | Pending |
| Phone model and media volume recording | Missing from the current sweep |
| Room/noise characterisation | Missing; room and notes are null |

### Operational work

| Item | Status |
| --- | --- |
| Real Atlas backup and restore drill | Pending; only stub-tool plumbing tested |
| Live Render version verification | Pending; the deployed commit was not checked |
| Deployed CSP and passkey rehearsal | Local evidence exists; production not verified |
| Real passkey on hardware | Virtual authenticator only |
| Staging environment | Not built |
| Metrics/tracing/alerting | Not built |
| Load test for a 40-student session | Not run |
| Multi-instance design | Not built; the current chain/limits assume one process |

### Browser and UX work

| Item | Status |
| --- | --- |
| A2a timetable modal browser smoke with a real PDF | Not recorded |
| iOS/Safari validation | Out of scope / untested |
| Screen-reader and keyboard audit | Partial, not formal |
| WCAG contrast audit | Not done |
| Component/visual regression tests | Not built |
| Automated browser E2E suite | Not built; manual smoke only |

### Product decisions still open

| Item | Why open |
| --- | --- |
| Automatic attendance | Rejected for now; the evidence does not prove presence |
| Confidence scoring | No calibrated probability |
| ID round | Not needed for evidence-only; future option |
| Student cascade | Multi-hop trust and complexity; not built |
| Native mobile app | Web app is sufficient; native device-key story would be new |
| Offline proof queue | Replay risk; deliberately not built |
| Paid OCR/LLM | Constraint: no paid service or card-required free tier |
| External notifications (email/SMS) | In-app is enough for the pilot; adds a provider |

### The order that makes sense

1. Obtain representative timetable and roster PDFs.
2. Measure extraction quality and decide whether A2b/A3 are worth building.
3. Run a real Atlas restore drill.
4. Verify the deployed commit and run a real Google/passkey rehearsal.
5. Run the reverse and muted physical controls; record phone models and volume.
6. Decide whether the 5–10 m range is acceptable for the pilot or whether the hardware/band needs work.
7. Only then consider a classroom pilot.
8. Automatic attendance remains a separate decision with a much higher evidence bar.

### What is not on the list

- A promise that the range will improve with software alone.
- A claim that OCR or an LLM will be accurate without samples.
- A claim that the live deployment matches the working tree.
- A claim that the audit chain is tamper-proof.
- A claim that the product is accessible to every student.

Those are not tasks; they are boundaries. The open-work list is how the project keeps them visible.
# Part XV — Reference

This part is the lookup table for the rest of the book. It does not introduce new design; it collects the formulas, constants, status codes, files and vocabulary that appear throughout the system. Every entry names the code that owns it where that helps. The snapshot is the working tree inspected on 6 November 2026. If a value in this part and a value in code disagree, the code wins.

A warning before the tables: a **design constant** is not a measured fact. The 9 dB detection margin, the 110 Hz tone spacing and the two-minute key lifetime are engineering choices. The 5 m and 10 m decode rates are measurements, and they are much weaker than the design intended. The reference distinguishes the two wherever it matters.

## 117. Formula sheet

### Notation

| Symbol | Meaning | Unit |
| --- | --- | --- |
| $f$ | Frequency | hertz (Hz), cycles per second |
| $c$ | Speed of sound in air at room temperature | about 343 m/s |
| $\lambda$ | Wavelength | metres |
| $T$ | Period of one cycle, $1/f$ | seconds |
| $f_s$ | Audio sample rate | samples per second |
| $N$ | Number of samples in a symbol or window | samples |
| $A$ | Amplitude of a sine wave | dimensionless, usually −1 to +1 in Web Audio |
| $P$ | Power or power-like energy | relative units |
| $L$ | Level in decibels | dB, relative unless stated |
| $d_i$ | A base-15 data digit, $0 \le d_i \le 14$ | digit |
| $w_i$ | A fixed checksum weight | integer |
| $S$ | Checksum value modulo 225 | integer 0–224 |
| $K$ | One-time session key | integer 0–170,859,374 |
| $W$ | Wave number | integer 0–1,000,000 |

### Sound and the physical channel

**Wavelength.**

$$
\lambda = \frac{c}{f}
$$

At 18 kHz with $c=343$ m/s:

$$
\lambda = \frac{343}{18000} \approx 0.0191\ \text{m} = 19.1\ \text{mm}
$$

At 19.76 kHz it is about 17.4 mm. The wavelength is small compared with a room, which is why reflections and standing waves matter.

**Period.**

$$
T = \frac{1}{f}
$$

At 18 kHz, one cycle lasts about 55.6 µs. A 120 ms symbol contains about 2,160 cycles, so the detector has plenty of cycles to measure even a short window.

**Decibels from power.**

$$
L_{\text{dB}} = 10\log_{10}\left(\frac{P}{P_0}\right)
$$

**Decibels from amplitude.**

$$
L_{\text{dB}} = 20\log_{10}\left(\frac{A}{A_0}\right)
$$

The factor 20 exists because power is proportional to amplitude squared. A doubling of amplitude is about +6.02 dB; a tenfold amplitude is +20 dB.

**Relative digital level used by the decoder.**

$$
L = 10\log_{10}\left(\max\left(\frac{|X|^2}{N^2}, 10^{-12}\right)\right)
$$

This is not dB SPL. It is a relative level computed from the same recording and window size, which is why the decoder compares tones inside one window instead of comparing a phone against a calibrated meter.

**Inverse-square intensity (free field).**

$$
\frac{I_2}{I_1} = \left(\frac{d_1}{d_2}\right)^2
$$

**Inverse-square level change.**

$$
\Delta L = 20\log_{10}\left(\frac{d_2}{d_1}\right)
$$

Doubling distance is about −6.02 dB in a free field. A classroom is not a free field: walls, floor, ceiling, furniture and people absorb and reflect sound. The formula is a first approximation, not a prediction of the measured 5 m result.

**Doppler shift for a moving phone.**

$$
\Delta f \approx f\frac{v}{c}
$$

At 18 kHz, walking speed $v=1.5$ m/s and $c=343$ m/s:

$$
\Delta f \approx 18000 \times \frac{1.5}{343} \approx 79\ \text{Hz}
$$

That is comparable to the 110 Hz tone spacing. A moving phone can drift toward a neighbouring tone; the short decision window limits the exposure but does not remove the risk.

### Sampling and aliasing

**Sampling.**

$$
x[n] = x(nT_s), \qquad T_s = \frac{1}{f_s}
$$

**Nyquist frequency.**

$$
f_{\text{Nyquist}} = \frac{f_s}{2}
$$

At 44.1 kHz, Nyquist is 22.05 kHz. The top codec tone is 19.76 kHz, leaving about 2.29 kHz of headroom. At 48 kHz, Nyquist is 24 kHz. At 32 kHz, Nyquist is 16 kHz and the whole high band aliases.

**Alias frequency.**

$$
f_{\text{alias}} = \left| f - f_s \cdot \operatorname{round}\left(\frac{f}{f_s}\right) \right|
$$

The code computes a folded value and reflects it into the first Nyquist zone:

```js
const folded = ((frequency % sampleRate) + sampleRate) % sampleRate;
return folded <= sampleRate / 2 ? folded : sampleRate - folded;
```

Examples:

| Real tone | Sample rate | Alias |
| --- | --- | --- |
| 19.5 kHz | 32 kHz | 12.5 kHz |
| 19.76 kHz | 32 kHz | 12.24 kHz |
| 18.0 kHz | 32 kHz | 14.0 kHz |

This is why the lab refuses to run below 44.1 kHz.

**Quantisation levels.**

$$
\text{levels} = 2^{b}
$$

A 16-bit PCM sample has $2^{16}=65,536$ levels. Web Audio usually supplies 32-bit floating point samples, but the microphone and operating system may already have quantised or processed the signal.

### Signal encoding

**Tone frequency.**

$$
f_i = 18000 + 110i\ \text{Hz}, \qquad i=0,1,\ldots,16
$$

Tone 0 is the marker at 18,000 Hz. Tones 1–16 are the data tones. The highest tone is 19,760 Hz.

**Symbol length in samples.**

$$
N = \operatorname{round}\left(f_s \times \frac{120}{1000}\right)
$$

At 48 kHz, $N=5,760$ samples. At 44.1 kHz, $N=5,292$ samples.

**Fade length in samples.**

$$
F = \max\left(1, \operatorname{round}\left(f_s \times \frac{6}{1000}\right)\right)
$$

At 48 kHz, $F=288$ samples. At 44.1 kHz, $F=265$ samples.

**Frame duration.**

$$
11 \times 120\ \text{ms} = 1,320\ \text{ms} = 1.32\ \text{s}
$$

**Key space.**

$$
15^7 = 170{,}859{,}375
$$

The valid keys are $0$ through $170{,}859{,}374$. A uniformly random guess has probability $1/170{,}859{,}375$ of matching a particular key before rate limits and other checks.

**Value to seven base-15 digits, most significant first.**

For $i=6$ down to 0:

$$
d_i = \left\lfloor \frac{K}{15^i} \right\rfloor \bmod 15
$$

The code performs repeated remainder-and-divide:

```js
digits[index] = remaining % 15;
remaining = Math.floor(remaining / 15);
```

**Digits back to a value (Horner form).**

$$
K = ((((((d_0)\cdot 15 + d_1)\cdot 15 + d_2)\cdot 15 + d_3)\cdot 15 + d_4)\cdot 15 + d_5)\cdot 15 + d_6
$$

**Checksum.**

$$
S = \left(\sum_{i=0}^{6} w_i d_i\right) \bmod 225
$$

with

$$
(w_0,\ldots,w_6) = (1,2,4,7,8,11,13)
$$

**Check digit split.**

$$
c_0 = \left\lfloor \frac{S}{15} \right\rfloor, \qquad c_1 = S \bmod 15
$$

Both check digits are in 0–14. The two base-15 symbols can represent 225 checksum values.

**No-adjacent-repeat tone walk.**

Let `slot` be the previous data-tone slot in 0–15, with initial value 15. For data or check digit $d$:

$$
\text{slot}_{\text{next}} = (\text{slot}_{\text{previous}} + 1 + d) \bmod 16
$$

The transmitted tone number is $\text{slot}_{\text{next}} + 1$, because tone 0 is reserved for the marker. The decoder inverts it:

$$
d = ((\text{slot}_{\text{next}} - \text{slot}_{\text{previous}} - 1) \bmod 16 + 16) \bmod 16
$$

If the decoded digit is 15, the sequence is invalid: the alphabet is 0–14, and digit 15 is the spare slot that the walk never uses.

**Raised-cosine envelope.**

For a symbol with $N$ samples and $F$ fade samples:

$$
e[n] =
\begin{cases}
0.5 - 0.5\cos\left(\frac{\pi n}{F}\right), & 0 \le n < F \\[4pt]
1, & F \le n < N-F \\[4pt]
0.5 - 0.5\cos\left(\frac{\pi (N-1-n)}{F}\right), & N-F \le n < N
\end{cases}
$$

**Synthesis.**

$$
x[n] = A\,e[n]\sin\left(\frac{2\pi f n}{f_s}\right)
$$

Each symbol is written at its own offset, so the frame is the concatenation of 11 windowed tones.

### Detection

**Goertzel coefficient.**

$$
k = 2\cos\left(\frac{2\pi f}{f_s}\right)
$$

**Goertzel recurrence.**

$$
s[n] = x[n] + k s[n-1] - s[n-2]
$$

with $s[-1]=s[-2]=0$.

**Magnitude squared after $N$ samples.**

$$
|X|^2 = s_1^2 + s_2^2 - k s_1 s_2
$$

where $s_1$ is the previous value and $s_2$ the value before it at the end of the window.

**Normalised power and level.**

$$
P = \max\left(\frac{|X|^2}{N^2}, 10^{-12}\right), \qquad L = 10\log_{10}(P)
$$

**Detection margin.**

$$
M = L_{\text{loudest}} - \operatorname{median}(L_0,\ldots,L_{16})
$$

A tone is accepted only when $M \ge 9$ dB. The median is over all 17 tones in the same window. The loudest tone becomes the symbol; the margin is the confidence gate.

**Decision window length.**

$$
W = \max\left(512, \operatorname{round}(0.35N)\right)
$$

At 48 kHz, $N=5,760$, so $W=\operatorname{round}(2,016)=2,016$ samples. The window is centred in the symbol to avoid the fade edges.

**Search hop.**

$$
H = \operatorname{round}(f_s \times 0.010)
$$

At 48 kHz, $H=480$ samples, or 10 ms. The marker search slides in these steps.

**Marker minimum span.**

$$
1.5N
$$

The detected marker run must span at least 1.5 symbol lengths, so a single noisy window cannot start a frame decode.

**Frame-start estimate.**

$$
\text{estimate} = \operatorname{round}\left(\frac{\text{first} + \text{last} + W}{2} - N\right)
$$

The decoder then tries small offsets around the estimate: 0, ±1 hop, ±2 hops and ±3 hops.

### Lab measurements

**Baseline.**

$$
B_f = \operatorname{median}(b_{f,1},\ldots,b_{f,n})
$$

The baseline is measured for a short quiet period before probe tones.

**Peak after trimming.**

If the sorted windows are $x_1 \le \cdots \le x_n$ and $t=\lfloor 0.2n\rfloor$:

$$
P_f = \operatorname{median}(x_{t+1},\ldots,x_{n-t})
$$

The 20% trim removes early and late transients. A trimmed set must still contain at least one value.

**Probe margin.**

$$
M_f = P_f - B_f
$$

**Verdict.**

$$
\text{verdict} =
\begin{cases}
\text{strong}, & M_f \ge 12\ \text{dB} \\
\text{tentative}, & 6 \le M_f < 12\ \text{dB} \\
\text{weak}, & M_f < 6\ \text{dB}
\end{cases}
$$

**Meter percentage.**

$$
\text{meter} = \frac{\operatorname{clamp}(L,-100,0)+100}{100}\times 100
$$

So −100 dB maps to 0% and 0 dB maps to 100%. This is a display scale, not a calibrated loudness.

### Link planning and reports

**Transmission slot.**

$$
\text{slot} = 1320 + \text{gap}\ \text{ms}
$$

**Total transmission duration.**

$$
\text{total} = R\cdot 1320 + (R-1)\cdot\text{gap}\ \text{ms}
$$

for $R$ repeats. The default gap is 450 ms; the UI validates 100–5,000 ms and 1–100 repeats.

**Decode rate.**

$$
\text{rate} = \frac{\text{decoded}}{\text{planned}}
$$

The result is clamped to at least zero. If planned is zero or unavailable, the rate is `null` and the report says "not available", not 0%.

### Sessions, proofs and time

**Initial session state.**

$$
\text{wave}=0,\qquad \text{keyExpiresAt}=\text{startedAt}+120{,}000\ \text{ms}
$$

**Key freshness.**

$$
\text{fresh} \iff \text{status}=\text{active} \;\land\; \text{now} < \text{keyExpiresAt}
$$

Expiry is strict: at exactly `keyExpiresAt`, the key is no longer fresh.

**Proof message.**

```text
bioattend-proof:v1|session=<sessionId>|wave=<wave>|key=<key>|student=<studentId>
```

The signature is ECDSA P-256 over the UTF-8 bytes of that string, using SHA-256 and the IEEE P1363 64-byte `r || s` format.

**Query window end.**

$$
\text{expiresAt} = \text{closedAt} + \text{queryWindowHours}\times 3{,}600{,}000\ \text{ms}
$$

The default is 24 hours. The setting is validated from 1 to 168 hours. If `closedAt` is missing, the helper uses the current time; a real closed session always has one.

**Proof retention.**

$$
\text{deleteAfter} = \text{createdAt} + 24\ \text{hours}
$$

MongoDB's TTL monitor removes the document after the retention threshold. The deletion is not an application job and can lag.

### Attendance arithmetic

**Attendance percentage.**

$$
\text{percentage} =
\begin{cases}
\operatorname{round}\left(\frac{\text{present}}{\text{present}+\text{absent}}\times 1000\right)/10, & \text{present}+\text{absent}>0 \\
\text{null}, & \text{otherwise}
\end{cases}
$$

Pending and excused records are **not** in the denominator. This is an important interpretation: excused is excluded rather than counted as present or absent.

**Summary counts.**

```text
total   = every record in the session
present = status "present"
absent  = status "absent"
excused = status "excused"
pending = anything else
decided = present + absent
```

**Class average.**

For $n$ students with percentages $p_i$, where a null percentage is treated as 0:

$$
\text{classAverage} =
\begin{cases}
\operatorname{round}\left(\frac{1}{n}\sum_{i=1}^{n} p_i \times 10\right)/10, & n>0 \\
\text{null}, & n=0
\end{cases}
$$

This is the average of student percentages, not the pooled present/decided ratio. The two differ when students have different numbers of decided sessions. The code uses `student.percentage ?? 0`, so a student with no decided sessions pulls the average down rather than being excluded. Treat the figure as a display summary, not a statistical estimate.

**Finalisation.**

Remaining `pending` rows become `absent`; already present, absent and excused rows are left alone. The query window is tied to session close, not to finalisation.

### Location

**Haversine distance.**

For latitudes $\phi_1,\phi_2$ and longitudes $\lambda_1,\lambda_2$ in radians:

$$
a = \sin^2\left(\frac{\phi_2-\phi_1}{2}\right)
  + \cos\phi_1\cos\phi_2\sin^2\left(\frac{\lambda_2-\lambda_1}{2}\right)
$$

$$
d = 2R\arcsin\left(\sqrt{a}\right)
$$

with $R=6{,}371{,}000$ m. The result is rounded to the nearest metre.

The comparison is a straight-line surface distance, not a walking route. It cannot know about walls, floors or the difference between a classroom and the corridor directly above it. Accuracy is stored when supplied but does not change the distance calculation.

### Audit chain

For each entry $e$:

$$
\text{hash}(e) = \operatorname{SHA256}\left(\operatorname{canonicalJSON}(e)\right)
$$

where the canonical fields are:

```text
seq, prevHash, action, entityType, entityId, actor, actorEmail,
actorRole, impersonator, impersonatorEmail, summary, before, after,
metadata, ip, userAgent, isDemo, createdAt
```

Canonical JSON sorts object keys recursively, converts dates to ISO strings, buffers to base64 and ObjectIds to hex strings. The previous hash is part of the payload. Verification checks, in order:

1. `seq` is a positive integer;
2. `seq` equals the previous sequence plus one;
3. the recomputed hash equals the stored hash;
4. `prevHash` equals the previous entry's hash.

The chain is tamper-evident only. A full rewrite by someone who recomputes every hash is not detectable without an external anchor.

### PDF layout heuristics

These are not physics; they are the deterministic rules that turn PDF text items into lines.

**Line grouping tolerance.**

$$
\text{tolerance} = \max\left(1.5, \min\left(h\times 0.35\ \text{or}\ 2.5,\ 4\right)\right)
$$

A fragment joins an existing line when its y coordinate is within that tolerance. All fragments within the tolerance are then sorted left-to-right.

**Space insertion threshold.**

$$
\text{threshold} = \max\left(0.8, \min\left(\frac{\text{previous width}}{\text{previous characters}}\times 0.5,\ 3\right)\right)
$$

A gap larger than the threshold inserts one space. This is why per-character PDFs can reconstruct words instead of `h e l l o`.

**Bounds.**

$$
\text{file}\le 10\ \text{MB},\qquad \text{pages}\le 20,\qquad \text{characters}\le 200{,}000
$$

### What the formulas do not mean

- A 9 dB margin is not a 9 dB signal-to-noise ratio in the room. It is the loudest tone's lead over the median tone in one window.
- A 100% decode rate on a synthetic buffer is not a 100% attendance rate.
- A key space of 170 million does not make the key secret; the key is broadcast. Freshness, the wave state and the device signature carry the security.
- A Haversine distance does not prove a student was in the room; it is one piece of optional evidence.
- An attendance percentage is an arithmetic summary of human decisions, not a measurement of learning or presence.

## 118. Constant sheet

### Signal and codec

| Constant | Value | Where | Why |
| --- | --- | --- | --- |
| Tone count | 17 | `fsk.js` | One marker plus 16 data tones |
| Base frequency | 18,000 Hz | `fsk.js` | Bottom of the chosen band |
| Tone spacing | 110 Hz | `fsk.js` | Separates neighbouring Goertzel bins |
| Top tone | 19,760 Hz | derived | 18,000 + 110×16 |
| Symbol duration | 120 ms | `fsk.js` | Fits 11 symbols in 1.32 s |
| Fade duration | 6 ms | `fsk.js` | Suppresses clicks at symbol edges |
| Marker tone | 0 (18,000 Hz) | `fsk.js` | Never carries a digit |
| Data tone count | 16 | `fsk.js` | Tones 1–16 |
| Data symbols | 7 | `fsk.js` | Carries the key |
| Check symbols | 2 | `fsk.js` | Carries the 225-value checksum |
| Total symbols | 11 | `fsk.js` | 2 markers + 7 data + 2 check |
| Digit radix | 15 | `fsk.js` | Digits 0–14 |
| Checksum modulus | 225 | `fsk.js` | Two base-15 digits |
| Check weights | 1, 2, 4, 7, 8, 11, 13 | `fsk.js` | Spread single-symbol errors |
| Initial previous slot | 15 | `fsk.js` | Forces the first walk step into 0–14 |
| Detection margin | 9 dB | `fsk.js` | Minimum tone-over-median lead |
| Decision window | 35% of a symbol, min 512 samples | `fsk.js` | Avoids fades and transients |
| Search hop | 10 ms | `fsk.js` | Frame-start search granularity |
| Marker minimum span | 1.5 symbols | `fsk.js` | Rejects a single stray window |
| Minimum sample rate | 44,100 Hz | `labConfig.js` | Keeps 19.76 kHz below Nyquist |
| Lab strong verdict | 12 dB | `labConfig.js` | Conservative probe label |
| Lab tentative verdict | 6 dB | `labConfig.js` | Weaker but present |
| Probe tones | 15.5, 16.5, 17.5, 18.5, 19.5, 18.0, 19.76 kHz | `labConfig.js` | Coarse sweep plus codec edges |
| Lab tone duration | 700 ms | `labConfig.js` | Long enough to measure |
| Lab tone gap | 250 ms | `labConfig.js` | Separates probes |
| Lab tone level | 0.08 | `labConfig.js` | Deliberately modest |
| Baseline duration | 2,200 ms | `labConfig.js` | Quiet reference |
| Baseline settle | 450 ms | `labConfig.js` | Let the audio graph settle |
| Meter floor / ceiling | −100 / 0 dB | `labConfig.js` | Display clamp |
| TX frame duration | 1,320 ms | derived | 11 × 120 ms |
| TX default gap | 450 ms | `transmitPlan.js` | Default repeat spacing |
| TX gap range | 100–5,000 ms | `transmitPlan.js` | Validated input |
| TX repeat range | 1–100 | `transmitPlan.js` | Bounds a run |
| Run ID length | 6 | `transmitPlan.js` | Short human-readable identifier |
| Run ID alphabet | `A–H,J–N,P–Z,2–9` | `transmitPlan.js` | Avoids ambiguous characters |

### Sessions, proofs and retention

| Constant | Value | Where | Why |
| --- | --- | --- | --- |
| Key radix | 15 | `checkInSession.js` | Matches the frame |
| Key digits | 7 | `checkInSession.js` | Matches the frame |
| Key space | 170,859,375 | `checkInSession.js` | $15^7$ |
| Max key | 170,859,374 | `checkInSession.js` | $15^7-1$ |
| Initial wave | 0 | `checkInSession.js` | First key is wave 0 |
| Max wave | 1,000,000 | `checkInSession.js` | Wire-format sanity bound |
| Key lifetime | 120,000 ms | `checkInSession.js` | Two minutes |
| Key history | 20 entries | `checkInSession.js` | Bounded teacher history |
| Session statuses | `active`, `closed` | `checkInSession.js` | Two-state lifecycle |
| Distinct-key retries | 5 | `checkInSession.js` | Avoid repeating the previous key |
| Proof protocol | `bioattend-proof:v1` | `checkInProof.js` | Versioned signed message |
| Signature length | 64 bytes | `checkInProof.js` | Raw P-256 `r || s` |
| Signature encoding | Base64, 88 characters including `==` padding | `checkInProof.js` | Exact payload shape |
| Safe id length | 1–128 | `checkInProof.js` | Session/student identifiers |
| Proof TTL | 86,400 s | `checkInProofModels.js` | One day |
| Proof uniqueness | `(session, student, wave)` | `checkInProofModels.js` | One proof per wave |
| Query window default | 24 h | `settings.js` | Review period |
| Query window range | 1–168 h | `systemSettingModels.js` | Admin setting |

### Authentication, cookies and admin

| Constant | Value | Where | Why |
| --- | --- | --- | --- |
| JWT fallback lifetime | 5 days | `userModels.js` via `JWT_EXPIRE` | Session token |
| Cookie fallback lifetime | 7 days | `jwttoken.js` via `COOKIE_EXPIRE` | Browser copy |
| Super-admin session default | 12 h | `jwttoken.js` | Shorter high-privilege session |
| Super-admin session max | 72 h | `jwttoken.js` | Hard ceiling |
| SameSite default | `lax` | `cookieOptions.js` | First-party deployment |
| Cookie policy | `HttpOnly`, `Secure` in production | `cookieOptions.js` | JavaScript cannot read it |
| Admin step-up lifetime | 5 min | `adminStepUp.js` | Fresh approval window |
| Step-up cookie path | `/api/v1/admin` | `adminStepUp.js` | Narrow scope |
| WebAuthn challenge lifetime | 5 min | `adminPasskeyController.js` | Registration/assertion window |
| WebAuthn user verification | `required` | passkey controller | Prefer a real user gesture |
| Session version initial | 0 | `userModels.js` | Revocation counter |
| JSON body limit | 200 KB | `app.js` | Bounds request memory |
| Trust proxy | 1 hop | `app.js` | Render TLS termination |

### PDF preview

| Constant | Value | Where | Why |
| --- | --- | --- | --- |
| Max PDF bytes | 10,485,760 (10 MiB) | `pdfText.js` | Parser work bound |
| Max pages | 20 | `pdfText.js` | Parser work bound |
| Max characters | 200,000 | `pdfText.js` | Response/preview bound |
| Header scan | first 1,024 bytes | `pdfText.js` | Cheap `%PDF-` check |
| PDF preview rate | 20 / 10 min | `pdfUpload.js` | Per route, account and IP |
| Multer files | 1 | `pdfUpload.js` | No multi-file uploads |
| Multer fields | 0 | `pdfUpload.js` | No hidden form fields |
| Upload storage | memory only | `pdfUpload.js` | No disk persistence |
| Roster cap | 250 students | `roster.js` | Prototype class bound |
| Roster body | 200 KB JSON | `app.js` | Practical text bound |
| Timetable parsing | none | `timetableController.js` | A2a is preview-only |

### Rate limits

All limiters are in-memory, fixed-window and per process. The window starts at the first counted request. A restart clears every bucket.

| Route group | Window | Max | Key |
| --- | --- | --- | --- |
| `POST /auth/google` | 10 min | 30 | IP |
| `POST /auth/dev/login` | 10 min | 60 | IP |
| `POST /check-in-sessions/:id/proofs` | 1 min | 60 | User id, else IP |
| Admin passkey routes | 10 min | 20 | User id, else IP |
| Attendance/query exports | 10 min | 30 | User id, else IP |
| Admin exports | 10 min | 30 | User id, else IP |
| Roster PDF preview | 10 min | 20 | User id + IP |
| Timetable PDF preview | 10 min | 20 | User id + IP |
| Limiter factory default (not mounted globally) | 10 min | 30 | IP |

The limiter keeps at most 5,000 live buckets. When full, it sweeps expired buckets, then drops the oldest live bucket. That is a memory bound, not a fairness guarantee.

### Settings defaults and bounds

| Setting | Default | Bounds |
| --- | --- | --- |
| `queryWindowHours` | 24 | 1–168 |
| `geofenceRadiusMeters` | 30 | 1–1,000 |
| `lateGraceMinutes` | 10 | 0–120 |
| `requireQueryLocation` | false | boolean |
| `allowStudentQueries` | true | boolean |
| `demoModeEnabled` | true | boolean in development; production seed routes are 404 |
| `termName` | `Autumn 2026` | max 80 characters |
| `termStart` / `termEnd` | null | dates |

The `lateGraceMinutes` value is stored and displayed but is not used to auto-mark a student late; there is no late status in the attendance enum. Do not describe it as an automatic lateness rule.

### Data and display limits

| Limit | Value | Source |
| --- | --- | --- |
| Attendance rows per PATCH | 500 | `attendanceController.js` |
| Query reason | 10–1,000 chars | `queryController.js` |
| Location note | 300 chars | query schema |
| Decision note | 500 chars | query/attendance schema |
| Notification title | 160 chars | notification schema |
| Notification message | 600 chars | notification schema |
| Notification link | 300 chars | notification schema |
| Session list | 50 | check-in controller |
| Active-session discovery | 20 | check-in controller |
| Session proof list | 500 | check-in controller |
| Session query list | 200 | check-in controller |
| Export query rows | 2,000 | `exportController.js` |
| Export audit rows | 5,000 | `exportController.js` |
| Audit summary | 500 chars | audit schema |
| Audit user agent | 500 chars | audit schema |
| Location accuracy cap | 100,000 m | `location.js` |
| Earth radius | 6,371,000 m | `location.js` |

### Observed physical measurements

These are not design constants. They are the recorded 2026-10-25 sweep.

| Distance | Frames sent | Decoded | Rate | Receiver margin |
| --- | --- | --- | --- | --- |
| 1 m | 10 | 10 | 100% | 22.8–34.6 dB |
| 2 m | 10 | 9 | 90% | 20.4–32.8 dB |
| 3 m | 10 | 9 | 90% | 24.7–34.5 dB |
| 5 m | 10 | 4 | 40% | 11.1–12.9 dB |
| 10 m | 10 | 1 | 10% | 10.2 dB |
| **Overall** | **50** | **33** | **66%** | — |

The proposed Layer 1 gate was ≥95% at 1 m, 5 m and 10 m. The 1 m result meets it; the 5 m and 10 m results do not. The owner has directed that Layer 1 be treated as passed **for build planning only**. That is an assumption, not a measurement.

The 2026-10-24 archive contains a 10/10 run at 1 m and a nominal 5 m run whose receiver condition still said `1 m`; the latter is not a valid 5 m measurement. Reverse direction, muted control, phone models and media volume were not recorded in the current gate.

### Constants that must stay in sync

These values are duplicated across the browser and server, and a one-sided change is a bug:

| Value | Browser | Server |
| --- | --- | --- |
| Key space / max key | `fsk.js` | `checkInSession.js` |
| Max wave | shared proof code | `checkInSession.js` |
| Proof message version | `proofTransport.js` | `checkInProof.js` |
| Signature byte length | `proofTransport.js` | `checkInProof.js` |
| Key lifetime expectation | teacher/student UI | `checkInSession.js` |
| Wave bounds | UI helpers | `checkInProof.js` |

The tests that compare the browser and server message are the guard against drift.

## 119. Error-code and HTTP-status sheet

### The response envelope

Most JSON errors look like:

```json
{
  "success": false,
  "message": "A human-readable sentence"
}
```

Some errors add a stable machine code:

```json
{
  "success": false,
  "code": "pdf_no_text_layer",
  "message": "This PDF has no selectable text layer..."
}
```

The 428 step-up response also includes a `reason`:

```json
{
  "success": false,
  "code": "step_up_required",
  "message": "Approve this action with your passkey.",
  "reason": "missing"
}
```

The error middleware includes `code` only when the error's `code` is a string. Mongo's numeric duplicate-key code is not exposed. Malformed JSON returns a generic `Invalid JSON body`, never the parser's raw text.

### Status families

| Status | Meaning | Typical causes | Client action |
| --- | --- | --- | --- |
| **200 OK** | Success with a body, or an idempotent retry | Proof duplicate, close twice, normal read | Show the result |
| **201 Created** | A new record | Session started, proof accepted, query created | Show the created state |
| **204 No Content** | Success without a body | Used by some fetch paths/tests | Treat as success |
| **400 Bad Request** | The request shape or a value is invalid | Bad key/wave/signature, bad JSON, bad time, missing file, malformed PDF header, short query reason | Fix the input; do not retry unchanged |
| **401 Unauthorized** | No valid session | Missing cookie, expired JWT, changed secret, invalid token, disabled account, stale impersonation | Sign in again |
| **403 Forbidden** | Authenticated but not allowed | Wrong role, not on roster, student device rule, forbidden origin, production demo route, queries disabled | Do not retry; switch account or ask an admin |
| **404 Not Found** | The resource is absent **or intentionally hidden** | Unknown class, unowned class, unknown query/notification/device review, dev route in production | Stop; do not probe |
| **405 Method Not Allowed** | Wrong HTTP method | `GET /logout` (POST only), similar method mistakes | Use the documented method; read `Allow` |
| **409 Conflict** | The current state does not permit the action | Active session exists, session closed, wave not current, key expired, different proof for wave, duplicate query, already decided, no room, finalise before close | Refresh state; resolve the conflict |
| **413 Payload Too Large** | Upload exceeds the cap | PDF over 10 MB | Compress or split; do not raise the cap casually |
| **422 Unprocessable Entity** | The file is valid HTTP but cannot be processed | Password-protected PDF, too many pages, too much text, no text layer, unreadable PDF | Change the document; OCR is not built |
| **428 Precondition Required** | Valid super-admin session, but no fresh passkey step-up | Destructive admin action without `admin_step_up` | Register/assert a passkey, then retry |
| **429 Too Many Requests** | A rate-limit window is full | Repeated sign-in, proofs, exports, PDF uploads, passkey attempts | Wait for `Retry-After`; do not spin |
| **500 Internal Server Error** | An unexpected server failure | Bug, unhandled database error, malformed state | Show a generic error; check logs |
| **503 Service Unavailable** | Temporarily unable to serve | MongoDB not connected (readiness), Google sign-in not configured | Retry later; check `/health/ready` |

### Stable codes

Only a small number of errors are contractual codes. Prose can change; clients should branch on these codes where they exist.

| Code | Status | Meaning | Source |
| --- | --- | --- | --- |
| `pdf_missing` | 400 | No `file` part reached the handler | roster/timetable controller |
| `pdf_invalid` | 400 | No `%PDF-` header in the first 1 KB, or structurally invalid input | `pdfText.js` |
| `pdf_too_large` | 413 | Over 10 MiB, caught by multer or extraction | `pdfUpload.js`, `pdfText.js` |
| `pdf_upload_invalid` | 400 | Wrong file count or multer validation failure | `pdfUpload.js` |
| `pdf_too_many_pages` | 422 | More than 20 pages | `pdfText.js` |
| `pdf_too_much_text` | 422 | More than 200,000 characters | `pdfText.js` |
| `pdf_password_protected` | 422 | PDF.js raised `PasswordException` | `pdfText.js` |
| `pdf_no_text_layer` | 422 | Extraction returned no text; likely a scan | roster/timetable controller |
| `pdf_unreadable` | 422 | Damaged or unsupported PDF | `pdfText.js` |
| `step_up_required` | 428 | Valid admin session, no usable fresh passkey assertion | `middleware/adminStepUp.js`, passkey controller |
| `passkey_not_enrolled` | 409 | Step-up requested with zero registered passkeys | `adminPasskeyController.js` |

The PDF codes are mapped to friendly copy in:

- `attendance-frontend/src/utils/rosterImport.js`
- `attendance-frontend/src/utils/timetableImport.js`

The exact messages are not the contract. The codes are.

### Step-up reasons

A 428 response can carry one of these `reason` values:

| Reason | Meaning |
| --- | --- |
| `missing` | No `admin_step_up` cookie and no `x-admin-step-up` header |
| `invalid-token` | Signature or expiry check failed |
| `wrong-scope` | Token is not `stepUp: true` and `scope: "admin"` |
| `wrong-user` | Token belongs to a different account |
| `account-not-eligible` | Account is no longer an active super-admin |
| `stale-session` | `tokenVersion` changed after the step-up token was issued |
| `lifetime-too-long` | Token lifetime exceeds 300 seconds |

The UI should treat every 428 as "prompt for passkey and retry", but a repeated 428 with `account-not-eligible` will not be fixed by another prompt.

### Route-family failure map

| Route family | Common failures |
| --- | --- |
| `/auth/google` | 400 missing token, 401 invalid token, 403 wrong domain/test list/roster/disabled, 503 not configured, 429 limiter |
| `/auth/dev/*` | 404 outside development or flag off; 400 malformed persona; 429 limiter |
| `/islogin`, `/profile` | 401 no session; 400 invalid name; 401 disabled account |
| `/device-bindings/*` | 400 private material or invalid P-256 key; 403 teacher device claim; 404 missing review |
| `/classes`, `/rooms` | 400 missing fields; 409 duplicate room; 403 wrong role; 404 unowned class |
| Roster preview/save | 400 parse errors or no students; 404 unowned class; 409 duplicate room; 422 PDF issues |
| Session start/read/advance/close | 409 active session, closed session, no room, no evidence for advance; 404 not owned |
| Proof submission | 400 malformed payload; 403 signature/device/roster; 409 closed/current-wave/expired/different-proof; 429 limiter |
| Attendance register/finalise | 400 bad status or too many rows; 403 not owned; 404 roster row; 409 finalise while live |
| Analytics | 400 bad range; 403 not owned; 404 class/student |
| Queries | 400 reason/location; 403 disabled/not on roster/not permitted; 404 missing; 409 still live/window closed/duplicate/already decided/present |
| Notifications | 401 session; 404 not yours or unknown |
| Timetable | 400 bad day/time/class; 403 not owner; 404 class/entry; 422 PDF issues |
| Exports | 403 not staff/not owner; 404 session/class; 429 limit |
| Admin passkeys | 400 challenge/verification; 409 already registered or no passkeys; 428 step-up; 429 limit |
| Admin mutations | 403 wrong role; 404 target; 409 disabled/current-state conflict; 428 step-up |
| Demo routes | 404 production; 403 demo disabled; 428 reset without step-up |
| `/health/ready` | 503 database not connected |
| Unmatched API path | Express's default 404 (`text/html`), not the React shell and not the JSON error envelope; `/api` still sends `Cache-Control: no-store` |

The 404 rows above describe errors raised by the application. An **unmatched** `/api/*` path is the exception: no route or API-specific 404 handler catches it, so Express's built-in 404 returns a short `text/html` body (`Cannot GET /api/...`). It is still a 404 and is still marked `Cache-Control: no-store` by the `/api` middleware, but it is not the JSON envelope and it is not the SPA shell.

### Why some failures deliberately hide existence

- An unowned class returns **404**, not 403, so a teacher cannot enumerate other teachers' class ids.
- An unknown or out-of-scope device review returns **404**.
- A notification belonging to another user returns **404**.
- A query the caller may not view returns **403** for a known query, but the load path uses 404 for a missing id. The distinction is intentional in the current code, not a uniform policy.

These choices reduce probing but are not a complete anti-enumeration design. Timing and message differences remain possible.

### Error handling rules for clients

1. **401** → clear local session state and go to `/login`; do not retry with the same cookie.
2. **403** → show the server message; do not retry unless the user changes account or the state changes.
3. **404** → treat as absent; do not loop on a guessed id.
4. **409** → refetch the session, query or register, then decide; never blindly retry a state-changing request.
5. **422 PDF** → show the mapped message; do not retry the same file.
6. **428** → open the passkey step-up flow, then retry the original request once.
7. **429** → honour `Retry-After`; disable the button while waiting.
8. **503** → show "temporarily unavailable"; poll readiness at a human pace, not in a tight loop.
9. **500** → show a generic failure and log the correlation details available in the browser; do not expose stack traces.

### What not to do with error messages

- Do not render a server message with `dangerouslySetInnerHTML`.
- Do not parse a status from prose when a stable code exists.
- Do not treat `success: false` as a network failure; it is a valid JSON response.
- Do not assume every error has a `code`; many are message-only.
- Do not log a signature, key, cookie, password or full request body while debugging.
- Do not retry a non-idempotent request after a timeout without first checking whether the server already committed it. Session close and proof submission are idempotent by design; class creation and query creation are not.
# Part XV, continued — Reference

## 120. File map

### How to read this map

The repository has two npm projects, one documentation folder and a small set of operational scripts. Generated output (`node_modules`, `build`, `coverage`) and local secrets are deliberately excluded from the source map. The map is organised by responsibility, not by line count.

A path in this chapter is relative to the repository root:

```text
Attendance/
├── attendance-backend/
├── attendance-frontend/
├── docs/
├── measurements/
├── sample-rosters/
├── scripts/
├── plan.md
├── progress.md
└── README.md
```

### Top level

| Path | What it is |
| --- | --- |
| `README.md` | Project overview, quick start, current status |
| `plan.md` | Product/engineering plan and the document-ingestion gates |
| `progress.md` | Dated implementation log and recorded verification |
| `agent.md` | Working rules for an AI coding agent in this repository |
| `resume-prompt.md` | Handoff prompt describing where work stopped |
| `measurement-update-plan.md` | Plan for the next physical measurement update |
| `.nvmrc` | Node version hint for local development |
| `.github/dependabot.yml` | Dependency update automation |
| `.env.example` | Root environment template; safe placeholders only |
| `.env` | Ignored local environment; may contain real values |
| `.provider.env` | Ignored provider configuration; never commit |
| `litellm_config.example.yaml` | Example LLM proxy configuration; not used by the app |
| `litellm_config.yaml` | Ignored local proxy configuration; may contain keys |
| `docs/` | Human-facing guides and this book |
| `measurements/` | Dated acoustic measurement records and the current range gate |
| `sample-rosters/` | A small CSV roster sample |
| `scripts/` | Encrypted backup and restore runbook scripts |
| `attendance-backend/` | Express API, MongoDB models, PDF extraction, tests |
| `attendance-frontend/` | React app, acoustic codec, helpers, PWA shell |

### Backend entry points and configuration

| Path | Responsibility |
| --- | --- |
| `attendance-backend/index.js` | Validates configuration, starts the server, sets up the query sweeper, handles signals and fatal errors |
| `attendance-backend/app.js` | Express app: security headers, no-store, CORS, cookie parser, JSON limit, trust proxy, origin guard, route mounts, static frontend, error handler |
| `attendance-backend/package.json` | Backend scripts, Node engine, dependencies |
| `attendance-backend/package-lock.json` | Locked dependency tree; generated |
| `attendance-backend/config/config.env` | **Local secret configuration; ignored; never reproduce its values** |
| `attendance-backend/config/config.env.example` | Safe template with placeholder values |
| `attendance-backend/config/database.js` | Mongoose connection helper |
| `attendance-backend/scripts/verify-node-version.js` | `prestart` guard: Node 22.13+ |
| `attendance-backend/scripts/migrate-rooms.js` | One-time room migration helper |
| `attendance-backend/test-support/pdfFixture.js` | Generates deterministic PDF fixtures for tests |

### Backend routes

| Path | Mounted endpoints |
| --- | --- |
| `routes/userRoute.js` | `/health`, `/health/ready`, `/islogin`, `/logout`, `/profile`, `/profile/sessions/revoke` |
| `routes/googleAuthRoute.js` | `/auth/google`, device-binding claim/status, device review list/decision |
| `routes/devAuthRoute.js` | Development-only persona list and login; absent in production |
| `routes/classRoute.js` | Rooms, classes, roster preview/save/read, roster PDF preview |
| `routes/checkInSessionRoute.js` | Session creation/list/read/close/advance, proof submit/read, student discovery, session queries, location |
| `routes/attendanceRoute.js` | Register read/edit/finalise, student attendance, session history, class analytics, teacher audit |
| `routes/queryRoute.js` | Query create/list/review/detail/audit/decision/reopen |
| `routes/notificationRoute.js` | List, mark one/all read, clear read |
| `routes/timetableRoute.js` | Read/create/edit/delete slots; timetable PDF text preview |
| `routes/exportRoute.js` | Attendance/query/session PDF and Excel downloads |
| `routes/adminRoute.js` | Super-admin console, passkey endpoints, admin exports, demo endpoints, impersonation stop |

The exact middleware order is in chapter 51 and in `app.js`. Route files attach guards per route where ordering matters; a blanket `router.use` can swallow routes mounted later.

### Backend controllers

| Path | Responsibility |
| --- | --- |
| `controllers/userController.js` | Session resolution, logout, profile read/update, session revocation |
| `controllers/googleAuthController.js` | Google ID-token verification, account creation/linking, device claim/status/review |
| `controllers/devAuthController.js` | Dev persona login |
| `controllers/classController.js` | Rooms, classes, roster parse/preview/save, roster PDF extraction |
| `controllers/checkInSessionController.js` | Session lifecycle, teacher/student views, wave advance, proof list, session queries, optional location |
| `controllers/checkInProofController.js` | Proof validation, device/roster checks, signature verification, evidence persistence |
| `controllers/attendanceController.js` | Register, marking, finalisation, student views, analytics, teacher audit |
| `controllers/queryController.js` | Query creation, decisions, expiry, reopen, audit |
| `controllers/notificationController.js` | Notification reads and cleanup |
| `controllers/timetableController.js` | Timetable CRUD and PDF text preview |
| `controllers/exportController.js` | PDF/Excel generation and export audit |
| `controllers/adminController.js` | Overview, users, classes, sessions, attendance override/delete, queries, audit, settings, impersonation, demo |
| `controllers/adminPasskeyController.js` | Passkey registration, step-up options/verify, status |

### Backend middleware

| Path | Responsibility |
| --- | --- |
| `middleware/auth.js` | JWT/cookie authentication, role authorisation, account status/version checks |
| `middleware/catchasyncerror.js` | Wraps async handlers and forwards rejections |
| `middleware/error.js` | Central JSON error response, malformed JSON, CastError, duplicate key, JWT mapping, stable code passthrough |
| `middleware/originGuard.js` | Blocks unsafe cross-site requests and enforces the origin allow-list |
| `middleware/rateLimit.js` | In-memory fixed-window limiter |
| `middleware/pdfUpload.js` | Memory-only multer upload, PDF size/file errors, per-route preview limiter |
| `middleware/adminStepUp.js` | 428 guard for destructive super-admin actions |

### Backend models

| Path | Collection / purpose |
| --- | --- |
| `models/userModels.js` | Users, role, status, token version, device public key/fingerprint, JWT helper |
| `models/roomModels.js` | Unique room numbers |
| `models/classModels.js` | Course class, teacher, default room, unique teacher/course/section |
| `models/enrollmentModels.js` | Roster membership, unique class/email, active/inactive |
| `models/checkInSessionModels.js` | Session state, current key, bound key history, one active session per class |
| `models/checkInProofModels.js` | Evidence-only proof, unique student/wave, 24-hour TTL |
| `models/attendanceRecordModels.js` | Durable register row, unique session/studentEmail, status/source/evidence |
| `models/attendanceQueryModels.js` | Student query, status, window, locations, decisions, reopen history |
| `models/auditLogModels.js` | Append-only audit entry, action allowlist, chain fields |
| `models/notificationModels.js` | In-app notifications |
| `models/timetableModels.js` | Weekly slots, day/time validation |
| `models/systemSettingModels.js` | Singleton settings with bounds |
| `models/adminPasskeyModels.js` | Public passkey credential, counter, transports |
| `models/webauthnChallengeModels.js` | Short-lived WebAuthn challenges, TTL |
| `models/deviceBindingRequestModels.js` | Pending/approved/rejected device review |

### Backend utils

| Path | Responsibility |
| --- | --- |
| `utils/adminStepUp.js` | Step-up token signing/verification, cookie/header extraction, reasons |
| `utils/attendance.js` | Roster snapshot, query-window expiry, attendance views, percentage, date ranges |
| `utils/audit.js` | Audit writer and audit view |
| `utils/auditChain.js` | Canonical JSON, SHA-256 hash, in-process append queue, chain verifier |
| `utils/checkInProof.js` | Versioned proof message, payload validation, P-256 verify, proof decisions/views |
| `utils/checkInSession.js` | Key space, minting, TTL, wave advance, close, teacher/student views |
| `utils/cookieOptions.js` | SameSite and cookie flags |
| `utils/csp.js` | Content-Security-Policy builder |
| `utils/dbReady.js` | Mongoose connection readiness |
| `utils/devAuth.js` | Dev persona parsing and production refusal |
| `utils/deviceBinding.js` | Public JWK validation, fingerprinting, private-material rejection |
| `utils/envFlag.js` | Explicit truthy environment parsing |
| `utils/errorhandler.js` | Error class with status code |
| `utils/jwttoken.js` | Token/cookie issuance, super-admin lifetime |
| `utils/location.js` | Location normalisation, Haversine distance, display |
| `utils/notifications.js` | Notification creation helper |
| `utils/pdfText.js` | PDF.js loading, bounds, line reconstruction, stable PDF errors |
| `utils/presentUser.js` | Safe user view for API responses |
| `utils/rehearsalEnrollment.js` | Dev/test roster exception |
| `utils/roles.js` | Role constants/helpers |
| `utils/roster.js` | CSV/paste parser, identity derivation, validation |
| `utils/sessionVersion.js` | Token-version comparison |
| `utils/settings.js` | Settings defaults, read/update, view |
| `utils/signInPolicy.js` | Domain, allowlist, role resolution, overlap validation |
| `utils/startServer.js` | Connect → index init → listen order |
| `utils/validateEnv.js` | Production configuration validation |
| `utils/verifyJwt.js` | JWT verification with rotation secret |
| `utils/webauthn.js` | WebAuthn origin/RP configuration and helpers |
| `utils/webauthnServer.js` | SimpleWebAuthn server adapter |

### Backend tests

There are **39 test files** and **255 test cases** in the recorded run. The static `test(...)` count is 201 because several cases are generated in loops.

| Group | Files |
| --- | --- |
| Startup/config | `startup.test.js`, `startServer.test.js`, `validateEnv.test.js`, `signInPolicy.test.js`, `devAuth.test.js`, `rehearsalEnrollment.test.js` |
| Auth/session/device | `googleAuthController.test.js`, `sendToken.test.js`, `verifyJwt.test.js`, `authMiddleware.test.js`, `logout.test.js`, `sessionVersion.test.js`, `adminUserRevocation.test.js`, `deviceBinding.test.js`, `deviceBindingClaim.test.js`, `deviceReview.test.js`, `impersonation.test.js`, `cookieOptions.test.js` |
| WebAuthn | `adminPasskey.test.js`, `webauthn.test.js` |
| Security/limits | `csp.test.js`, `appWiring.test.js`, `originGuard.test.js`, `rateLimit.test.js` |
| Proof/session | `checkInProof.test.js`, `checkInProofController.test.js`, `checkInSession.test.js`, `checkInSessionAdvance.test.js`, `studentActiveSessions.test.js` |
| Audit | `auditChain.test.js`, `auditActions.test.js` |
| Rosters/PDF/errors | `roster.test.js`, `pdfText.test.js`, `pdfImport.test.js`, `pdfRoute.test.js`, `timetablePdf.test.js`, `timetablePdfRoute.test.js`, `errorMiddleware.test.js` |
| Settings/admin | `settingsUpdate.test.js` |

The suite uses Node's built-in runner and needs no live MongoDB. See chapters 97–100 for what it does and does not prove.

### Frontend entry points and configuration

| Path | Responsibility |
| --- | --- |
| `attendance-frontend/package.json` | Scripts, dependencies, Node engine inherited from local Node |
| `attendance-frontend/package-lock.json` | Locked dependency tree; generated |
| `attendance-frontend/.env.example` | Frontend build-time variable template |
| `attendance-frontend/.env` | Local build-time values; ignored |
| `attendance-frontend/vercel.json` | Alternate split-deployment rewrite configuration |
| `attendance-frontend/src/index.js` | React root, CSS import, service-worker registration |
| `attendance-frontend/src/App.js` | Browser router, routes, guards, shell selection |
| `attendance-frontend/src/setupProxy.js` | Same-origin development proxy for `start:shared` |
| `attendance-frontend/src/config/api.js` | API base URL, fetch wrapper, error normalisation |
| `attendance-frontend/src/hooks/useSession.js` | Public-page session resolution |
| `attendance-frontend/src/hooks/useRoleSession.js` | Protected-page role/session resolution and redirects |
| `attendance-frontend/src/utils/auth.js` | Role-to-dashboard routing and auth helpers |
| `attendance-frontend/src/utils/deviceKey.js` | IndexedDB P-256 key generation/loading, public JWK export, signing |
| `attendance-frontend/src/utils/format.js` | Date, duration, percentage, text helpers |
| `attendance-frontend/src/utils/geolocation.js` | One-shot optional location capture |
| `attendance-frontend/src/utils/rosterImport.js` | PDF detection, extraction summary, stable error mapping |
| `attendance-frontend/src/utils/timetableImport.js` | Same for timetable preview |
| `attendance-frontend/src/utils/adminStepUp.js` | Admin passkey/step-up client helper |

### Frontend acoustic layer

| Path | Responsibility |
| --- | --- |
| `src/acoustic/fsk.js` | Tone plan, frame encode/decode, Goertzel, checksum, no-repeat walk |
| `src/acoustic/receiver.js` | Microphone/audio graph, frame search loop, sample-rate and device checks |
| `src/acoustic/transmitPlan.js` | Run id, transmission plan, key prefill, receiver link, report arithmetic |
| `src/acoustic/proofTransport.js` | Proof message, key storage, signing, submit `fetch` contract |
| `src/acoustic/labConfig.js` | Probe list, baseline/peak/verdict, meter, mic errors |
| `src/acoustic/useCheckInAudio.js` | React hook around capture, decode, signing and submission |
| `src/acoustic/fsk.node-tests.js` | Codec tests |
| `src/acoustic/lab.node-tests.js` | Lab/config tests |
| `src/acoustic/worklet.node-tests.js` | Worklet-related pure tests |
| `src/acoustic/link.node-tests.js` | TX/RX link/report tests |
| `src/acoustic/pcm-worklet.node-tests.js` | PCM worklet helper tests |
| `src/acoustic/proof.node-tests.js` | Proof transport/message tests |

### Frontend components and pages

| Path | Responsibility |
| --- | --- |
| `src/components/Home.jsx`, `Home.css` | Landing page |
| `src/components/login/Login.jsx`, `Login.css` | Sign-in, dev personas, redirects |
| `src/components/login/GoogleSignInButton.jsx` | Google Identity Services button |
| `src/components/Navbar/navbar.jsx`, `Navbar.css` | Role-aware navigation, theme, notifications |
| `src/components/NotFound.jsx` | Client-side 404 |
| `src/components/student/studentDashboard.jsx`, `.css` | Student home, device state, live sessions |
| `src/components/student/studentCheckIn.jsx`, `.css` | Consent, capture, evidence card |
| `src/components/student/studentCheckInView.js`, `.node-tests.js` | Pure check-in view helpers |
| `src/components/teacher/teacherDashboard.jsx`, `.css` | Teacher home and review queue |
| `src/components/teacher/classManagement.jsx`, `.css` | Rooms, classes, roster editing, PDF extraction, device approvals |
| `src/components/teacher/checkInSessions.jsx`, `.css` | Session start/key/advance/close/evidence |
| `src/components/teacher/checkInSessionView.js`, `.node-tests.js` | Pure session view helpers |
| `src/components/teacher/SessionAttendanceModal.jsx` | Session register and marking |
| `src/components/attendance/AttendanceAnalytics.jsx` | Student/teacher/admin analytics |
| `src/components/sessions/SessionHistory.jsx` | Closed-session history |
| `src/components/queries/QueryCenter.jsx` | Query creation, review, decision, reopen |
| `src/components/exports/ExportCenter.jsx` | Download centre |
| `src/components/notifications/Notifications.jsx` | Notification list |
| `src/components/profile/Profile.jsx` | Profile settings |
| `src/components/help/Help.jsx` | Role-specific help |
| `src/components/timetable/Timetable.jsx`, `.css` | Weekly grid, CRUD, PDF preview modal |
| `src/components/acousticLab/AcousticLab.jsx` | Seven-probe lab |
| `src/components/acousticLab/AcousticTransmit.jsx` | Two-phone transmitter |
| `src/components/acousticLab/AcousticReceive.jsx` | Two-phone receiver |
| `src/components/acousticLab/LinkShell.jsx` | Shared TX/RX layout |
| `src/components/acousticLab/ReportCard.jsx` | Copyable report |
| `src/components/acousticLab/linkUtils.js` | Shared link helpers |
| `src/components/acousticLab/acousticLab.css`, `fskLink.css` | Styles |
| `src/components/admin/AdminPanel.jsx` | Super-admin console |
| `src/components/shared/EventTimeline.jsx` | Audit/timeline display |
| `src/components/shared/LocationEvidence.jsx` | Location/distance evidence panel |

### Frontend UI library and tests

| Path | Responsibility |
| --- | --- |
| `src/ui/AppShell.jsx` | Page shell/navigation frame |
| `src/ui/Badge.jsx` | Status badge |
| `src/ui/Brand.jsx` | Logo/name |
| `src/ui/Button.jsx` | Button variants |
| `src/ui/Card.jsx` | Surface container |
| `src/ui/Charts.jsx` | Small accessible chart components |
| `src/ui/EmptyState.jsx` | Empty state |
| `src/ui/Field.jsx` | Input/field wrapper |
| `src/ui/Modal.jsx` | Dialog with focus handling |
| `src/ui/navigation.js` | Navigation model |
| `src/ui/pages.css`, `ui.css` | Shared styles |
| `src/ui/Spinner.jsx` | Loading indicator |
| `src/ui/StatCard.jsx` | Summary statistic |
| `src/ui/Tabs.jsx` | Tab control |
| `src/ui/theme.js` | Theme persistence |
| `src/ui/ThemeToggle.jsx` | Light/dark toggle |
| `src/ui/Toast.jsx` | Transient feedback |
| `src/index.css` | Global tokens/base styles |
| `src/components/student/studentCheckInView.node-tests.js` | 9 helper tests |
| `src/components/teacher/checkInSessionView.node-tests.js` | 7 helper tests |
| `src/utils/auth.node-tests.js` | 2 routing tests |
| `src/utils/rosterImport.node-tests.js` | 6 helper tests |
| `src/utils/timetableImport.node-tests.js` | 6 helper tests |

The acoustic test files are listed in the acoustic table. Total frontend helper tests: **96/96**.

### Frontend public and PWA files

| Path | Responsibility |
| --- | --- |
| `public/index.html` | HTML shell, theme bootstrap order, manifest links |
| `public/manifest.json` | PWA name, icons, colours, display mode |
| `public/sw.js` | Offline shell cache (`bioattend-shell-v2`), API bypass |
| `public/theme-init.js` | Pre-paint light/dark class |
| `public/tone-detector-worklet.js` | Audio worklet for tone detection/streaming |
| `public/pcm-capture-worklet.js` | PCM capture worklet |
| `public/robots.txt` | Crawler policy |
| `public/_redirects` | SPA rewrite for a static host |
| `public/icon-192.png`, `icon-512.png` | PWA icons |
| `public/apple-touch-icon.png`, `favicon-32.png`, `favicon.ico` | Browser icons |
| `src/assets/logo.png` | In-app logo |
| `README.md` | Frontend-specific notes |

### Documentation, measurements and operations

| Path | Responsibility |
| --- | --- |
| `docs/README.md` | Documentation index |
| `docs/what-is-this.md` | Short product explanation |
| `docs/how-it-works.md` | Main flow overview |
| `docs/getting-started.md` | Canonical local setup |
| `docs/deployment.md` | Production runbook |
| `docs/routes.md` | Frontend/API route inventory |
| `docs/backup-restore.md` | Encrypted backup/restore runbook |
| `docs/troubleshooting.md` | Symptom-based debugging |
| `docs/book/` | This book: one complete Markdown guide |
| `measurements/README.md` | Current physical gate and recorded sweep |
| `measurements/2026-10-24/README.md` | Historical two-phone runs and caveats |
| `measurements/2026-10-25/README.md` | Current distance sweep |
| `scripts/backup-db.sh` | Stream `mongodump` into AES-256-CBC, verify by decrypting through gzip |
| `scripts/restore-db.sh` | Restore into a scratch `_restore_`/`_drill_` database only |
| `sample-rosters/roster-001-010.csv` | Example roster input |

### Where to change what

| If you need to change… | Start here | Also update |
| --- | --- | --- |
| Tone frequencies, frame timing, checksum | `attendance-frontend/src/acoustic/fsk.js` | `checkInProof.test.js`, `fsk.node-tests.js`, this reference |
| Key/wave bounds or lifetime | `attendance-backend/utils/checkInSession.js` | `checkInProof.js`, browser proof helper/tests, models |
| Proof message format | `attendance-frontend/src/acoustic/proofTransport.js` | `attendance-backend/utils/checkInProof.js`, both test suites, protocol version |
| Google/allowlist policy | `attendance-backend/utils/signInPolicy.js` | `validateEnv.js`, startup tests, deployment docs |
| Session rules | `controllers/checkInSessionController.js` | `utils/checkInSession.js`, view helpers, route docs |
| Attendance status/source | `models/attendanceRecordModels.js` | controller validation, UI labels, exports, tests |
| Query lifecycle | `controllers/queryController.js` | query model, expiry helper, UI, audit actions |
| Audit fields or actions | `models/auditLogModels.js` | `utils/auditChain.js`, `utils/audit.js`, `auditActions.test.js`, this reference |
| A route or guard | `routes/*.js` and `app.js` | `docs/routes.md`, `appWiring.test.js`, route-specific tests |
| CSP or security headers | `utils/csp.js`, `app.js` | `csp.test.js`, deployment verification |
| PDF extraction | `utils/pdfText.js` | controllers, import helpers, PDF tests, this reference |
| PDF limits | `utils/pdfText.js`, `middleware/pdfUpload.js` | route docs, tests, error sheet |
| Settings defaults/bounds | `utils/settings.js`, `models/systemSettingModels.js` | admin UI, settings tests |
| A page | `src/App.js` plus the component | `docs/routes.md`, relevant helper test |
| The API client | `src/config/api.js` | auth hooks, error handling, build config |
| Deployment environment | `docs/deployment.md` | `validateEnv.js`, Render settings |
| Backup/restore | `scripts/*.sh`, `docs/backup-restore.md` | measurement/operator log |
| Physical expectations | `measurements/README.md` | `plan.md`, progress log, this book |

### Generated or local-only files

These should not be treated as source or committed:

```text
attendance-backend/node_modules/
attendance-backend/config/config.env
attendance-backend/config/config.env.*        (except .example)
attendance-frontend/node_modules/
attendance-frontend/build/
attendance-frontend/.env
attendance-frontend/.env.local
backups/
*.archive.gz.enc
*.archive.gz.enc.sha256
.venv/
.provider.env
.DS_Store
```

The presence of a real `config.env` or `.env` in a working copy is normal for local development. It is also why secret scanning and careful staging matter. The book never prints those values.

### A reading path through the files

For a new maintainer:

1. `docs/what-is-this.md` and `docs/how-it-works.md` for the product.
2. `plan.md` for the boundary and the gates.
3. `attendance-backend/app.js` for middleware order.
4. `attendance-backend/routes/*.js` for the API surface.
5. `attendance-backend/controllers/checkInProofController.js` and `utils/checkInProof.js` for the core evidence path.
6. `attendance-backend/utils/checkInSession.js` for keys and waves.
7. `attendance-backend/utils/auditChain.js` for the audit guarantee.
8. `attendance-frontend/src/acoustic/fsk.js` and `proofTransport.js` for the phone side.
9. `attendance-frontend/src/components/student/studentCheckIn.jsx` for the UI contract.
10. `attendance-frontend/src/components/teacher/checkInSessions.jsx` for the teacher flow.
11. `test/` and `*.node-tests.js` for the executable specification.
12. `docs/routes.md`, `docs/deployment.md` and this book for the map.

## 121. Glossary

### A–F

| Term | Plain-language meaning |
| --- | --- |
| **Acoustic proof** | The evidence a student's phone submits after decoding a session key: session, wave, key and a device signature. It is not attendance. |
| **Aliasing** | A false low-frequency reading caused by sampling a tone above half the sample rate. A 19.5 kHz tone sampled at 32 kHz appears near 12.5 kHz. |
| **Amplitude** | The height of a sound wave; roughly how hard the air is pushed. Digital audio represents it as a number, usually −1 to +1. |
| **Attendance query** | A student's claim that a register mark is wrong. A teacher or super-admin decides it; an approval marks the student present. |
| **Attendance record** | The durable register row for one student in one session. It has a status such as pending, present, absent or excused. |
| **Audit chain** | A sequence of audit rows where each row hashes its contents and the previous row's hash. Changing a row breaks the chain. |
| **Authentication** | Proving who you are. Google sign-in plus the session cookie. |
| **Authorisation** | Deciding what an authenticated account may do. Role and ownership checks. |
| **Base 15** | A number system with digits 0–14. Seven base-15 digits encode the session key. |
| **Baseline** | The quiet reference level measured before probe tones in the acoustic lab. |
| **Beacon** | A device that broadcasts a signal. Bio Attend does not use a BLE beacon; the teacher's phone is the acoustic transmitter. |
| **Checksum** | A short arithmetic fingerprint of the data symbols. It rejects corrupted frames; it is not a signature. |
| **Check-in session** | A live class check-in window with a wave number, a two-minute key and a roster snapshot. |
| **Claim (device)** | The browser's request to register its public key for teacher approval. |
| **Cookie** | A small browser-stored value. The session cookie is HttpOnly so JavaScript cannot read it. |
| **CORS** | Cross-Origin Resource Sharing: the server's rule for which browser origins may call the API. |
| **CSP** | Content-Security-Policy: a header that limits which scripts, styles, frames, workers and connections a page may use. |
| **dB (decibel)** | A logarithmic ratio. It compares two levels; it is not an absolute loudness unless a reference is stated. |
| **Decision window** | The short slice in the middle of a symbol that the decoder measures, avoiding fade edges. |
| **Decode rate** | Decoded frames divided by planned frames in a two-phone test. It is a link measurement, not an attendance rate. |
| **Device binding** | The link between a student account and a browser-held P-256 public key, approved by a teacher. |
| **Device fingerprint** | A SHA-256 hash of the canonical public key that identifies the device for review. It is not a hardware serial number. |
| **Doppler shift** | A change in observed frequency when the source or receiver moves. A walking phone can shift an 18 kHz tone by about 79 Hz. |
| **ECDSA** | Elliptic Curve Digital Signature Algorithm. The signature scheme used with P-256. |
| **Enrollment** | A student's membership in a class roster, keyed by email. |
| **Evidence-only** | The product rule that acoustic proof is recorded as evidence and never automatically changes attendance. |
| **Excused** | An attendance status that is neither present nor absent. It is excluded from the percentage denominator. |
| **Finalise** | Publish a session register and turn remaining pending rows into absent. |
| **FSK** | Frequency-shift keying: sending digits by choosing one of several tones for a fixed time. |

### G–M

| Term | Plain-language meaning |
| --- | --- |
| **Geofence** | A radius around a reference location. Bio Attend can show whether an optional location is within the configured radius; it does not track continuously or prove room presence. |
| **Goertzel algorithm** | An efficient way to measure the energy at one frequency in a block of samples. |
| **Haversine formula** | A formula for the great-circle distance between two latitude/longitude points. |
| **Hertz (Hz)** | Cycles per second. |
| **HttpOnly** | A cookie flag that prevents JavaScript from reading the cookie. |
| **Impersonation** | A time-limited super-admin session that acts as another user. It uses a separate token and is audited. |
| **IndexedDB** | Browser storage used for the device private key and local state. Clearing site data destroys the key. |
| **Institutional email** | An address ending in `@nitjsr.ac.in`, the only domain accepted for a normal student roster. |
| **JWT** | JSON Web Token: a signed token carrying account id, role, version and expiry. It is stored in an HttpOnly cookie. |
| **Key (session key)** | A random integer in 0–170,859,374 transmitted as seven base-15 tones. It is a one-time code, not a password. |
| **Key history** | Up to 20 archived waves with timestamps. Old key values are not returned to teachers. |
| **Key space** | The number of possible keys, $15^7 = 170,859,375$. |
| **Marker** | Tone 0 at 18,000 Hz. Two markers begin a frame and never carry data. |
| **Mongoose** | The MongoDB object-document mapper used by the backend. |
| **MongoDB Atlas** | The managed database service used in production. |
| **MFA / second factor** | A second proof of identity. Passkeys provide this for destructive super-admin actions; students do not have a second factor beyond Google and device binding. |

### N–S

| Term | Plain-language meaning |
| --- | --- |
| **No-adjacent-repeat walk** | The rule that consecutive data tones are never the same. It removes an ambiguous detection case and adds structure. |
| **Notification** | An in-app message for a student, teacher or admin. |
| **Nyquist frequency** | Half the sample rate. Frequencies above it alias. |
| **Origin** | Scheme + host + port, for example `https://example.com`. The origin guard compares it with a configured allow-list. |
| **Origin guard** | Middleware that rejects unsafe cross-site requests before they reach a route. |
| **Passkey** | A WebAuthn credential bound to an origin, unlocked by a fingerprint, face, PIN or hardware key. Used for super-admin step-up. |
| **PCM** | Pulse-code modulation: raw sampled audio. |
| **PDF text layer** | The selectable text embedded in a PDF. A scanned page is an image and has no text layer. |
| **Pending** | A session is live or a register row has no decision yet, depending on context. Read the surrounding noun. |
| **P-256** | An elliptic curve used for the student device key and ECDSA signatures. |
| **Proof** | See acoustic proof. |
| **Query** | See attendance query. |
| **Rate limit** | A cap on requests in a time window. The current limits are in-memory per process. |
| **Register** | The attendance table for a session: one row per roster student. |
| **Replay** | Playing a recorded tone again. A valid two-minute key can still be replayed; freshness and the wave state limit the window, not eliminate the attack. |
| **RP ID** | WebAuthn relying-party ID, normally the site's hostname. It must match the configured origin. |
| **SameSite** | A cookie attribute controlling cross-site sends. `Lax` is the default. |
| **Scoped key** | A key with a limited lifetime and use. The session key is scoped to one session and wave. |
| **Session** | A signed-in browser state or a check-in window. The context usually makes it clear; this book says "check-in session" for the latter. |
| **SHA-256** | A cryptographic hash producing 256 bits. Used for the audit chain and device fingerprint. |
| **Signature** | A cryptographic proof that the holder of a private key approved a message. The server stores only the public key. |
| **Step-up** | A fresh passkey assertion required before a destructive admin action. It opens a five-minute window. |
| **Student cascade** | A hypothetical multi-hop relay of a key between phones. It is deliberately not built. |

### T–Z

| Term | Plain-language meaning |
| --- | --- |
| **Timetable slot** | A weekly class entry: class, day, start, end, room, term. It does not start attendance. |
| **Token version** | A per-user counter. Incrementing it invalidates every existing session token for that user. |
| **TTL** | Time to live. MongoDB can delete a document after a set age; proofs use 24 hours. |
| **Ultrasound** | Sound above the usual human hearing range, roughly above 20 kHz. Bio Attend's band is near-ultrasound, not fully ultrasonic. |
| **Wave** | A numbered key generation inside a session. Starting is wave 0; advancing increments it and mints a fresh key. |
| **WebAuthn** | The browser/authenticator standard behind passkeys. |
| **Web Crypto** | The browser API (`crypto.subtle`) used to generate keys, export public JWKs and sign proof messages. |
| **Worklet** | A small audio-processing script that runs on the audio thread. Bio Attend uses worklets to stream PCM/tone measurements without blocking the UI. |
| **WSGI / serverless** | Deployment models not used here. The app is a long-running Node process. |
| **Zero-touch attendance** | Attendance with no human decision. Bio Attend explicitly does not claim this. |

### Acronyms in one line

| Acronym | Expansion |
| --- | --- |
| **API** | Application Programming Interface |
| **CORS** | Cross-Origin Resource Sharing |
| **CSP** | Content-Security-Policy |
| **CUID / ObjectId** | MongoDB document identifier (the project uses Mongo ObjectIds) |
| **ECDSA** | Elliptic Curve Digital Signature Algorithm |
| **FSK** | Frequency-Shift Keying |
| **GPS** | Global Positioning System |
| **HTTPS** | HTTP over TLS |
| **JWT** | JSON Web Token |
| **PCM** | Pulse-Code Modulation |
| **PDF** | Portable Document Format |
| **PWA** | Progressive Web App |
| **RP ID** | Relying-Party Identifier (WebAuthn) |
| **SHA** | Secure Hash Algorithm |
| **TTL** | Time To Live |
| **UI / UX** | User Interface / User Experience |
| **URL** | Uniform Resource Locator |
| **WebAuthn** | Web Authentication |

### Terms that are easy to misuse

| Do not say | Say instead | Why |
| --- | --- | --- |
| "The system marks attendance by sound" | "The system records acoustic evidence; the teacher marks attendance" | Automatic attendance is not built and is deliberately rejected |
| "The key proves the student was in the room" | "The key proves a phone decoded a live wave and signed it" | Sound can leak through walls, be recorded or be shared |
| "The audit chain is tamper-proof" | "The audit chain is tamper-evident" | A privileged rewrite can recompute the whole chain |
| "OCR works" | "PDF text-layer extraction works; OCR is gated on samples" | Scanned PDFs return `pdf_no_text_layer` |
| "The timetable is imported" | "The timetable PDF text is previewed; slots are added manually" | A2a has no parser or write path |
| "The system works at 10 m" | "The recorded 10 m decode rate was 1/10; 1–3 m was strong" | The measurement, not the build assumption, is the claim |
| "The tests cover the product" | "The tests cover algorithms, routes, validation and contracts" | Physical range, deployment and real PDFs are unverified |
| "The map proves the classroom" | "Location is optional supporting evidence" | GPS is spoofable and inaccurate indoors |
| "The app is fully accessible" | "The app has accessibility work and known gaps" | No formal WCAG audit exists |
| "Free hosting is production-grade" | "The pilot uses free tiers with documented limits" | Render sleeps; Atlas M0 has no automated backups |
# Part XVI — Teaching notes

This final part turns the book into something a person can use under pressure: a ten-minute demonstration, a plain-language explanation, a list of likely examiner questions and a set of answers that stay inside the evidence. The goal is not to sound impressive. It is to be understood and to remain accurate when a question goes somewhere inconvenient.

The one rule that governs every script in this part:

> Demonstrate what exists, name what does not, and never let a good demo become a stronger claim than the evidence supports.

## 122. How to demo the system in ten minutes

### The story the demo should tell

A ten-minute demo has room for one story. Use this one:

1. A teacher starts a check-in and shows a short-lived key.
2. A student's phone hears the key and signs a receipt with its own device key.
3. The server records **evidence**, not attendance.
4. The teacher reads the evidence and makes the attendance decision.
5. Every later correction is auditable, and a student can query a mark.

Everything else — passkeys, audit chain, PDF preview, device review — is supporting detail. Do not try to show every page. A demo that shows six half-understood screens is weaker than one that shows four screens completely.

### Choose the demo mode before the day

| Mode | What it needs | When to use it | Honesty requirement |
| --- | --- | --- | --- |
| **Live acoustic** | Two Android phones with Chrome, a quiet room, a pre-approved student device, a warm deployment or local stack | The best demonstration | Say the measured range; do not imply 10 m works |
| **Live UI, recorded acoustic** | One phone or laptop, a recording of the transmitter, the real pages | Hardware fails or the room is noisy | Say clearly that the acoustic result is recorded, not live |
| **UI walkthrough** | Laptop, local data, no microphone | A short interview or a broken device day | Do not claim a live proof was submitted |

Never fake a proof by typing a key into the browser console or replaying a captured request in front of an audience while calling it live. A recorded demonstration is honest if it is labelled; a fabricated one destroys the project's credibility.

### Preparation: 24 hours before

- Confirm the backend and frontend versions you will demo. If using the deployment, warm it and verify the live commit. The working tree and the live Render service were not verified while this book was written; do not assume they match.
- Confirm Google sign-in works for the demo accounts on the exact origin. A quick tunnel origin is not registered with Google unless you added it.
- Confirm the student device is already bound and **approved**. A first binding goes to the teacher review queue; that is a feature, not a demo step you want to discover live.
- Confirm the class has an active roster with the demo student.
- Confirm the class has a default room. Starting a session fails with 409 if it does not.
- Run the test gate you intend to quote. Know the counts from the current tree, not from an old slide.
- Charge both phones. Disable battery saver. Turn off Bluetooth unless you are deliberately testing a headset.
- Put the phones on the same Wi-Fi only if the deployment needs it. The acoustic link does not use the network, but the app does.
- Prepare a fallback: a short screen recording, a PDF report from a real measurement, or a second browser with the same demo data.

### Preparation: 30 minutes before

- Open the app on the teacher device and the student device. Sign in on both.
- Start a throwaway check-in session once and close it, to confirm the backend, database and room are working. Then start the real demo session fresh.
- Set the teacher phone's media volume to a moderate level. Do not max it near anyone's ear.
- Put the student phone 1 m from the teacher phone, on a table, microphone facing the teacher. Do not hold both phones in your hands and wave them.
- Confirm the student phone shows a supported sample rate in the acoustic lab if you have time. If it does not, use the fallback.
- Close other audio apps, video calls and music. A Bluetooth headset in call mode can narrow the capture band.
- Open the teacher check-in page, the student check-in page and the admin audit page in separate tabs or windows.
- Have the honest-limits sentence ready. Do not improvise it under pressure.

### Preparation: 5 minutes before

| Check | Pass condition |
| --- | --- |
| `/health` | 200 |
| `/health/ready` | 200; database connected |
| Teacher session | Signed in as teacher, correct class |
| Student session | Signed in as student, approved device |
| Roster | Student is active in the class |
| Room | Class has a default room |
| Volume | Moderate, audible test click or tone |
| Browser | Chrome, one tab per role |
| Fallback | Recording or report ready |

If `/health/ready` is 503, do not start a live demo and hope. Fix the database or switch to the UI walkthrough. A 503 is a clear signal, not a cosmetic warning.

### The ten-minute script

#### 0:00–0:45 — Frame the product

Say:

> This is an evidence-only attendance system. A phone can prove it heard a short-lived acoustic key, but the system does not mark anyone present automatically. The teacher makes the attendance decision. That boundary is the design, not a missing feature.

Then show the landing page or the teacher dashboard for five seconds and move on. Do not spend two minutes on the logo.

#### 0:45–2:00 — Start a check-in

On the teacher screen:

1. Open **Teacher → Check-in**.
2. Choose the demo class.
3. Press **Start check-in**.
4. Point at the live key and the two-minute countdown.
5. Press **Open transmitter** and show the key prefilled in the transmitter URL.

Say:

> The server minted this key for wave zero. It expires in two minutes. The sound carries only the key; it does not carry the student's identity. The student's phone will sign the key with its own device key.

Do not read the key aloud as if it were a password. It is broadcast by design, but the audience does not need to memorise it.

#### 2:00–3:15 — Student joins and consents

On the student phone:

1. Open **Student → Check-in**.
2. Show the live session card.
3. Show the consent notice.
4. Tick the consent checkbox and press **Join**.

Say:

> Audio is processed on this phone. Raw audio is not uploaded. The server receives the session, wave, decoded key and a signature from the approved device. Location is optional; denying it does not block check-in.

If the microphone prompt appears, accept it. If the student device is pending review, stop and explain the review queue rather than bypassing it.

#### 3:15–5:00 — Hear, decode and submit evidence

Keep the phones still at about 1 m. Let the transmitter play. On the student screen, wait for:

- a decoded key or a listening state;
- a proof submission;
- an evidence card that says **Evidence recorded** or similar.

Say:

> The phone decoded the key and signed it. The server verified the signature against the approved public key. This is evidence that a phone heard this wave and the device key signed it. It is not yet an attendance mark.

On the teacher screen, refresh the evidence list. Show the student's wave and timestamp. Do not show a key, signature or fingerprint; the teacher view does not expose them.

#### 5:00–6:15 — Teacher makes the decision

Open the session register. Show the row for the student and the evidence count. Mark the student **Present** manually, or show that the row is pending and explain that the teacher will decide.

Say:

> The teacher can mark present without evidence, or absent despite evidence. The evidence informs the decision; it does not replace it. That is intentional because sound can leak through a wall, a phone can be left on a desk, and a recording can be replayed.

If the demo has time, press **Finalise** after closing the session. Point out that pending rows become absent and that the query window is tied to session close.

#### 6:15–7:15 — A student query and the audit trail

Open **Queries** as the student. Show a closed session and the reason field. Explain:

> A student has 24 hours after the session closes to raise a query. The teacher can approve, reject or reopen it. Every decision is audited.

Do not submit a real query against a real class just for the demo unless you have prepared it. A prepared demo query is fine if it is labelled demo.

Open **Admin → Audit** or the teacher audit page and show one entry with a sequence number and hash. Say:

> New audit rows are chained. A changed row no longer matches its hash. The chain detects tampering; it is not tamper-proof against someone who can rewrite the whole chain.

#### 7:15–8:15 — Security in one minute

Show, in this order:

1. **Device review** — a new browser becomes a pending request; a teacher approves it.
2. **Passkey step-up** — a destructive admin action returns 428 until a fresh passkey assertion.
3. **Audit chain** — the verify button reports a clean chain or the first break.

Say:

> The student key is a P-256 key in the browser. The private key never goes to the server. The server stores the public key and a fingerprint. A new device waits for a teacher. The admin console uses passkeys because a stolen admin cookie would otherwise be enough to change roles or delete records.

If no passkey is registered, do not perform a destructive action. Show the 428 response and explain the setup.

#### 8:15–9:15 — The honest limits

This is the most important minute. Use a calm, specific sentence:

> The recorded range sweep decoded 10 of 10 frames at 1 metre, 9 of 10 at 2 and 3 metres, 4 of 10 at 5 metres and 1 of 10 at 10 metres. The proposed strong gate was 95% at 1, 5 and 10 metres, so it is not met. The owner has allowed Layer 1 as a build-planning assumption, not as a measured pass. The product therefore keeps manual attendance and does not claim classroom-wide range.

Then name the open gates:

- structured timetable parsing waits for representative PDFs;
- OCR waits for representative scans and accuracy/runtime measurement;
- hosted LLM extraction waits for a student notice and written risk acceptance;
- the live deployment, real Google sign-in and real passkey rehearsal are not verified by the automated suite;
- the Atlas restore drill is pending.

Do not rush this minute. An examiner who hears a clear limit trusts the rest more, not less.

#### 9:15–10:00 — Close

Say:

> The product is complete as an evidence-only prototype. It is not an automatic attendance product, and it should not be described as one. The next work is measurement and operational verification, not a bigger claim.

Then stop. Do not fill the silence with a feature list.

### A five-minute version

If you have five minutes:

1. **0:00–0:30** — boundary sentence.
2. **0:30–1:30** — teacher starts session; show key and timer.
3. **1:30–2:30** — student joins and submits evidence at 1 m.
4. **2:30–3:15** — teacher register; manual decision.
5. **3:15–4:15** — passkey/audit in one screen.
6. **4:15–5:00** — range measurement and open gates.

Drop the query flow and PDF preview. Mention them as available, not demonstrated.

### A fifteen-minute version

Add:

- a roster PDF preview that fills the textarea and does **not** save;
- a timetable PDF preview that shows text and has **no import button**;
- an intentional 428 admin action, then a passkey retry;
- a device review approval from a second browser;
- one query from creation to decision.

Do not add a second acoustic run at 5 m just to show failure. If you want to discuss range, use the recorded table. A failed live run at 5 m is evidence, but it consumes the demo and may look like a bug rather than a known limit.

### Failure playbook

| Symptom | What to do | What to say |
| --- | --- | --- |
| Student hears nothing | Move to 1 m, raise media volume slightly, keep phones still, replay or advance | "This is the measured range limit; let me use the 1 m position." |
| Microphone permission denied | Re-enable in the browser site settings, reload, retry | "Audio capture needs explicit permission." |
| Sample-rate gate refuses | Use another phone or the fallback | "This device's audio pipeline cannot represent the band; the gate is protecting the result." |
| Student device pending | Open the teacher review queue and approve, or use a pre-approved device | "A new browser must be approved by a teacher; that is the device-binding control." |
| Proof says key expired | Teacher advances or replays; student listens again | "The key lifetime is two minutes." |
| Start returns 409 | There is already an active session or no room | "The state conflict is deliberate; close the old session or set a room." |
| 401 on a page | Sign in again; confirm the cookie and origin | "The session expired; this is not an acoustic failure." |
| 429 | Wait for the window; check `Retry-After` | "A rate limit is protecting the route." |
| Render cold start | Wait, then reload; use the warm local fallback | "The free instance sleeps; this is hosting, not the codec." |
| Database readiness 503 | Do not start a live check-in; fix the database or use the fallback | "The API is alive but cannot serve data." |
| PDF preview says scanned | Switch to CSV/paste; do not claim OCR | "OCR is gated on samples and is not built." |
| Admin action 428 | Register/assert a passkey, then retry | "428 means a valid session still needs a fresh passkey." |
| Audit verify shows a legacy count | Explain that old rows lack chain fields; do not call it a break | "Legacy rows are counted, not treated as tampering." |

### What not to do in the demo

- Do not mark a student present automatically and call it the system's decision.
- Do not show the student's key in the student UI; the student UI deliberately hides it.
- Do not claim the sound proves the student was in the room.
- Do not run the transmitter at high volume near ears for a long time. Keep runs short.
- Do not use a real student's data in a public demo without consent.
- Do not reset demo data on a production database.
- Do not show `config.env`, cookies, JWTs, signatures or database credentials.
- Do not say "the tests prove it works at 10 m." They do not.
- Do not say "PDF import" when the app only previews text.
- Do not hide the 5 m and 10 m results when asked about range.

### After the demo

- Close the check-in session. Leaving one active blocks the next session for that class.
- Clear demo data only through the admin demo reset, and only outside production.
- Note what was demonstrated, on which commit, browser and device. A demo is evidence too; record it.
- If something failed, write down the exact status and message. Do not reconstruct it from memory.
- Do not commit or deploy changes just to make the next demo smoother unless they are tested and reviewed.

## 123. How to explain it to a non-technical audience

### The 30-second version

> A teacher starts a check-in and the classroom plays a short, high-pitched code that most adults cannot hear. A student's phone listens, decodes the code and signs a receipt with a key that belongs to that phone. The server checks the receipt and shows it to the teacher. The teacher still decides who was present. The system is evidence, not an automatic register.

### The three-minute story

Use a story with four objects: a bell, a receipt, a signature and a judge.

**1. The bell.** The teacher's phone is like a bell that rings a short pattern. The pattern changes every wave and expires after two minutes. A phone in the room can hear it; a phone in another building usually cannot, though sound can travel through walls and doors.

**2. The receipt.** The student's phone writes down the pattern it heard. This is the receipt. It contains the class session, the wave and the code.

**3. The signature.** The phone has a private key that never leaves it. It signs the receipt. The server has the matching public key, which can check the signature but cannot create a new one. A copied receipt from another phone will not verify unless that other phone has the same private key.

**4. The judge.** The teacher looks at the receipt and decides whether to mark the student present. The system does not decide. A phone on a desk, a friend in the corridor, a recording or a shared code are all reasons a receipt is not the same as attendance.

That is the whole product in four objects. Everything else is engineering around them.

### What the student's phone sends

Use a simple list:

- the session id;
- the wave number;
- the decoded key;
- a signature made with the phone's private key.

It does **not** send raw audio, a password, a photo, a face or continuous location. Location is optional and only captured at the moment of the action.

### Why the teacher still decides

An analogy:

> A security camera can show someone at a door. It cannot decide whether they were invited, whether they stayed, or whether the person at the door was the account holder. A human still decides. The camera is evidence.

The acoustic proof is the camera. It is useful, but it is not a verdict.

### Why not a QR code or GPS?

- **QR code:** a student can scan a photo of the code from anywhere. The camera saw a screen, not the room.
- **GPS:** indoors it is inaccurate and easy to spoof. A 30-metre circle can include the corridor and the canteen.
- **Bluetooth/Wi-Fi:** proves radio range, not classroom presence, and needs beacons or network setup.
- **Ultrasound:** a phone microphone can hear it, it needs no extra hardware, and it is a different signal from a screenshot. It is not unforgeable; it is a useful additional check.

Say "different evidence", not "perfect proof".

### Why it sometimes fails

Explain range with a physical analogy:

> A phone speaker is tiny. The note is very high. High notes fade quickly with distance and are easily blocked by a hand, a bag or a desk. The room's noise and echoes also compete. At one metre it works well; at five and ten metres the measured success drops sharply. That is why the teacher can always mark the register manually.

This is more credible than pretending the failure is a bug that will disappear.

### What the teacher does

1. Starts the check-in.
2. Shows or plays the key.
3. Watches the evidence arrive.
4. Marks the register.
5. Finalises it.
6. Answers queries within the review window.

The teacher is not replaced. The teacher is given a better record of what the phones heard.

### What the student does

1. Signs in with the college Google account.
2. Gets a device approved once.
3. Opens check-in, reads the consent notice and taps Join.
4. Lets the phone listen.
5. Sees "evidence recorded".
6. Can raise a query if a mark is wrong.

The student never sees the key. That is deliberate.

### What the administrator does

- Creates and manages accounts.
- Grants teacher roles.
- Oversees classes and settings.
- Can correct or delete attendance with a reason.
- Must use a passkey for destructive actions.
- Can verify the audit chain.

The admin panel is powerful, which is why it has a second factor and an audit trail.

### Privacy in one paragraph

> Audio is processed on the phone and is not uploaded. The server stores the decoded key, session, wave, device signature and optional location. Acoustic evidence is deleted after 24 hours. The attendance record and the audit entry last longer because they are the academic and accountability record. A student can deny location; check-in still works unless the teacher has turned on a location-required query setting.

Be precise: the **proof** is deleted after 24 hours; the attendance record retains aggregate evidence counts and timestamps. Do not say "all evidence disappears".

### Security in four sentences

> Sign-in is Google, and the server checks the college domain and its allowlists. The session is an HttpOnly cookie, so page scripts cannot read it. A student's phone key is bound to the browser and approved by a teacher. The admin console needs a passkey for dangerous actions, and changes are written to a hash chain that makes tampering visible.

That is enough for a non-technical audience. Do not explain ECDSA unless asked.

### PDFs and imports in plain language

> A teacher can upload a text-based PDF and the app shows the text it found. It does not save the roster or create timetable slots by itself. The teacher reads, corrects and confirms. A scanned PDF is rejected because OCR is not built. A timetable PDF is shown as text only; slots are added manually.

This is a feature, not a limitation to apologise for. Automatic import is the risky design.

### Answers for three audiences

#### For a student

> Your phone listens for a code, signs a receipt, and sends the receipt. The teacher decides. Audio stays on your phone. If your phone cannot hear the code, the teacher can still mark you manually, and you can raise a query.

#### For a teacher

> You start a session, play the key, and see which students submitted evidence. You still mark the register. The system saves you from guessing who heard the code; it does not make the academic decision. Device approvals and queries are part of your workflow.

#### For a principal or parent

> The system adds a physical-presence signal to attendance without automating the decision. It uses no cameras, no continuous location and no paid AI service. It keeps a human accountable, records changes, and is honest about its range limits. A pilot should treat it as decision support, not a replacement for roll-call.

### Translation table

| Technical phrase | Say this instead |
| --- | --- |
| "FSK-encoded one-time key" | "A short pattern of high-pitched tones" |
| "P-256 ECDSA signature" | "A signature that only this phone can make" |
| "Device fingerprint" | "A label for the approved browser" |
| "Audit hash chain" | "A tamper-evident log" |
| "JWT in an HttpOnly cookie" | "A login token the page's JavaScript cannot read" |
| "Step-up WebAuthn assertion" | "A fresh fingerprint or face check for a dangerous action" |
| "Idempotent proof submission" | "A retry does not create a duplicate" |
| "TTL index" | "The database deletes the detailed evidence after a day" |
| "PDF text layer" | "Selectable text inside the PDF" |
| "Structured timetable parsing" | "Turning the timetable into slots automatically — not built" |
| "Layer 1 gate" | "The physical range test" |
| "Evidence-only" | "The system records evidence; the teacher decides" |

### What not to say to a non-technical audience

- "It proves the student was in class." It does not.
- "It is unhackable." Nothing is.
- "It works anywhere in the room." The measurements say otherwise.
- "The AI reads the timetable." There is no AI in the built import path.
- "The system marks attendance automatically." It does not, by design.
- "The audit log cannot be changed." It can be changed; the change is detectable.
- "Free hosting is fully reliable." It sleeps and has no managed backups.

### A one-page handout

If you need a handout, use this:

> **Bio Attend — what it does**
>
> Bio Attend adds an acoustic presence check to classroom attendance. The teacher's phone plays a short near-ultrasonic key. A student's phone decodes it and signs the result with a device key approved by the teacher. The server stores the result as evidence. The teacher still marks the register.
>
> **What it protects:** a one-time key, a device-bound signature, a teacher decision, an auditable correction path.
>
> **What it does not claim:** that a phone in the room means the student attended, that the system marks attendance automatically, or that the acoustic link works at every distance. The measured 5 m and 10 m decode rates are weak.
>
> **Privacy:** audio stays on the phone; detailed proof evidence is deleted after 24 hours; location is optional.
>
> **Imports:** PDF text is previewed for a teacher to confirm. Scanned PDFs, OCR and automatic timetable import are not built.

## 124. Questions an examiner is likely to ask

The answers below are deliberately short. Chapter 125 explains how to frame an answer when you do not know, when the evidence is weak, or when the question is really about judgement.

### The problem and the scope

**1. What problem does this solve?**

It gives a teacher a low-cost, phone-only signal that a student's phone heard a live classroom code, and it records that signal as evidence. It does not replace the teacher's attendance decision. It is aimed at the gap between "no evidence" and "automatic surveillance".

**2. Why not just take attendance manually?**

Manual roll-call is fine and remains available. The acoustic layer is useful when a teacher wants a quick, independent record of which phones heard the session, especially in a large class. It is decision support, not a replacement.

**3. What is the single most important design decision?**

Evidence-only. The system refuses to turn a probabilistic acoustic signal into an academic record without a human decision. Every other choice — the key lifetime, the teacher review, the query process, the audit chain — follows from that.

### Physics and acoustics

**4. Why use sound instead of Bluetooth or Wi-Fi?**

Sound needs no beacon, pairing or network association. A phone microphone can hear a classroom speaker directly. Bluetooth and Wi-Fi prove radio range, not room presence, and need infrastructure. Sound is not perfect either; it can leak through walls and be recorded.

**5. Why 18–19.8 kHz?**

It is above most speech and room-noise energy, below the 22.05 kHz Nyquist limit at 44.1 kHz, and within the range some phone speakers and microphones can reproduce. It is near-ultrasound rather than fully ultrasonic. The lab measures each device because performance varies.

**6. Why does the signal fail at 5–10 m?**

Phone speakers are small and roll off at high frequencies; microphones are tuned for speech; high frequencies are absorbed by air; the inverse-square law reduces level; room noise and echoes interfere; hands and cases block the sound. The measured margin drops from 20–35 dB at 1–3 m to 10–13 dB at 5–10 m, close to the 9 dB detector threshold.

**7. Is the 9 dB margin a physical constant?**

No. It is a design threshold chosen to reject noise while accepting a real tone. The lab uses 12 dB for "strong" and 6 dB for "tentative". Those are relative digital levels, not calibrated dB SPL.

**8. Could a student in the corridor hear it?**

Possibly. Sound travels through walls and doors. The system does not claim room-boundary proof. That is one reason the teacher decides and why a query/appeal path exists.

**9. Could someone record and replay the tone?**

Yes. A recording played to a phone can produce a valid proof if the key is still fresh and the wave is current. The two-minute lifetime and wave sequence limit the window; they do not eliminate replay. The device signature proves which phone signed, not that the sound was live.

**10. What about two phones interfering?**

They can. The decoder listens for one frame; two simultaneous transmitters can create overlapping tones and confusion. The intended flow is one teacher transmitter, not a room full of phones transmitting.

**11. Why is the frame only 1.32 seconds?**

Seven base-15 digits plus two check symbols and two markers fit in 11 symbols at 120 ms each. That is long enough for a Goertzel measurement and short enough to repeat several times in a check-in wave. A longer frame would be more robust but slower and more exposed to room changes.

**12. Why 120 ms per symbol?**

It gives about 2,160 cycles at 18 kHz and enough separation for 110 Hz-spaced Goertzel bins, while keeping the frame short. It is a starting value, not a law of physics.

### Codec and mathematics

**13. How many possible keys are there?**

$15^7 = 170{,}859{,}375$, numbered 0 to 170,859,374, about 27.35 bits. The key is broadcast, so the size is not the security boundary; freshness, the wave state, the device signature and the teacher decision are.

**14. Why base 15, not base 16?**

Sixteen data tones minus the previous tone leaves fifteen choices for the next tone. That makes the no-adjacent-repeat rule possible. Seven base-15 digits also give a large enough key space.

**15. How does the checksum work?**

It is a weighted sum of the seven data digits modulo 225, with weights 1, 2, 4, 7, 8, 11 and 13. The result is split into two base-15 digits. It catches most symbol errors; it is not a cryptographic MAC.

**16. Why not a CRC?**

Two base-15 symbols are what the frame has room for. A CRC would be stronger, but the signature and server checks provide the security. The checksum is a noise filter.

**17. What is the no-adjacent-repeat rule?**

Consecutive data tones are never identical. The encoder walks the 16 data tones with a step derived from the digit, skipping the previous slot. The decoder inverts the walk. It removes the hardest case for a tone detector and adds a structural check.

**18. How does the decoder find the frame?**

It slides a 35%-of-symbol window in 10 ms hops, looking for a run of marker-tone detections above 9 dB. The run must span at least 1.5 symbols. It estimates the frame start, tries small offsets, measures all 17 tones in each symbol window, and decodes the sequence.

**19. Why Goertzel instead of an FFT?**

Goertzel measures a small number of known frequencies efficiently. The codec needs 17 specific bins, not a full spectrum. It is simple, deterministic and easy to test in Node and the browser.

**20. What happens if the sample rate is 32 kHz?**

The 18–19.8 kHz band is above the 16 kHz Nyquist limit and aliases to 12–14 kHz. The decoder would measure the wrong frequencies. The lab refuses to run below 44.1 kHz and the check-in path checks the rate.

### Evidence and security

**21. How do you know the proof came from the student's phone?**

The proof is signed with the P-256 private key generated in the student's browser, and the server verifies it against the public key approved for that student. A copied session cookie alone cannot sign. A stolen private key or a compromised browser can.

**22. What stops a student from sharing the key?**

Nothing completely. A student can tell a friend the decoded key; the friend can submit a proof with their own approved device if they are on the roster. The server sees a valid proof, not the room. The two-minute key and the teacher's judgement limit the damage; they do not eliminate collusion.

**23. What if the student changes phones?**

The new browser has a new key. The claim becomes a pending device change, the old device is frozen, and a teacher must approve. The private key is never uploaded.

**24. Why P-256 rather than a server-issued token?**

A bearer token is a secret that can be copied and replayed. A signature requires the private key, which stays in the browser and is non-extractable through Web Crypto. The server stores only the public key.

**25. Why not a passkey for students?**

Passkeys are designed to sync across devices. Attendance wants a device-bound key that needs explicit re-approval. A passkey would improve convenience but weaken the device story. The tradeoff is deliberate.

**26. What does the audit chain actually prove?**

It proves that a row's contents and its link to the previous row have not changed without detection, up to the last complete row. It does not prevent a privileged full rewrite, a tail deletion, or a change to the verifier. It is tamper-evident, not tamper-proof.

**27. Why does the admin console need a passkey?**

The console can change roles, revoke sessions, delete attendance, alter settings and impersonate users. A stolen admin cookie would be enough for enormous damage. A fresh WebAuthn assertion for destructive actions is phishing-resistant and short-lived.

**28. What if all admin passkeys are lost?**

Destructive routes return 428. There is no self-service reset; an operator with database access removes the `adminpasskeys` rows and the owner registers a new first passkey. That is deliberately painful.

**29. How do you stop CSRF?**

The session cookie is `SameSite=Lax`, and an origin guard rejects unsafe requests from origins not on the allow-list. State changes are POST/PATCH/DELETE, not GET. There is no separate CSRF token; that is a documented choice and a limitation.

**30. What is not protected?**

A compromised browser, a rooted phone, a malicious extension, a stolen unlocked device, a privileged database administrator, a determined replay, and a teacher who marks without looking. The system is accountable, not incorruptible.

### Architecture and data

**31. Why one service and one database?**

Cookies stay first-party, there is no CORS drift between frontend and API, one deploy ships both, and one URL avoids a class of configuration failures. The cost is that the API and static site scale together.

**32. Why MongoDB rather than PostgreSQL?**

The data is document-shaped: a session has a bounded key history, a proof has optional location, an audit row has arbitrary metadata. Mongoose gives schema validation and indexes. The project does not need complex joins at this scale. The cost is weaker relational guarantees and no foreign keys.

**33. What are the most important unique indexes?**

One active check-in session per class, one proof per student per wave, one attendance record per student per session, one enrollment per class/email, one class per teacher/course/section, one room number, one user email, one passkey credential, one settings key. These indexes are concurrency guards, not just performance helpers.

**34. Why no transactions?**

The common paths use single-document atomic updates or unique indexes. Cross-document operations, such as audit append or roster replacement, are not transactional. The code documents the small gaps. A real multi-document consistency requirement would need a transaction or an outbox.

**35. What happens when a proof and a session close race?**

The server evaluates the proof against the session state. A proof accepted before close is stored; a submission after close is rejected unless it is an idempotent retry of an already stored proof. The unique `(session, student, wave)` index prevents duplicates.

**36. What is the duplicate-query race?**

The query model has a non-unique index on `(session, studentEmail)`. Two simultaneous tabs can both pass the existence check and create two pending queries. The UI is not designed to exploit this, but a true race can produce duplicates. A unique index would be the fix.

### Frontend and usability

**37. Why does the student never see the key?**

The key is broadcast by the teacher's phone and the student's decoder extracts it from sound. Showing it in the student UI would turn a physical signal into a copyable text code. The student sees the wave and evidence state, not the key.

**38. How does the frontend know the proof message?**

`proofTransport.js` builds the exact versioned string, and the server's `checkInProof.js` builds the same string. A cross-language test asserts equality. A one-sided change fails the test.

**39. What happens if the browser loses IndexedDB?**

The private key is gone. The student signs in, claims a new device, and waits for teacher approval. The attendance history is unaffected; the device binding is a separate trust relationship.

**40. Is the app accessible?**

Partially. It uses semantic landmarks, labels, focus handling and text alternatives, but there has been no formal WCAG audit, no screen-reader certification, and charts remain visual. That is an honest gap, not a completed claim.

### Imports, operations and testing

**41. Why does the timetable PDF preview not import slots?**

The extractor returns text lines, not table rows. It does not know merged cells, electives, lab batches, rooms or conflicts. Guessing would look impressive on one sample and fail silently on another. Structured parsing is gated on representative PDFs.

**42. Why no OCR?**

OCR is CPU-heavy and accuracy depends on scan quality, fonts, skew and table lines. No representative scans have been supplied, so accuracy and runtime cannot be measured. A scanned PDF returns `pdf_no_text_layer` rather than an empty success.

**43. Why is Gemini not used?**

A raw roster contains names and college emails. Sending it to a hosted model is a privacy decision that needs a student notice, a data-field list, retention/training risk acceptance, a written owner decision and an opt-out fallback. None exists yet, so the code does not send rosters.

**44. What does the test suite prove?**

It proves the pure algorithms, route wiring, validation, security contracts, evidence-only views and startup refusal. Backend 255/255 in both isolation modes; frontend helpers 96/96; production build green. It does not prove physical range, real college PDFs, a live MongoDB, a real Google login, the deployed version or a classroom pilot.

**45. Why run the backend suite with `--test-isolation=none`?**

It catches tests that leak `process.env`, module cache state or globals. Passing both isolated and shared modes is stronger than passing one. It also exposes fragile tests before they fail in a different order.

**46. What is the biggest unverified claim?**

The physical range. The recorded sweep is strong at 1–3 m and weak at 5–10 m. Layer 1 is a build-planning assumption, not a measured pass. The live deployment and real PDF accuracy are also unverified.

### Judgement and reflection

**47. What would you do with six more months?**

Get representative timetable and roster PDFs, measure extraction quality, run a real Atlas restore drill, verify the deployed commit, run reverse/muted acoustic controls, and then a small classroom pilot. Automatic attendance would remain a separate decision with a much higher evidence bar.

**48. What is the hardest part of the project?**

Not the codec. The hard part is refusing to overclaim. A demo at 1 m looks like magic; the measured 5 m and 10 m results say it is not. Designing a product that stays useful and honest at that boundary is harder than adding a feature.

**49. What would you change if you started again?**

Choose the acoustic band and device assumptions only after a broader phone/room measurement, decide the audit-chain scaling model before adding admin features, and build the PDF corpus before writing any parser. Also add a real browser E2E suite earlier.

**50. Why should this project pass?**

Do not answer with a feature count. Answer with the evidence: a working evidence-only flow, tested algorithms and route contracts, layered security, a clear human decision boundary, a documented range limit, and a concrete next-step plan. Then let the examiner judge.

## 125. Answers that are honest

### The honesty rule

An honest answer has three parts:

1. **What is true.** State the implemented behaviour.
2. **What evidence supports it.** Name the test, measurement or code path.
3. **What remains unknown.** Name the limit without being asked twice.

For example:

> The proof path is implemented and tested: the browser and server build the same versioned message, P-256 verification accepts a real signature and rejects tampering, and the response is evidence-only. The physical claim is weaker: the recorded sweep decoded 33 of 50 frames, with 4/10 at 5 m and 1/10 at 10 m. The system does not claim classroom-wide range.

That answer is stronger than "it works" because it cannot be embarrassed by the next question.

### The claims table

| Claim | Status | Evidence | Say this |
| --- | --- | --- | --- |
| Acoustic key transmission and decoding | Built and tested on synthetic audio | Codec tests, 1–3 m measurements | "The codec and short-range link work; range falls off at 5–10 m." |
| Signed proof stored as evidence | Built and tested | `checkInProof.test.js`, route/controller tests | "The server records evidence and returns `attendanceDecided: false`." |
| Automatic attendance | Not built, deliberately rejected | Proof model has no status/score; teacher register | "No. The teacher decides." |
| Device binding and review | Built and tested | Claim/review tests | "A new browser waits for teacher approval." |
| Passkey step-up | Built and tested locally | WebAuthn tests, virtual authenticator | "Destructive admin actions need a fresh passkey; a real hardware passkey is not recorded." |
| Audit tamper evidence | Built and tested | Chain tests | "It detects a changed, deleted, reordered or forked chain; a full rewrite is not detectable." |
| PDF text-layer extraction | Built and tested with fixtures | PDF tests | "Text-based PDFs extract; scanned PDFs are rejected." |
| Real college PDF accuracy | Unverified | No representative samples | "No real roster or timetable PDFs have been validated." |
| Structured timetable import | Not built | Read-only preview only | "The PDF is previewed; slots are added manually." |
| OCR | Not built | `pdf_no_text_layer` | "Scanned PDFs are rejected; local OCR is gated." |
| Hosted LLM extraction | Not built | No code sends rosters | "It is gated on consent and risk acceptance." |
| Live deployment matches this tree | Unverified | Book snapshot only | "I did not verify the deployed commit." |
| Real Google sign-in | Manual only | Controller tests with mocks | "The path is implemented; the real popup on the deployed origin was not verified." |
| Atlas restore | Stub-tool only | Backup/restore scripts tested with stubs | "The script plumbing is tested; a real Atlas drill is pending." |
| 40-student load | Not tested | No load test | "The limiter is in-memory and the classroom burst is unmeasured." |
| Accessibility | Partial | Manual checks | "There is accessibility work, not a formal WCAG audit." |

### Sentences that are safe

- "The system records evidence; the teacher decides attendance."
- "The recorded sweep decoded 33 of 50 frames; 1–3 m was strong, 5–10 m was weak."
- "Layer 1 is a build-planning assumption, not a measured pass."
- "The backend suite passes 255/255 in both isolation modes; the frontend helpers pass 96/96; the production build is green."
- "The tests cover algorithms, route wiring, validation and security contracts, not physical range or real college PDFs."
- "A new device waits for teacher approval."
- "The audit chain is tamper-evident, not tamper-proof."
- "Scanned PDFs are rejected because OCR is not built."
- "A timetable PDF is previewed as text; no slot is created."
- "The live deployment and real Google/passkey rehearsal are not verified."
- "The Atlas restore script is tested with stubs; a real drill is pending."
- "The product is complete as an evidence-only prototype, not as an automatic attendance product."

### Sentences that are unsafe

| Unsafe sentence | Why it is false or misleading | Replace with |
| --- | --- | --- |
| "The system marks attendance automatically." | It never changes attendance from a proof. | "It records evidence; the teacher marks." |
| "It proves the student was in the room." | Sound leaks; a phone can be left behind; a recording can replay. | "It proves a phone heard the wave and signed it." |
| "It works at 10 metres." | 1/10 decoded at 10 m in the recorded sweep. | "It is strong at 1–3 m; 5–10 m is weak." |
| "The key is secret." | The key is broadcast by the teacher's speaker. | "The key is short-lived and bound to a wave; security comes from freshness, signature and the teacher." |
| "The system is unhackable." | No system is. | "It has layered controls and documented limits." |
| "The audit log cannot be changed." | A privileged writer can rewrite the chain. | "Tampering is detectable, not prevented." |
| "OCR works." | It is not built. | "Text-layer extraction works; scanned PDFs are rejected." |
| "The timetable is imported." | Only text is previewed. | "The timetable text is previewed; slots are added manually." |
| "The AI reads the roster." | No LLM path is built. | "The roster is parsed deterministically and confirmed by the teacher." |
| "The backup is verified." | Only stub-tool plumbing is tested. | "The scripts are tested with stubs; the Atlas drill is pending." |
| "It is fully tested." | Physical, real PDFs, live deployment and load are not covered. | "The automated suite covers the algorithms, routes and contracts; the physical and operational claims are bounded." |
| "It is accessible to everyone." | No formal WCAG audit; acoustic path excludes some users. | "There is accessibility work and known gaps; manual attendance remains available." |

### When you do not know

Do not invent. Use one of these patterns:

**If the question is outside the evidence:**

> I don't have a measurement for that. The honest answer is that it is unverified. The closest evidence is [name the test or measurement], and it does not cover [the missing condition].

**If the question is about a design choice you did not make:**

> That was a deliberate tradeoff in the current scope. The alternative is [alternative], and its cost is [cost]. I would revisit it if [condition].

**If the question is about a bug:**

> That is a known defect. It affects [scope], and the workaround is [workaround]. I have not fixed it in this slice because [reason]. The correct fix is [fix].

**If the question challenges the whole premise:**

> That is a fair challenge. The system does not claim to solve [the hard problem]. It claims [the narrower claim]. If the narrower claim is not useful, the product should not be used for that purpose.

### The "biggest weakness" answer

A good answer:

> The weakest link is physical presence. A phone can hear through a wall, be left on a desk, or play a recording. The acoustic proof is a useful signal, not a presence guarantee. That is why the product is evidence-only and why the measured 5–10 m range matters. The second weakness is operational: the live deployment and real restore drill are unverified.

Do not answer "nothing" or "the frontend CSS". Name the real weakness and show that the design responds to it.

### The "why not automatic?" answer

> Because the signal does not prove the person was in the room, stayed, or held the phone. Automating would turn a probabilistic signal into an academic record with no human accountable for the error. The project could add a confidence score, but a score would still be a probability, not a proof, and it would hide the judgement inside a number. The teacher remains the decision-maker.

### The "why ultrasound?" answer

> It is a low-cost signal that a phone microphone can hear without pairing, beacons or a camera. It is harder to forward casually than a screenshot of a QR code, and it keeps the raw audio local. It is not unforgeable: sound leaks and can be recorded. The project pairs it with a one-time key, a device signature, a teacher decision and an audit trail.

### The "what did you personally build?" answer

Be concrete and avoid claiming the whole product if you did not build it:

- the acoustic frame codec and tests;
- the session key/wave state and proof verification;
- the teacher/student evidence views;
- the device-binding and passkey flows;
- the audit hash chain;
- the PDF text preview;
- the frontend pages and helpers.

Name the parts you touched, the tests you ran, and one bug you fixed. If the project is team work, say what was yours.

### The "what is novel?" answer

> The novelty is not the idea of ultrasonic attendance; it is the combination of a short-lived acoustic key, a device-bound signature, an evidence-only boundary, a teacher decision, a student query path and a tamper-evident audit trail, built as a small web app with no paid services. The honest contribution is the design discipline around the evidence, not a claim that sound cannot be spoofed.

### The "what would you do next?" answer

Use the evidence order:

1. Obtain representative timetable and roster PDFs; measure extraction quality.
2. Run a real Atlas backup/restore drill.
3. Verify the deployed commit and a real Google/passkey rehearsal.
4. Run reverse-direction and muted-transmitter acoustic controls; record phone models and volume.
5. Improve the 5–10 m link or narrow the supported range explicitly.
6. Run a small classroom pilot with a teacher and students.
7. Only then consider automatic attendance, and only with a much higher evidence bar.

Do not put "add AI" first. It is not the bottleneck.

### The 60-second close

> Bio Attend is a working evidence-only attendance prototype. A teacher starts a session, a phone hears a short-lived key, the phone signs it with an approved device key, and the server records evidence. The teacher decides the register, students can query a mark, and the audit log makes changes visible. The codec and web flows are tested; the backend passes 255 tests in both isolation modes and the frontend helpers pass 96. The honest limits are physical range — strong at 1–3 metres, weak at 5–10 — and unverified real PDFs, deployment and restore. The project does not claim automatic attendance, and that is a design choice, not a missing button.

### The final checklist before any presentation

- [ ] I can state the evidence-only boundary in one sentence.
- [ ] I can state the 33/50 range result without looking it up.
- [ ] I can name what the tests cover and what they do not.
- [ ] I can explain why the student does not see the key.
- [ ] I can explain device binding and passkey step-up in one minute each.
- [ ] I can explain the audit chain's limits.
- [ ] I can say "not built" for OCR, structured timetable import, LLM extraction and automatic attendance.
- [ ] I can say "not verified" for the live deployment, real PDFs, real passkey hardware and the Atlas restore.
- [ ] I can name the duplicate-query race and the expired-query audit gap if asked about known defects.
- [ ] I can name the PDF class-average label bug as cosmetic if asked about known issues.
- [ ] I have a fallback demo and I have labelled it as a fallback.
- [ ] I have not put a secret, signature or real student data in a slide.

### The one paragraph to remember

Bio Attend does not try to win an argument with physics. It tries to record a narrow, useful acoustic event, bind it to an approved device, show it to a human, and make the human's decision auditable. Where the physics is weak, the product says so. Where the evidence is missing, the book says so. That is the standard the project should be judged by.
