# What is Bio Attend?

## The problem

Taking attendance the usual way is easy to cheat. In a roll call, a friend can answer for you. A QR code can be photographed and sent to someone outside the room. The teacher ends up with a list of names — not proof of who was actually there.

## The idea

Every check-in gets a one-time secret "key". The key is passed between phones as very high-pitched tones — near-ultrasonic, so most people can't hear them. A phone that hears the key is evidence that it was in the room, because the sound itself does not travel over the internet. In the full flow, the server will compare what each phone heard, decide attendance and score it; today it records signed evidence, lets the teacher advance waves after evidence and shows a read-only evidence list. It never claims attendance was decided.

Nothing to install: it runs in the phone's browser.

## Why it's hard to fake

- The tones only carry across a classroom — not across the internet.
- The key is fresh for every check-in, so recording one is useless later.
- Each phone is bound to one student account; a changed device waits for teacher approval.
- The server verifies the bound device's signature and records what arrived; deciding who was present is still a later, gated step.

## Where the project stands (October 2026)

| Piece | State |
| --- | --- |
| Google sign-in, classes, rooms, rosters | ✅ working |
| One device per student + teacher approval queue | ✅ working |
| "Sound lab" page that tests a phone's speaker and microphone | ✅ working |
| Modern UI for both roles | ✅ done |
| Live phone-to-phone tone test | ⚠️ 1 m 10/10, 2 m 9/10, 3 m 9/10, **5 m 4/10**, **10 m 1/10** (final 2026-10-25 sweep); reverse direction and muted control still being tested; the proposed gate is not measured as met (Layer 1 is an owner assumption for build planning only) |
| Server check-in sessions | ✅ session core, teacher screen, proof transport, student discovery, rehearsal enrollment, student shell, evidence-gated wave advancement and read-only teacher evidence view built |
| Full check-in flow for a real class | ⏳ evidence-only pilot works end to end; the student cascade, a real-phone/Google multi-wave rehearsal, scoring and the ID round are not built |

This is a capstone prototype — not yet used for real attendance. The live deployment is at <https://bio-attend.onrender.com>.

## Learn more

- [Getting started](getting-started.md) — run it yourself.
- [How it works](how-it-works.md) — the parts, in plain words.
