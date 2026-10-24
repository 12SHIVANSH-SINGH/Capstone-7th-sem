# How it works

## The two apps

| Folder | What it is |
| --- | --- |
| `attendance-frontend/` | The website you see — React running in the browser (laptop or phone). |
| `attendance-backend/` | The server (Node + Express) and the database (MongoDB). It decides everything important. |

The frontend asks the backend for data; the backend talks to MongoDB and to Google for sign-in.

## Signing in

Sign-in uses Google only — no passwords. Only college accounts are accepted, plus a couple of test Gmail accounts during development.

On a student's first sign-in, the website quietly creates a private key in that browser and the server remembers it. This is the **device binding**. If the same student signs in from a *different* phone, the new device lands in a **review queue** — the teacher approves or rejects it first. That is what stops one student checking in for a group of friends.

## Classes, rooms and rosters (teacher side)

- A **room** is just a room number, e.g. `B-204`.
- A **class** has a course code, title, a default room, and a **roster** — the list of student emails (imported from the college CSV).
- Only emails on the roster can check in for that class.

The server can now start a **check-in session** for a class. It mints a short-lived
seven-symbol key, starts at wave 0, and only the owning teacher can read or close it. An
enrolled student can read the active session's wave and expiry, but never the key: a key
is earned by hearing the previous one. The teacher screen and the sound cascade come next.

## The tones (the actual trick)

- A check-in will use a short sequence of **17 tones**, packed between roughly 18.0 kHz and 19.8 kHz — near-ultrasonic, so most people can't hear them.
- Each tone lasts 120 ms; a full "frame" takes about 1.3 seconds.
- Phones play the frame on their speaker and listen through the microphone. The server checks which phones decoded it — those students are marked present.
- The code lives in `attendance-frontend/src/acoustic/fsk.js` (making and reading the tones) and `public/tone-detector-worklet.js` (listening live through the microphone). Both are covered by automated tests.

What we measured so far (Samsung M32): tones up to 18.5 kHz came back loud and clear, but 19.5 kHz was too weak on that phone. The tone band may shift down a little before the live two-phone test.

## Where things live in the code

| Job | File |
| --- | --- |
| Google sign-in + device review | `attendance-backend/controllers/googleAuthController.js` |
| Classes, rosters, rooms | `attendance-backend/controllers/classController.js` |
| Check-in sessions, keys and waves | `attendance-backend/controllers/checkInSessionController.js`, `attendance-backend/utils/checkInSession.js` |
| Shared UI pieces (buttons, cards, toasts) | `attendance-frontend/src/ui/` |
| Pages (Home, Login, dashboards, sound lab, class management) | `attendance-frontend/src/components/` |

The long-term engineering plan is in `plan.md`; the live build log is `progress.md` (both in the repository root).
