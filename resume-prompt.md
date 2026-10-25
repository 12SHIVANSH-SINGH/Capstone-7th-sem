# Resume prompt

Paste everything between the lines into a new session. Keep `agent.md`, `plan.md`, `progress.md` and `docs/diagrams/` in the project folder.

---

I am continuing a project called **Bio Attend** (Acoustic Presence Check-in): a web app that aims to prove students are physically inside a 20 m x 20 m classroom by passing short-lived keys between phones as near-ultrasonic tones, with a server that mints keys and records who heard what. Teacher phone stays at the front; student phones are **1–10 m** away. Use **TX/RX** terminology.

Before doing anything:
1. Read `agent.md`, then `plan.md`, then `progress.md` in the project folder. Follow the rules in `agent.md`.
2. Open the relevant PlantUML diagram in `docs/diagrams/` (`system-components.puml`, `check-in-flow.puml`, `proof-transport.puml`).
3. Look at the actual project files. If `progress.md` disagrees with the code, trust the code, then correct `progress.md` and tell me.
4. Tell me in a few lines: the current layer, the single slice you will work on this session, and its pass/fail test.

Current state (2026-10-25, details in `progress.md`):
- **Layer 1 gate is still open.** The forward acoustic link passed at **1 m (10/10)** and **5 m (20/20)** on 2026-10-24. The **reverse direction (M32 TX → M01 RX)**, a **muted control** and a **10 m** run are still pending. The M32 speaker measured only **0.7 dB at 19.5 kHz**, so the reverse run is the deciding physical risk.
- **Layer 2.1** (check-in session core) and **Layer 2.2** (teacher check-in screen) are built and tested.
- **Layer 2.3** proof transport is built and tested **locally but uncommitted**. Endpoint: `POST /api/v1/check-in-sessions/:sessionId/proofs`, student-only, signed body `{wave, key, signature}`. It records signed session/wave/key evidence from an enrolled student with an approved P-256 device binding; retries are idempotent per student/wave; pending device changes are blocked; submissions are capped at 60/min per student; evidence has a 1-day TTL; responses are `201` new, `200` exact retry, with `attendanceDecided: false`. It does **not** score, mark attendance, run the ID round or advance waves.
- **Security/startup hardening:** startup waits for Mongo and every model index before listening and fails closed; a CSRF origin guard blocks unsafe cross-origin requests; logout is POST-only; malformed JSON returns 400; the expiry-vs-key oracle is removed; proof responses never return the signature, protocol version, key, email or fingerprint; UI copy says evidence was recorded, not that attendance was marked.
- **Last local gates:** backend **124/124** under `npm test` and `--test-isolation=none`; frontend proof **15/15**, acoustic **51/51**, check-in **7/7**, auth **2/2**; clean production build `main.c295a96e.js` at **127,111 B gzip**, CSS **8,438 B gzip**. Real local HTTP smoke passed **12 checkpoints**. All three PlantUML diagrams validate and render.
- **Production is the owner's `b7fd8b1` deploy** at https://bio-attend.onrender.com, serving `main.ccb4f246.js`; health and `/login` return 200. **None of the 2.3 work is pushed or deployed.** The owner reviews, commits, pushes and deploys manually.
- **Next code slice:** the student check-in shell on top of 2.3 — capture a decoded wave in the browser, sign it with the bound device key, submit it, and show the recorded evidence. Before that, decide an env-gated rehearsal-enrollment path, because Gmail `TEST_STUDENT_EMAILS` accounts and dev personas cannot join college-only rosters.
- **Still blocked:** scoring, the ID round, wave advancement/key history, and the plan's "lowest wave heard" rule. Only the current wave is accepted today. Scoring and the ID round wait for the Layer 1 gate decision.

Rules for this session:
- Build only one small slice, test it, and record the real result in `progress.md`.
- Start the next slice only if this one passed. If it failed, fix it or stop and report.
- Do not build ahead of the current layer's gate. Do not add scoring, attendance decisions, the ID round or wave advancement to the proof transport.
- **Do not push, tag, merge or deploy.** The owner controls all pushes and deployments.
- Do not invent state you cannot see. Some code was built before these notes existed, so check it and mark those slices "built, needs test" until they are tested.
- If architecture, a component, an endpoint or a gate changes, update the matching `docs/diagrams/*.puml` and re-render it.
- At the end, update `progress.md` (slice status, files touched, test result, next slice) and all affected Markdown files, then give me an updated resume prompt if the next slice changed.

Context you can rely on from `plan.md`: Android + Chrome first, phones from 2020 or later; no room hardware; teacher's phone only starts the process; server mints keys; GPS/IP/device data are secondary and expire after 1 day; college Google accounts (`@nitjsr.ac.in`) plus a class roster for identity; teacher overrides only the review queue, same day. Test accounts are env-gated and non-college; `TEACHER_EMAILS` and rosters are college-only.

---

Short version, if the files are not available in that session:

> Read `agent.md`, `plan.md` and `progress.md` first. Work on exactly one small slice, test it, record the real result in `progress.md`, and move on only if it passed. The current code slice is the student check-in shell on top of the 2.3 evidence-only transport; the Layer 1 gate (reverse, muted control, 10 m) is still open. Never push or deploy — the owner does that manually.
