# Resume prompt

Paste everything between the lines into a new session. Keep `agent.md`, `plan.md` and `progress.md` in the project folder.

---

I am continuing a project called Acoustic Presence Check-in: a web app that proves students are physically inside a 20 m x 20 m classroom by passing short-lived keys between phones as near-ultrasonic tones, with a server that verifies who heard what.

Before doing anything:
1. Read `agent.md`, then `plan.md`, then `progress.md` in the project folder. Follow the rules in `agent.md`.
2. Look at the actual project files. If `progress.md` disagrees with the code, trust the code, then correct `progress.md` and tell me.
3. Tell me in a few lines: the current layer, the single slice you will work on this session, and its pass/fail test. Wait for my go-ahead if anything is unclear.

Rules for this session:
- Build only that one small slice, test it, and record the real result in `progress.md`.
- Start the next slice only if this one passed. If it failed, fix it or stop and report.
- Do not build ahead of the current layer's gate.
- Do not invent state you cannot see. Some code was built before these notes existed, so check it and mark those slices "built, needs test" until they are tested.
- At the end, update `progress.md` (slice status, files touched, test result, next slice) and give me an updated resume prompt if the next slice changed.

Current state (2026-10-17, details in `progress.md`): Layer 1. Slices 1.6+1.7 (FSK frame codec) passed synthetic tests; 1.1 passed via a cloudflared quick tunnel on a real phone, and the first lab run on one Android phone is recorded (48 kHz, margins 46–53 dB at 15.5–18.5 kHz, but 19.5 kHz was not detected) — the second phone is still pending. Next slice proposed: 1.8 (live two-phone send/receive at 1 m). Backend runs with plain `npm start` on any Node ≥22 against local Mongo (`~/data/db-attendance-dev`). Teacher sign-in (`2023ugcs059@nitjsr.ac.in`, `TEACHER_EMAILS`) is verified in the browser; the two test students (`testforshivansh059@gmail.com` + `12shivanshsingha@gmail.com`, `TEST_STUDENT_EMAILS`, roster-exempt) still need one sign-in each on localhost. Test phones: Samsung M01 and Samsung M32.

Context you can rely on from `plan.md`: Android + Chrome first, phones from 2020 or later; no room hardware; teacher's phone only starts the process; server mints keys; GPS, IP and device ID are a secondary check kept for 1 day; college Google accounts (nitjsr.ac.in) plus a class roster for identity; teacher overrides only the review queue, same day.

---

Short version, if the files are not available in that session:

> Read agent.md, plan.md and progress.md first. Work on exactly one small slice, test it, record the real result in progress.md, and move on only if it passed. Check existing code before trusting progress.md.
