# What is Bio Attend?

## The problem

Taking attendance the usual way is easy to cheat. In a roll call, a friend can answer for you. A QR code can be photographed and sent to someone outside the room. The teacher ends up with a list of names — not proof of who was actually there.

## The idea

Every check-in gets a one-time secret "key". The key is passed between phones as very high-pitched tones — near-ultrasonic, so most people can't hear them. A phone that hears the key proves it was in the room, because the sound doesn't travel far and can't be streamed. The server compares what each phone heard and records the result.

Nothing to install: it runs in the phone's browser.

## Why it's hard to fake

- The tones only carry across a classroom — not across the internet.
- The key is fresh for every check-in, so recording one is useless later.
- Each phone is locked to one student account (teacher-approved).
- The server decides who heard what; a phone can't just claim "I was there".

## Where the project stands (October 2026)

| Piece | State |
| --- | --- |
| Google sign-in, classes, rooms, rosters | ✅ working |
| One device per student + teacher approval queue | ✅ working |
| "Sound lab" page that tests a phone's speaker and microphone | ✅ working |
| Modern UI for both roles | ✅ done |
| Live phone-to-phone tone test at 1 m | 🔜 next milestone |
| Full check-in flow for a real class | ⏳ after that |

This is a capstone prototype — not yet used for real attendance.

## Learn more

- [Getting started](getting-started.md) — run it yourself.
- [How it works](how-it-works.md) — the parts, in plain words.
