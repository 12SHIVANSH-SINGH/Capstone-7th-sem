# What is Bio Attend?

## The problem

Taking attendance the usual way is easy to cheat. In a roll call, a friend can answer for
you. A QR code can be photographed and sent to someone outside the room. The teacher ends
up with a list of names — not evidence of who was actually there.

## The idea

A phone that hears a fresh sound is probably in the room, because sound does not travel
over the internet. Bio Attend gives each check-in a short-lived key, carries that key
between student phones as near-ultrasonic tones, and records which bound phone decoded it.
The server stores signed evidence and shows it to the teacher. The **teacher confirms the
register**; a decoded tone never marks attendance automatically. A student who was present
but unmarked can raise a query for 24 hours after the session closes, and an approved query
counts as present.

Nothing to install: it runs in the phone's browser. Raw audio never leaves the phone; only
the signed proof is submitted.

## Why it is hard to fake

- The tones only carry across a classroom — not across the internet.
- The key is fresh for every wave and expires after two minutes, so a recording is useless
  later.
- Each phone is bound to one student account; a changed device waits for teacher approval.
- The server verifies the bound device's signature and roster enrollment.
- A decoded key is still data and can be forwarded. That is why attendance stays
  teacher-confirmed and why the ID round (neighbour verification) is still future work.

## Where the project stands (November 2026)

| Piece | State |
| --- | --- |
| Google sign-in, classes, rooms, rosters | ✅ working |
| One device per student + teacher approval queue | ✅ working |
| "Sound lab" page that tests a phone's speaker and microphone | ✅ working |
| Modern responsive UI, dark theme and installable web shell | ✅ done; service worker/offline shell verified in a production build |
| Teacher check-in sessions + signed evidence | ✅ session core, teacher screen, student discovery, rehearsal enrollment, student shell, evidence-gated wave advancement and teacher evidence view built |
| Teacher-confirmed attendance register | ✅ mark present/absent/excused, finalise, edit with an audit note, inspect evidence and query history |
| Attendance queries | ✅ 24-hour window after session close, location/time evidence, approve/reject/reopen with audit; approved queries count as present |
| Analytics, exports and supporting pages | ✅ per-class/per-student analytics, trends, session history, PDF/Excel exports, notifications, timetable, profile and help |
| Super-admin console | ✅ users/classes/sessions, settings, audit with hash-chain verification, overrides/deletion, impersonation; `SUPER_ADMIN_EMAILS` is an environment grant and works in production; demo seed/reset is development-only |
| Admin security | ✅ passkey step-up for destructive actions (five-minute approval cookie), teacher-approved first/replacement devices, revocable sessions, strict CSP and SHA-256 audit chain |
| Live phone-to-phone tone test | ⚠️ 1 m 10/10, 2 m 9/10, 3 m 9/10, **5 m 4/10**, **10 m 1/10** (2026-10-25 sweep); reverse direction and muted control unmeasured; gate not measured as met |
| Full flow on real phones | ⏳ attendance is teacher-confirmed and the local browser flow works end to end; a real-phone/Google multi-wave rehearsal, measured acoustic range, the student cascade, automatic scoring and the ID round are still pending |

This is a demo-ready capstone prototype — not yet used for real attendance. The live
deployment at <https://bio-attend.onrender.com> runs `029d18e`, which includes the
attendance/query/admin layer but not the P0/P1 security hardening; the owner has not deployed
the current tree.

## Learn more

- [Getting started](getting-started.md) — run it yourself.
- [Route reference](routes.md) — every page and API endpoint.
- [How it works](how-it-works.md) — the parts, in plain words.
- [`progress.md`](../progress.md) — current measurements, tests and blockers.
