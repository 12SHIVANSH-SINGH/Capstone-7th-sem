# Resume prompt

Paste everything between the lines into a new session. Keep `agent.md`, `plan.md`, `progress.md` and `docs/diagrams/` in the project folder.

---

I am continuing a project called **Bio Attend** (Acoustic Presence Check-in): a web app that aims to prove students are physically inside a 20 m x 20 m classroom by passing short-lived keys between phones as near-ultrasonic tones, with a server that mints keys and records who heard what. Teacher phone stays at the front; student phones are **1–10 m** away. Use **TX/RX** terminology.

Before doing anything:
1. Read `agent.md`, then `plan.md`, then `progress.md` in the project folder. Follow the rules in `agent.md`.
2. Open the relevant PlantUML diagram in `docs/diagrams/` (`system-components.puml`, `check-in-flow.puml`, `proof-transport.puml`).
3. Look at the actual project files. If `progress.md` disagrees with the code, trust the code, then correct `progress.md` and tell me.
4. Tell me in a few lines: the current layer, the single slice you will work on this session, and its pass/fail test.

Current state (2026-10-31, session 19; details in `progress.md`):
- **Layer 1 is assumed passed by owner direction (2026-10-29) for build planning only. This is not a measurement.** The final 2026-10-25 distance sweep recorded **1 m 10/10, 2 m 9/10, 3 m 9/10, 5 m 4/10, 10 m 1/10** (33/50, 66%). The **reverse direction (M32 TX → M01 RX)** and a **muted control** are still unmeasured. Never describe the physical gate as measured-passed. The 2026-10-24 5 m result is not a valid 5 m measurement.
- **The build is an evidence-only Layer 2 pilot.** It records signed evidence, advances waves after evidence and shows the teacher a read-only evidence list. It does **not** decide attendance, score, run the ID round, or expose wave keys/key history to students.
- **Built and tested:** 2.1 session core, 2.2 teacher check-in screen, 2.3 signed proof transport, 2.4a student discovery, 2.4b0 rehearsal enrollment, 2.4b student check-in shell, 2.4c wave advancement + bounded key history, 2.5 teacher evidence view, plus deployment hardening.
- **2.3 endpoint:** `POST /api/v1/check-in-sessions/:sessionId/proofs`, student-only, signed body `{wave, key, signature}`. It records signed session/wave/key evidence from an enrolled student with an approved P-256 device binding; retries are idempotent per student/wave; pending device changes are blocked; submissions are capped at 60/min per student; evidence has a 1-day TTL; `201` new, `200` exact retry, `attendanceDecided: false`. Committed in `d0824a3`.
- **2.4a endpoint:** `GET /api/v1/student/check-in-sessions/active` returns live sessions for the student's own active enrollments, with class/room metadata and **no key**. Six route tests cover 401/403, empty enrollment, ownership filtering, no-key response, `no-store`, and malformed class IDs.
- **2.4b0 rehearsal enrollment:** the non-production-only `ALLOW_TEST_ROSTER_EMAILS` flag admits exact `TEST_STUDENT_EMAILS` addresses to a roster; every other non-college address is rejected. Production startup refuses the flag, and the flag requires at least one test student. Dev personas still cannot join a roster.
- **2.4b student shell:** `/student/check-in` polls discovery every 10 s, requires the retention/consent checkbox before Join, captures and decodes the current wave locally, signs the canonical session/wave/key/student message with the bound P-256 key, submits evidence and shows a recorded-evidence card. It never displays the key or decoded value; raw audio stays on the phone. Expired, closed, consent and device-review states are explicit. Frontend helper tests **9/9**; fake-audio browser smoke recorded exactly one proof and handled retry/expiry/closed/device-review.
- **2.4c wave advancement + bounded key history:** `POST /api/v1/check-in-sessions/:sessionId/advance` is teacher-only. It refuses a closed session or a current wave with no accepted proof, matches `{_id, teacher, status, wave}` atomically (concurrent loser gets 409), archives the old key in a **20-entry** history, mints a distinct fresh **two-minute** key and returns a **key-free** `waveHistory`. The teacher screen has an **Advance wave** confirmation; the student shell stops listening if the wave changes mid-capture and tells the student to tap Join for the new key.
- **2.5 teacher evidence view:** `GET /api/v1/check-in-sessions/:sessionId/proofs` is teacher-only and read-only. It selects only `studentEmail wave createdAt`, returns `attendanceDecided: false`, total/per-wave counts and email/wave/time rows. It never returns a key, signature, protocol version or device fingerprint. The teacher screen auto-loads the live session's evidence, polls every 10 s and has an **Evidence** action for closed history.
- **Security/startup hardening:** startup waits for Mongo and every model index before listening and fails closed; a CSRF origin guard blocks unsafe cross-origin requests; logout is POST-only; malformed JSON returns 400. Production now sends HSTS; all API responses are `Cache-Control: no-store`; hashed `static/` assets are immutable; `index.html` and SPA deep links are `no-cache`. SIGTERM/SIGINT close the listener then Mongo and exit 0.
- **Last local gates (2026-10-31):** backend **151/151** under `npm test` and `--test-isolation=none`; frontend proof **15/15**, acoustic **51/51**, check-in **7/7**, student check-in **9/9**, auth **2/2**; clean same-origin build `CI=true REACT_APP_API_URL=/api/v1` → `main.270dddc4.js` raw 441,858 B / **134.13 kB gzip**, CSS `main.36253f1e.css` raw 55,178 B / **9.35 kB gzip**; `git diff --check` clean. PlantUML 1.2024.3 `-checkonly` + SVG/PNG renders passed.
- **Smokes:** production-mode local run passed startup order, health, HSTS/API `no-store`, shell/deep-link `no-cache`, immutable hashed asset, dev-route/unknown-API 404, rehearsal-flag refusal and SIGTERM exit 0. Headless-Chrome teacher smoke advanced wave 0 → 1 (key changed, one key-free history entry), showed live evidence and closed-session evidence, with no attendance field.
- **Production is the owner's `b7fd8b1` deploy** at https://bio-attend.onrender.com, serving `main.ccb4f246.js`; health and `/login` return 200. Local `HEAD` and `origin/main` are `d0824a3` (2.3 + session-14 hardening); **2.4a, 2.4b0, 2.4b, 2.4c, 2.5 and the new hardening are uncommitted in the working tree, and none of it is deployed.** The owner reviews, commits, pushes and deploys manually.
- **Next code/rehearsal slice:** **2.6 multi-wave rehearsal** with real Google accounts and physical phones (10–20 phones, 5–6 minutes), measuring waves, timing and range. The physical 5 m/10 m diagnosis and reverse/muted control remain the top risk. **Not built:** the student cascade that returns/retransmits the next key, scoring, attendance decisions and the ID round.

Rules for this session:
- Build only one small slice, test it, and record the real result in `progress.md`.
- Start the next slice only if this one passed. If it failed, fix it or stop and report.
- Do not add scoring, attendance decisions, the ID round, or any exposure of the current key or key history to students. Wave advancement is built, but it is teacher-only and evidence-gated.
- **Do not push, tag, merge or deploy.** The owner controls all pushes and deployments.
- Do not invent state you cannot see. Some code was built before these notes existed, so check it and mark those slices "built, needs test" until they are tested.
- If architecture, a component, an endpoint or a gate changes, update the matching `docs/diagrams/*.puml` and re-render it.
- At the end, update `progress.md` (slice status, files touched, test result, next slice) and all affected Markdown files, then give me an updated resume prompt if the next slice changed.

Context you can rely on from `plan.md`: Android + Chrome first, phones from 2020 or later; no room hardware; teacher's phone only starts the process; server mints keys; GPS/IP/device data are secondary and expire after 1 day; college Google accounts (`@nitjsr.ac.in`) plus a class roster for identity; teacher overrides only the review queue, same day. Test accounts are env-gated and non-college; `TEACHER_EMAILS` and real rosters are college-only, with the non-production-only `ALLOW_TEST_ROSTER_EMAILS` rehearsal exception for exact test students.

---

Short version, if the files are not available in that session:

> Read `agent.md`, `plan.md` and `progress.md` first. Work on exactly one small slice, test it, record the real result in `progress.md`, and move on only if it passed. The evidence-only Layer 2 pilot is built through 2.5: signed proofs, student shell, evidence-gated wave advancement with bounded key history, and a read-only teacher evidence view. Backend **151/151** both modes; all frontend suites pass. The next slice is a real Google/phone multi-wave rehearsal (2.6). Layer 1 is an owner assumption for build planning only, not a measured pass; 5 m/10 m still fail and reverse plus muted control are unmeasured. Scoring, attendance decisions, the ID round and the student cascade are not built. Never push, tag, merge or deploy — the owner does that manually.
