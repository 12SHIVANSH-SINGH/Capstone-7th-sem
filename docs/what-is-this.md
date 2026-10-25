# What is Bio Attend?

## The problem

Taking attendance the usual way is easy to cheat. In a roll call, a friend can answer for you. A QR code can be photographed and sent to someone outside the room. The teacher ends up with a list of names — not proof of who was actually there.

## The idea

Every check-in gets a one-time secret "key". The key is passed between phones as very high-pitched tones — near-ultrasonic, so most people can't hear them. A phone that hears the key is evidence that it was in the room, because the sound itself does not travel over the internet. In the full flow, the server will compare what each phone heard, decide attendance and score it; today it records the signed evidence only.

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
| Live phone-to-phone tone test | ✅ 10/10 at 1 m, 20/20 at 5 m (Oct 2026); reverse direction, control and 10 m still being tested |
| Server check-in sessions (wave-0 keys) | ✅ core and teacher screen built; proof transport built, student UI next |
| Full check-in flow for a real class | ⏳ evidence transport only — no scoring, ID round or student interface yet |

This is a capstone prototype — not yet used for real attendance. The live deployment is at <https://bio-attend.onrender.com>.

## Learn more

- [Getting started](getting-started.md) — run it yourself.
- [How it works](how-it-works.md) — the parts, in plain words.
