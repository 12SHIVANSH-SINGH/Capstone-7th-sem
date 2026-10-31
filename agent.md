# agent.md: Rules for any AI agent working on this project

Read this file, then `plan.md`, then `progress.md`, in that order, **before doing anything else in every session**. Do not rely on memory of earlier sessions; they may not exist. For the architecture, open [`docs/diagrams/`](docs/diagrams/) after those three files.

## Project in one paragraph

A web app (Chrome on Android first) that aims to prove students are physically inside a 20 m x 20 m classroom by passing short-lived keys between phones as near-ultrasonic tones, with a server that mints keys, records who heard what, and eventually scores attendance with a teacher review queue. Full detail is in `plan.md`. Do not restate or redesign it here.

## Current phase (2026-10-31)

- **Layer 1 is assumed passed by owner direction (2026-10-29) for production-readiness planning only.** This is **not** a measured pass. The 2026-10-25 sweep decoded 10/10 at 1 m, 9/10 at 2 m, 9/10 at 3 m, **4/10 at 5 m** and **1/10 at 10 m**; the reverse direction (M32 TX → M01 RX) and muted control are still unmeasured. The 2026-10-24 5 m claim was not a true 5 m result. Never describe the physical gate as measured-passed.
- **Layer 2 evidence-only pilot is built through 2.5:** 2.1 session core, 2.2 teacher check-in screen, 2.3 signed proof transport, 2.4a student discovery, 2.4b0 rehearsal enrollment, 2.4b student shell, 2.4c evidence-gated wave advancement + bounded key history, and 2.5 teacher evidence view. 2.3 stores evidence only — it does **not** score or mark attendance. 2.4c is a separate teacher-only route; the proof path does not advance waves. 2.5 is read-only and returns no attendance field. Students never receive the current key or key history. The student cascade (receiving and retransmitting the next key) is **not built**.
- **Deployment hardening is built:** production HSTS, API `no-store`, immutable hashed assets, revalidated shell/deep links, and SIGTERM/SIGINT shutdown that closes the listener then Mongo.
- **Production is `b7fd8b1`** (`main.ccb4f246.js` at https://bio-attend.onrender.com). Local `HEAD` and `origin/main` are `d0824a3`, which contains 2.3 and the session-14 hardening. 2.4a, 2.4b0, 2.4b, 2.4c, 2.5 and the new hardening are uncommitted in the working tree. None of it is deployed.
- **The owner controls every push and deploy.** Never push, tag, merge, or deploy unless the owner explicitly asks in that session. A local build or a green test suite is not permission to publish.
- **Next slice:** 2.6 multi-wave rehearsal with real Google accounts and physical phones (10–20 phones, 5–6 minutes), measuring wave timing and range. The proposed order is in `plan.md` section 8.
- **Still blocked:** scoring, the ID round, attendance decisions, and the "lowest wave heard"/student-cascade rule. Physical 5 m/10 m range remains the top risk.

## Core working rule: small slices, one session at a time

1. Build **one small slice** per session, as listed in `progress.md`. A slice should be something that can be built and tested in a single sitting.
2. Test the slice before calling it done (see "Testing" below).
3. Start the **next** slice only if the current slice passed its test. If it failed, fix it or stop and report; do not stack new work on an unverified base.
4. If a slice turns out too big, split it into smaller slices in `progress.md` before continuing.
5. Never build ahead of the current layer's gate. Layer N+1 work does not start until Layer N's gate in `plan.md` has passed and the owner has said so.

The owner may explicitly allow a band-independent Layer 2 slice to proceed while Layer 1 measurements are pending. That exception does **not** unlock scoring or the ID round.

## Session start checklist

- [ ] Read `agent.md`, `plan.md`, `progress.md`.
- [ ] Open the relevant diagram in `docs/diagrams/` before changing architecture or flow.
- [ ] Look at the actual files in the project. If `progress.md` and the real code disagree, trust the code, then correct `progress.md` and tell the owner.
- [ ] State the one slice you will do this session and its pass/fail test, before writing code.
- [ ] If anything is unclear or two readings are possible, name it and ask. Do not pick silently.

## Session end checklist

- [ ] Run the slice's test and record the real result (pass, fail, or not tested, and why).
- [ ] Update `progress.md`: slice status, what changed, files touched, test result, next slice, blockers.
- [ ] If a decision changed, update `plan.md` and say so.
- [ ] If a component, endpoint, gate, or flow changed, update the matching file in `docs/diagrams/` and re-render its PlantUML source.
- [ ] Keep `README.md`, `docs/README.md`, `resume-prompt.md` and the other docs consistent with the current counts and production state.
- [ ] Give the owner a short summary and an updated resume prompt if the "next slice" changed.

## Coding principles (the owner's preferences)

- **Think before coding:** state assumptions, surface trade-offs, push back if a simpler approach exists.
- **Simplicity first:** minimum code that solves the slice. No speculative features, no configurability nobody asked for, no abstractions for single-use code.
- **Surgical changes:** touch only what the slice needs. Match existing style. Do not refactor or "improve" unrelated code. If you spot unrelated problems, mention them instead of fixing them. Remove only the leftovers your own change created.
- **Goal-driven:** every slice has a verifiable pass/fail criterion written down first. Loop until it is verified.
- **Evidence over claims:** "built" means the code exists; "tested" means a named test or measurement passed; "deployed" means the owner published it and it was verified live. Never blur those three.

## Testing

- Prefer tests that need no hardware first: encode and decode synthetic audio buffers in Node, including added noise and echo, before trying real phones.
- Then real-device tests, in small steps: one tone, then one frame, then distance (1 m, 5 m, 10 m).
- Real-device results (phone model, Android version, Chrome version, distance, frames sent, frames decoded, band used) go in `progress.md`. Do not claim a physical result you did not measure.
- Never report "works" for something that was only reasoned about.

Current local gate (all seven must pass before asking the owner to deploy):

```bash
cd attendance-backend && npm test                  # 151/151
cd attendance-backend && npm test -- --test-isolation=none   # 151/151
cd attendance-frontend && npm run test:proof       # 15/15
cd attendance-frontend && npm run test:acoustic    # 51/51
cd attendance-frontend && npm run test:checkin     # 7/7
cd attendance-frontend && npm run test:studentcheckin # 9/9
cd attendance-frontend && npm run test:auth        # 2/2
```

Production build (same API path as the deployed site):

```bash
cd attendance-frontend
CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=690196150991-39rsb4sffjvfl66jt22unp0uulhfgu5m.apps.googleusercontent.com \
  REACT_APP_GOOGLE_HOSTED_DOMAIN= \
  npm run build
```

For the proof endpoint, also run the real HTTP smoke recorded in `progress.md` (guards, accept, retry, wrong key/wave, cross-student replay, stored evidence, expiry, close, race, rate limit, indexes). The 2.4a discovery route has its own real Mongo/HTTP smoke in `progress.md` (401, 403, own-session filtering, no key, `no-store`). The 2.4b shell has a recorded browser fake-audio smoke (one proof, idempotent retry, expired/no-session/consent/device-review states). The 2.4c/2.5 teacher flow has a recorded headless-Chrome smoke (advance wave, key change, key-free history, live and closed evidence, no attendance field). A real Google sign-in and physical-phone multi-wave rehearsal are still pending. A pure unit test is not enough for either route.

## Architecture and code map

- `attendance-frontend/` — React SPA: Home, Login, dashboards, class management, sound lab, TX/RX link, proof transport helpers and the `/student/check-in` shell (consent, mic capture, evidence card).
- `attendance-backend/` — Express API: Google sign-in, roster/class management, device binding, check-in sessions, proof transport, startup index readiness, CSRF origin guard.
- `docs/diagrams/` — PlantUML source: `system-components.puml`, `check-in-flow.puml`, `proof-transport.puml`.
- `plan.md` — what and why. `progress.md` — current status and measurements. `resume-prompt.md` — how to restart a session.

## Hard boundaries for the current phase

- **2.3 is evidence-only.** Do not add an attendance boolean, score, `present` flag, wave advancement, review decision, or ID round to the proof path. The response must keep saying `attendanceDecided: false`. Wave advancement belongs only to the separate teacher-only `POST /check-in-sessions/:id/advance` route; it must stay evidence-gated.
- **Keys and key history stay server-side.** Students receive only the current wave and its expiry. The teacher view returns the current key but a key-free `waveHistory`. The evidence view returns no key, signature, protocol version or device fingerprint. Never widen these responses.
- **The proof endpoint stays student-only and roster-bound.** It accepts only an enrolled, active student with an approved device binding. A pending device change blocks proofs.
- **The device signature is bound to session, wave, key and student.** Do not shorten, reorder or version-drift the canonical message without updating both client and server and the cross-package test.
- **One proof per student per wave.** The unique index is the real guard; the find-then-create path is only an optimization. Never remove the index or the `11000` race handling.
- **Proof evidence expires after one day** through the TTL index. The signature and protocol version are stored but never returned in a response.
- **Startup order is `connect → every model init() → listen`.** If an index cannot build, the service must exit rather than serve traffic without its constraints.
- **Unsafe cross-origin requests are rejected.** The origin guard runs before routes. Split hosting must list the exact frontend origin in `CLIENT_URLS`; single-origin hosting works automatically.
- **Logout is POST-only.** Do not add a GET mutation back.
- **The teacher's phone stays at the front; student phones are 1–10 m away.** Use **TX** and **RX** terminology in reports and diagrams.
- **Test accounts are env-gated and non-college.** `TEACHER_EMAILS` and real rosters are college-only (`@nitjsr.ac.in`). For non-production (development/test) rehearsals only, `ALLOW_TEST_ROSTER_EMAILS=true` admits exact `TEST_STUDENT_EMAILS` addresses to a roster; production startup refuses the flag. Dev personas never join a roster.
- **No room hardware.** The teacher's ordinary phone starts the process and is never passed around.
- **Mic and audio need a user tap and HTTPS.** Disable echoCancellation, noiseSuppression and autoGainControl; log what the browser actually applied. Refuse below 44.1 kHz.
- **The server mints keys.** Phones never invent keys.
- **The ID round is still required.** A decoded key is data and can be forwarded. Transport must never claim that a stored proof proves physical presence.

## Things not to do

- Do not push, deploy, or change production configuration without an explicit owner request.
- Do not invent project state. If you cannot see it, say so.
- Do not skip reading the three core files because the task looks small.
- Do not mark a slice done without a recorded test result.
- Do not start the mobile app or later layers early.
- Do not change the numbers in `plan.md` (tones, symbol length, thresholds) without a measurement that justifies it; record the measurement in `progress.md`.
- Do not store more personal data than `plan.md` allows.
- Do not describe the proof transport as attendance, scoring, or proof of physical presence.

## Reporting style

Short and plain. Say what was done, what was tested, what the result was, and what comes next. Flag assumptions and anything you could not verify.
