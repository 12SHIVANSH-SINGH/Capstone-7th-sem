# agent.md: Rules for any AI agent working on this project

Read this file, then `plan.md`, then `progress.md`, in that order, **before doing anything else in every session**. Do not rely on memory of earlier sessions; they may not exist.

## Project in one paragraph

A web app (Chrome on Android first) that proves students are physically inside a 20 m x 20 m classroom by passing short-lived keys between phones as near-ultrasonic tones, with a server that mints keys, verifies who heard what, and keeps a teacher review queue. Full detail is in `plan.md`. Do not restate or redesign it here.

## Core working rule: small slices, one session at a time

1. Build **one small slice** per session, as listed in `progress.md`. A slice should be something that can be built and tested in a single sitting.
2. Test the slice before calling it done (see "Testing" below).
3. Start the **next** slice only if the current slice passed its test. If it failed, fix or stop and report; do not stack new work on an unverified base.
4. If a slice turns out too big, split it into smaller slices in `progress.md` before continuing.
5. Never build ahead of the current layer's gate. Layer N+1 work does not start until Layer N's gate in `plan.md` has passed and the owner has said so.

## Session start checklist

- [ ] Read `agent.md`, `plan.md`, `progress.md`.
- [ ] Look at the actual files in the project. If `progress.md` and the real code disagree, trust the code, then correct `progress.md` and tell the owner.
- [ ] State the one slice you will do this session and its pass/fail test, before writing code.
- [ ] If anything is unclear or two readings are possible, name it and ask. Do not pick silently.

## Session end checklist

- [ ] Run the slice's test and record the real result (pass, fail, or not tested, and why).
- [ ] Update `progress.md`: slice status, what changed, files touched, test result, next slice, blockers.
- [ ] If a decision changed, update `plan.md` and say so.
- [ ] Give the owner a short summary and an updated resume prompt if the "next slice" changed.

## Coding principles (the owner's preferences)

- **Think before coding:** state assumptions, surface trade-offs, push back if a simpler approach exists.
- **Simplicity first:** minimum code that solves the slice. No speculative features, no configurability nobody asked for, no abstractions for single-use code.
- **Surgical changes:** touch only what the slice needs. Match existing style. Do not refactor or "improve" unrelated code. If you spot unrelated problems, mention them instead of fixing them. Remove only the leftovers your own change created.
- **Goal-driven:** every slice has a verifiable pass/fail criterion written down first. Loop until it is verified.

## Testing

- Prefer tests that need no hardware first: encode and decode synthetic audio buffers in Node, including added noise and echo, before trying real phones.
- Then real-device tests, in small steps: one tone, then one frame, then distance (1 m, 6 m, far corner).
- Real-device results (phone model, Android version, Chrome version, distance, frames sent, frames decoded, band used) go in `progress.md`. Do not claim a physical result you did not measure.
- Never report "works" for something that was only reasoned about.

## Project-specific constraints to respect

- Target for iteration 1: Android, Chrome, phones from 2020 or later. Do not add iOS or other-browser work yet.
- No room hardware. The teacher's phone only starts the process.
- Mic and audio need a user tap (Join button) and HTTPS. Disable echoCancellation, noiseSuppression and autoGainControl; log what the browser actually applied.
- Refuse to run below 44.1 kHz sample rate.
- The server mints keys. Phones never invent keys.
- GPS, IP and device data are a secondary check only and expire after 1 day. Show the student notice before collecting anything.
- The teacher can override only cases in the review queue, and only on the same day.
- A student using another student's phone is out of scope.

## Things not to do

- Do not invent project state. If you cannot see it, say so.
- Do not skip reading the three files because the task looks small.
- Do not mark a slice done without a recorded test result.
- Do not start the mobile app or later layers early.
- Do not change the numbers in `plan.md` (tones, symbol length, thresholds) without a measurement that justifies it; record the measurement in `progress.md`.
- Do not store more personal data than `plan.md` allows.

## Reporting style

Short and plain. Say what was done, what was tested, what the result was, and what comes next. Flag assumptions and anything you could not verify.
