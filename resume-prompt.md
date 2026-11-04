# Resume prompt

Paste everything between the lines into a new session. Keep `agent.md`, `plan.md`,
`progress.md`, `docs/routes.md` and `docs/diagrams/` in the project folder.

---

I am continuing **Bio Attend** (Acoustic Presence Check-in): a web app that produces
evidence students were physically inside a 20 m × 20 m classroom by passing short-lived keys
between phones as near-ultrasonic tones. The teacher's phone stays at the front; student
phones are **1–10 m** away. Use **TX/RX** terminology. A **teacher confirms attendance** from
the evidence; a decoded tone is not an automatic verdict.

Before doing anything:

1. Read `agent.md`, then `plan.md`, then `progress.md`. Follow the rules in `agent.md`.
2. Open `docs/routes.md` and the relevant PlantUML diagram in `docs/diagrams/`
   (`system-components.puml`, `check-in-flow.puml`, `proof-transport.puml`).
3. Inspect the actual project files. If `progress.md` disagrees with the code, trust the
   code, correct `progress.md`, and tell me.
4. Tell me in a few lines: the current layer, the single slice you will work on, and its
   pass/fail test.

Current state (2026-11-04, session 21; details in `progress.md`):

- **Layer 1 is assumed passed by owner direction (2026-10-29) for build planning only. This
  is not a measurement.** The 2026-10-25 sweep recorded **1 m 10/10, 2 m 9/10, 3 m 9/10,
  5 m 4/10, 10 m 1/10** (33/50, 66%). Reverse direction and muted control are unmeasured.
  The 2026-10-24 5 m result is not a valid 5 m measurement. Never call the physical gate
  measured-passed.
- **The product is built:** teacher-confirmed attendance registers, 24-hour student queries,
  analytics, PDF/Excel exports, session history, notifications, timetable, profile/help,
  PWA/dark theme, and a production-capable super-admin console with audit, settings,
  impersonation and development-only demo data.
- **Acoustic proof remains evidence-only:** keys stay server-side, proofs are signed by the
  bound P-256 key, one proof per student/wave, 1-day TTL, wave advancement is teacher-only
  and evidence-gated. The student cascade, automatic scoring and the ID round are **not
  built**.
- **Super-admin:** exact-match `SUPER_ADMIN_EMAILS` environment grant. For this project:
  `12shivanshsingha@gmail.com`; admin sessions default to 12 hours. It must not overlap
  `TEACHER_EMAILS` or a `TEST_*` list. Demo routes return 404 in production.
- **Local gates:** backend **160/160** under `npm test` and `--test-isolation=none`;
  frontend **84/84** (proof 15, acoustic 51, check-in 7, student check-in 9, auth 2); the
  clean `CI=true` same-origin production build compiles successfully.
- **Browser smokes:** dev **65/65**, production-mode Gmail-admin **13/13**, mobile/dark
  **27/27**, production PWA/offline **16/16**. These use a temporary Playwright setup, not
  repo npm commands.
- **Production:** Render runs **`b7fd8b1`** at https://bio-attend.onrender.com and does not
  include this product layer. Local `HEAD` and `origin/main` are **`35ad5a2`**; the current
  work is **uncommitted**. The owner reviews, commits, pushes and deploys manually.
- **Next slice:** **2.6 multi-wave rehearsal** with real Google accounts and physical phones
  (10–20 phones, 5–6 minutes), measuring waves, timing and range. Physical 5 m/10 m range
  diagnosis and reverse/muted-control runs remain the top risk. The owner must also set
  Render `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com`,
  `SUPER_ADMIN_SESSION_HOURS=12`, and leave `REACT_APP_GOOGLE_HOSTED_DOMAIN` empty/unset.

Rules for this session:

- Build only one small slice, test it, and record the real result in `progress.md`.
- Start the next slice only if this one passed. If it failed, fix it or stop and report.
- Do not add automatic scoring, the ID round, the student cascade, or any exposure of keys
  or key history to students. Attendance is teacher-confirmed and audited.
- **Do not push, tag, merge or deploy.** The owner controls all publication.
- Do not invent state you cannot see.
- If a route, component, endpoint or gate changes, update `docs/routes.md`, the matching
  `docs/diagrams/*.puml` and every affected Markdown file in the same session.
- At the end, update `progress.md` and give me an updated resume prompt if the next slice
  changed.

Context from `plan.md`: Android + Chrome first, phones from 2020 or later; no room hardware;
teacher's phone only starts the process; server mints keys; location is optional evidence;
college Google accounts plus a class roster for identity; teacher owns the register; queries
are open for 24 hours after the session closes. Test accounts are env-gated and non-college;
`TEACHER_EMAILS` and real rosters are college-only, with the non-production-only
`ALLOW_TEST_ROSTER_EMAILS` rehearsal exception for exact test students.

---

Short version if the files are unavailable:

> Read `agent.md`, `plan.md`, `progress.md` and `docs/routes.md` first. Work on exactly one
> small slice, test it, record the real result, and move on only if it passed. The product
> includes teacher-confirmed attendance, queries, analytics, exports and a production
> super-admin console. Acoustic proof is evidence-only. Backend **160/160**, frontend
> **84/84**. The next slice is a real Google/phone multi-wave rehearsal (2.6); physical
> 5 m/10 m range work and reverse/muted control remain open. Layer 1 is an owner assumption
> for build planning only, not a measured pass. Never push, tag, merge or deploy.
