# How it works

## The two apps

| Folder | What it is |
| --- | --- |
| `attendance-frontend/` | The website you see — React running in the browser (laptop or phone). |
| `attendance-backend/` | The server (Node + Express) and the database (MongoDB). It decides everything important. |

The frontend asks the backend for data; the backend talks to MongoDB and to Google for sign-in.

## Visual map

The PlantUML sources in [`docs/diagrams/`](diagrams/) are the quickest way to see the shape:

- **System components** — teacher phone, student phone, Express service, MongoDB, Google Identity, and the acoustic channel.
- **Check-in flow** — what happens today, plus the scoring/ID-round stages that are still gated.
- **Proof transport** — the exact Layer 2.3 request/response sequence.

The short version: sound moves between phones; the server stores signed evidence; scoring is a later layer.

## Signing in

Sign-in uses Google only — no passwords. With both test lists empty, only college accounts
are accepted; configured test lists also work in production. The server can allow a few
exact Gmail addresses listed in `TEST_STUDENT_EMAILS` (students) and `TEST_TEACHER_EMAILS`
(teachers). Those lists live in the server environment, are validated at startup, and are
never sent to the browser. There is no separate admin role or password: a test teacher is
simply a teacher account, and the allowlists decide who may sign in. Removing a Gmail test
address rejects its live session on the next request; the stored row keeps its role.
Removing a college address from `TEACHER_EMAILS` neither demotes nor signs out an existing
teacher. Rotating `JWT_SECRET` revokes every session.

On a student's first sign-in, the website quietly creates a private key in that browser and the server remembers it. This is the **device binding**. If the same student signs in from a *different* phone, the new device lands in a **review queue** — the teacher approves or rejects it first. That is what stops one student checking in for a group of friends.

## Classes, rooms and rosters (teacher side)

- A **room** is just a room number, e.g. `B-204`.
- A **class** has a course code, title, a default room, and a **roster** — the list of student emails (imported from the college CSV).
- Only emails on the roster may submit a proof for that class.
- For non-production (development/test) rehearsals only, `ALLOW_TEST_ROSTER_EMAILS=true` lets the teacher add the exact `TEST_STUDENT_EMAILS` addresses to a roster. Production startup refuses the flag, so a real roster stays college-only.

The teacher can now open **Check-in** (`/teacher/check-in`), choose a class, and start a
server-minted **check-in session**. It begins at wave 0 with a fresh seven-symbol key that
expires after two minutes. The screen shows the key, a live countdown, the room and the
session history, and closes the session when the teacher confirms.

Only the owning teacher can read or close a session. An enrolled student can read the
active session's wave and expiry, but never the key: the design intends a key to be earned
by hearing the previous one. The server can now advance the wave after accepted evidence
and keeps a bounded server-side key history, but the student cascade that would return the
next key to a phone and have it retransmit is **not built**. **Open transmitter** passes
the current key to the tested `/acoustic-tx` page with the value pre-filled, so the teacher
does not retype it.

The **Layer 2.3 proof transport** is built: a student phone can submit the session, wave and
key it decoded, signed with the P-256 device key bound at sign-in. The server checks the
signature, roster enrollment, active session and key freshness, and stores the result as
**evidence only** — it does not mark attendance or assign a score. Duplicate retries are
idempotent per student/wave, submissions are capped at 60 per minute per student, a pending
device change blocks proofs, and the evidence expires after one day. **Layer 2.4a** adds
`GET /student/check-in-sessions/active`, which lists live sessions for the student's own
active enrollments and never returns a key. **Layer 2.4b** adds `/student/check-in`: the
student reads a retention/consent notice and confirms it before Join, the phone listens for
the current wave, decodes it locally, signs the evidence with the bound device key and shows
the recorded-evidence card. The page never displays the key, and raw audio stays on the
phone. **Layer 2.4c** adds evidence-gated wave advancement: only a teacher can advance, the
current wave needs at least one accepted proof, the old key is archived in bounded history
(20 entries) and a fresh two-minute key is minted; old keys are never returned. The student
shell stops listening if the wave changes mid-capture. **Layer 2.5** adds a read-only
teacher evidence view for live and closed sessions: student email, wave, recorded time and
per-wave counts, with `attendanceDecided: false` and no key, signature, protocol version or
device fingerprint. Scoring, the ID round and the student cascade remain future work.

## The tones (the actual trick)

- A check-in will use a short sequence of **17 tones**, packed between roughly 18.0 kHz and 19.8 kHz — near-ultrasonic, so most people can't hear them.
- Each tone lasts 120 ms; a full "frame" takes about 1.3 seconds.
- Phones play the frame on their speaker and listen through the microphone. The server now
  records a signed proof of which session/wave/key a bound student's phone decoded, but
  that is evidence only: no score or attendance is decided yet. Today the TX/RX pages
  measure the link, and `/student/check-in` captures the current wave into signed evidence;
  neither page decides attendance.
- The code lives in `attendance-frontend/src/acoustic/fsk.js` (making and reading the tones) and `public/tone-detector-worklet.js` (listening live through the microphone). Both are covered by automated tests.

What we measured so far: the 2026-10-25 distance sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at 3 m, only 4/10 at 5 m and 1/10 at 10 m. RX margins at 5–10 m were 10.2–12.9 dB, close to the 9 dB detection threshold. On the Samsung M32 lab run, tones up to 18.5 kHz came back loud and clear but 19.5 kHz was too weak. The band and TX settings still need tuning; the reverse direction and muted control are unmeasured. The owner has directed that Layer 1 be treated as passed for build planning only; that is an **assumption, not a measurement**.

## Where things live in the code

| Job | File |
| --- | --- |
| Google sign-in + device review | `attendance-backend/controllers/googleAuthController.js` |
| Classes, rosters, rooms | `attendance-backend/controllers/classController.js` |
| Check-in sessions and proof transport | `attendance-backend/controllers/checkInSessionController.js`, `checkInProofController.js`, `attendance-backend/utils/checkInSession.js`, `checkInProof.js` |
| Teacher check-in screen | `attendance-frontend/src/components/teacher/checkInSessions.jsx`, `checkInSessionView.js` |
| Student check-in shell | `attendance-frontend/src/components/student/studentCheckIn.jsx`, `studentCheckInView.js`, `attendance-frontend/src/acoustic/useCheckInAudio.js` |
| Shared UI pieces (buttons, cards, toasts) | `attendance-frontend/src/ui/` |
| Pages (Home, Login, dashboards, sound lab, class management) | `attendance-frontend/src/components/` |

The long-term engineering plan is in `plan.md`; the live build log is `progress.md` (both in the repository root).
