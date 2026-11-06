# Plan: Acoustic Presence Check-in

Source of truth for **what** we are building and **why**. Companion files: `agent.md`
(how to work), `progress.md` (where we are), `resume-prompt.md` (how to restart a session).

## 1. Goal

Mark attendance for 70–120 students by producing evidence that each phone was physically
inside one 20 m × 20 m classroom, using only student smartphones, a web app and a server.

- The room is 20 **metres** (not feet). 120 students in 400 m² is realistic, and range is a
  real problem, so the echo cascade is justified.
- No room hardware: no installed speaker, screen or beacon.
- The teacher's ordinary phone speaker plays the first signal and stays at the front. It is
  never passed around.
- Cheating is expected: fake GPS, forwarded codes, a friend inside relaying to a friend
  outside.
- A student using another student's phone or account is **out of scope for now**.
- Build is layered: web app first, mobile app only if the web pilot succeeds.

## 2. Core idea

Sound stays inside a room, so hearing a fresh signal is evidence of presence. Phones pass
the signal on as near-inaudible tones, and the server records signed evidence. A **teacher
confirms attendance** from that evidence; a decoded tone is never an automatic verdict.

Location (GPS) cannot be the secret: everyone knows where the room is, phone GPS is often
5–10 m off and worse indoors, and a web app cannot prove its reading is real. Location is
optional secondary evidence only.

Three parts:

- **Student credential:** one identity per student, tied to a browser-bound device key.
- **Wave key:** a short-lived key minted by the server per wave (K0, K1, …). The server
  rotates it only after the current wave has accepted evidence. The "master key" is never
  typed; the key chain is the design.
- **Room channel:** sound carries each key from phones to nearby phones. Anyone outside the
  walls does not hear it.

## 3. Decisions

| Topic | Decision | Effect |
| --- | --- | --- |
| Phones and browsers | Android + Chrome first, phones from 2020 or later, any brand. iOS later | iOS is not part of the Layer 1 test |
| Band | Lower band is acceptable and preferred if it works | Layer 1 compares 18–20 kHz with a lower band (e.g. 15–17 kHz) and picks the more reliable one |
| Identity | College Google account (`@nitjsr.ac.in`), one account per student, plus a class roster | The roster decides class membership; batch/branch/roll are derived for display only |
| Device | Browser-created P-256 key bound to the account | First binding and changed devices wait for teacher review; dev/test personas auto-approve |
| Attendance model | **Teacher-confirmed register** | Teacher marks present/absent/excused from evidence, finalises, and every correction is audited |
| Queries | 24-hour window after a session closes | Student can query a missed mark; teacher approves/rejects/reopens with an audit trail; approval counts as present |
| Retention | Roster and attendance results for the term; proof evidence about **1 day** | Proof records expire through a TTL index; location snapshots remain attached to attendance/query records |
| Teacher override | The teacher owns the register; super-admin overrides are audited | No silent changes; every decision has a source and a note |
| Time budget | Class is 50–55 min; teacher starts about minute 40; check-in must finish in 5–6 min | Measure waves and timing in Layer 2 |
| Hosting | One Render service + MongoDB Atlas | Same-origin cookies; free tier may sleep |
| Student notice | Short in-app retention/consent notice before the first check-in | `/student/check-in` requires an explicit checkbox before Join; raw audio stays on the phone |
| Teacher phone | Ordinary speaker at the front, 1–10 m from student phones | No room hardware; moving closer is a fallback, not the normal flow |
| Super-admin | Exact-match `SUPER_ADMIN_EMAILS` environment grant | Works in production; no UI role toggle; 12-hour sessions by default; demo controls are non-production only |

### Assumptions (change if wrong)

- Roster and final attendance results are kept for the term. Proof evidence stores student
  email, device fingerprint, session/wave/key, signature and protocol version, and expires
  after about 24 hours; it stores no GPS or IP.
- Device-binding records currently persist indefinitely. Whether they should follow the
  1-day evidence retention is an open question.
- The same browser profile currently shares one device key across accounts; treat "device"
  as the browser profile until per-student key isolation is designed.
- Layer 1's 95% frame-decode target is a proposal.
- The teacher's phone stays at the front, 1–10 m from the nearest student phones.

## 4. Roster

The roster is the list of college emails allowed to check in to a class (one row per
student, typically 70–120). It decides who can submit evidence and who counts as absent.

- Source: CSV upload, a text-based PDF extraction preview, or a paste-the-list box.
- One required column: `email`. Name and section are optional.
- The server lowercases, removes duplicates, rejects non-college addresses and flags
  malformed roll numbers for teacher review. PDF extraction only fills the editable text
  box; the teacher still runs the normal preview and confirms the save. Scanned PDFs with no
  text layer are rejected until local OCR is built.
- The teacher can add/remove rows later (e.g. a late joiner).
- Non-production rehearsals only: `ALLOW_TEST_ROSTER_EMAILS=true` admits the exact
  `TEST_STUDENT_EMAILS` addresses. Production startup refuses the flag.

## 5. Signal design (starting values, tune in Layer 1)

Frequency-shift keying (FSK) with near-ultrasonic tones.

| Setting | Starting value | Reason |
| --- | --- | --- |
| Tone range | 18.0–19.8 kHz (also test 15–17 kHz) | Mostly inaudible to adults; representable at 44.1/48 kHz |
| Tones | 17, about 110 Hz apart | Wide spacing limits leakage |
| Symbol length | 120 ms | Rides through echo in a hard-walled room |
| Frame | 2 marker + 7 data + 2 check symbols, about 1.3 s | 7 base-15 data symbols ≈ 170 million values |
| Coding | Adjacent tones never repeat | Boundaries come from tone changes, no silent gaps |
| Receiver | AudioWorklet + Goertzel filters | Cheaper than FFT, off the main thread |
| Detection | Tone counts only if ~9 dB above the median of the 17 | Adapts to room noise |
| Capture | Mono; echoCancellation / noiseSuppression / autoGainControl off | Speech filters erase the tones |
| Transmit | One oscillator per symbol with ~6 ms fades | Avoids audible clicks |

Hardware reality:

- Many phone speakers/mics roll off above 17–18 kHz. A per-model sweep measures this.
- A lower band is partly audible to younger students: keep volume low and frames short.
- Refuse to start below 44.1 kHz; log the applied mic settings.
- The tab must stay foregrounded with the screen on (Wake Lock).
- Mic/audio need a user gesture (Join) and HTTPS.
- Android output latency varies by 50–200 ms: schedule with `osc.start(time)`; do not add
  random backoff because identical synchronised signals reinforce each other.

## 6. Cascade logic

The long-term design:

1. Teacher taps Start. Server creates K0 and the teacher's phone plays it repeatedly.
2. A student phone that decodes Kn submits its credential, Kn and a device signature.
3. Server checks Kn is valid, fresh and unused by that student, records the evidence and
   returns K(n+1).
4. The phone plays K(n+1) two or three times, then mutes for the session.
5. Phones in the same wave play the identical signal, so sounds add instead of colliding.
6. The server advances waves only after the current wave has accepted evidence, archives the
   old key in bounded history and mints a fresh two-minute key.
7. The cascade ends when a wave adds no new students or the check-in window closes.

Phone state machine: Listening → Decoding → Server check → Transmitting → Muted. Rejected or
expired keys return to Listening. The server mints keys; phones never invent them.

**Current build:** teacher-driven waves plus evidence. The teacher advances manually after at
least one accepted proof. Students do not receive or retransmit the next key, so the
multi-hop cascade and the "lowest wave heard" join rule are **not built**.

## 7. Anti-cheat: the ID round

A decoded key is data and can be forwarded. The ID round proves each phone was heard by its
neighbours:

1. After the waves finish, the server gives every student a time slot.
2. In its slot a phone sends a short ID signal; in every other slot it listens.
3. Each phone reports which IDs it heard.
4. The server marks a student present only if enough different neighbours heard them.

Slot length is open until Layer 1 shows the shortest reliable frame. Secondary signals
(GPS, same public IP/Wi-Fi, submission time, wave number) never decide alone. Borderline
cases go to the teacher's review queue.

The ID round and automatic scoring are **not built**. The current product uses
teacher-confirmed attendance instead.

## 8. Layers and gates

| Layer | Scope | Gate |
| --- | --- | --- |
| 1 Physical layer | Web app sends and hears tones | Frames decode at 1 m, 5 m and 10 m from the teacher's phone at the front. Proposed target: 95%, on phones students actually use. **Treated as passed by owner assumption on 2026-10-29; not measured-passed.** |
| 2 Cascade | Server keys, waves, Google sign-in, roster | A small rehearsal reaches every phone. Waves needed and time per wave are measured |
| 3 ID round and scoring | Time slots, neighbour reports, review queue | Phones outside the room are rejected; inside phones accepted or queued |
| 4 Class pilot | 70–120 students in the real room | Attendance matches manual roll call; false accepts/rejects counted |
| 5 Mobile app | Native audio, background operation | Decide after Layer 4 |

**Current phase:** the product layer is built, including teacher-confirmed registers,
queries, analytics, exports, notifications, timetable, PWA and a production-capable
super-admin console. Roster PDF text extraction with an editable preview is built, and
timetable PDF text extraction with a read-only preview is built (A2a). Structured timetable
row parsing, local OCR and Gemini extraction are not. It is still **evidence-only for acoustic
proof**: the app does not automatically score attendance or run the ID round. The attendance
decision belongs to the teacher and is audited.

**Next work, in order:**

| Order | Slice | Scope | Pass test |
| --- | --- | --- | --- |
| 1 (physical) | 1.10 range diagnosis | Lower the band and/or tune TX settings; rerun 1 m, 5 m, 10 m, then reverse and muted control | ≥95% decoded at 1 m/5 m/10 m both directions; 0 decodes in the muted control |
| 2 (rehearsal) | 2.6 multi-wave rehearsal | 10–20 phones for 5–6 minutes; measure waves, timing and range | Every phone reaches a wave; timing measured; no false-accept claim without scoring |
| 3 (owner) | Deploy and verify | Configure Render, deploy the current tree, verify real Google sign-in and `/admin` | Health, teacher/student flow, Gmail super-admin, no demo endpoints in production |
| 4 (gated) | 3.x scoring, ID round, review queue | Only after the physical gate is genuinely measured | Layer 3 gate |

## 9. Risks and honest limits

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Phones that cannot play/hear 18+ kHz | Those students fail at the physical layer | Per-model sweep, lower band, teacher fallback |
| 100+ phones in a hard-walled room | Garbled symbols | Identical signals per wave, long symbols, measure |
| Key forwarded by text | Remote student obtains a key | Short lifetime and the future ID round |
| GPS spoofing | Fake location | Location is weak extra evidence only |
| Screen locks/tab backgrounded | Audio pauses | Wake Lock, foreground tab |
| Student outside near an open door | Might hear tones | ID round, strict threshold, teacher review |
| Younger students hearing the signal | Annoyance | Highest working band at low volume, short frames |
| Free hosting sleeps | Check-in fails mid-class | Warm up or use Starter |
| Accomplice physically in the room | Gets through | Out of scope for now |
| iOS | Not covered yet | Later iteration |

## 10. Open items

- Confirm a real student Google sign-in on production; teacher sign-in is verified.
- Confirm Render free-plan behaviour during a live 5–6 minute check-in.
- Diagnose the 5 m/10 m range failure, then run reverse direction and muted control.
- Run the real Google/phone multi-wave rehearsal; the local smokes used a JWT cookie and,
  for the student shell, fake audio.
- Decide whether device bindings follow the same 1-day retention as proof evidence.
- Document the device-recovery boundary: a teacher approves every first or replacement
  device, and a stolen session cookie cannot bind without that decision.
- Add a shared-store rate limiter if the service scales past one instance.
- Keep split-hosting origins in `CLIENT_URLS` if that layout is ever used.

## 11. P1 admin hardening (approved 2026-11-05)

**Status (2026-11-06):** implemented and tested locally. The P1 slice passed at backend
**227/227** in both test modes and frontend **84/84**; after the roster and timetable PDF
text-preview slices the current gate is backend **255/255** and frontend **96/96**. The
production build is green, and a
Chrome virtual-authenticator run passed the full enrollment → 428 → step-up →
settings-save → chain-verify path.

The P0 layer made sessions revocable and device binding teacher-approved. P1 raises the bar
for the production super-admin console without adding a paid service.

| Slice | Design | Limit |
| --- | --- | --- |
| Audit integrity | Each new audit entry stores `seq`, `prevHash` and a SHA-256 `hash` over the canonical entry. `/admin/audit/verify` recomputes the chain and reports the first break. Pre-P1 entries are reported as legacy, not hashed retroactively. | The chain is serialised in-process, which is correct for the current single Render instance. A future multi-instance deployment needs a transaction or distributed lock. |
| Audit IP | Audit entries use Express `req.ip` (trusted one-hop proxy result), never a raw client-supplied `X-Forwarded-For` header. | `trust proxy` must stay at exactly one hop on Render. |
| Exports | Every generated export writes an audit entry, and export routes are rate limited per account and IP. | In-memory limiter; a shared store is needed if the service scales out. |
| Readiness | `/health/ready` returns 503 until Mongoose is connected; the existing `/health` stays a cheap liveness probe. | It does not test Atlas latency or dependent third-party services. |
| JWT rotation | `JWT_SECRET_PREVIOUS` is accepted for verification only, so tokens can outlive one deploy while new tokens use `JWT_SECRET`. | Old tokens are not reissued automatically; the operator removes the previous secret after the normal session lifetime. |
| Admin step-up | A super-admin registers a platform passkey. Destructive actions require a 5-minute, single-purpose cookie minted by a WebAuthn assertion. First enrollment is trust-on-first-use; adding another passkey requires step-up. | A stolen super-admin session can enroll one attacker passkey before the owner notices, exactly as a stolen password could. Google 2FA and audit review remain the outer controls. |

WebAuthn origins are configured server-side (`WEBAUTHN_ORIGINS`, falling back to
`CLIENT_URL(S)`, `RENDER_EXTERNAL_URL`, then local development origins). The expected origin
is never derived from a request header. Production must run HTTPS.

## 12. Document ingestion (started 2026-11-05)

The import path is **extract → preview → teacher confirms**. Extraction never writes a
roster, creates a class or marks attendance. The teacher reviews the extracted content,
runs the existing validation preview and confirms the save.

| Slice | Status | Design | Limit |
| --- | --- | --- | --- |
| A1 Roster PDF text extraction | **Built** | `POST /classes/:classId/roster/pdf/preview` accepts one PDF from the owning teacher. PDF.js reads the embedded text layer, reconstructs visual lines and returns editable text plus page/line/email counts. The frontend fills the roster textarea; the existing preview and explicit save remain unchanged. | Text-layer PDFs only. 10 MB, 20 pages and 200,000 characters; 20 extractions per 10 minutes per account/IP; in-memory, no file persistence. Scanned PDFs return `pdf_no_text_layer`. Real college layouts are unvalidated because no sample PDFs exist. |
| A2a Timetable PDF text preview | **Built** | `POST /timetable/pdf/preview` accepts one PDF from a teacher or super-admin and returns the embedded text layer as a read-only preview with page/line counts. The teacher adds each slot through the normal form. | Text-layer PDFs only. Same 10 MB, 20-page, 200,000-character and 20-per-10-minute limits as roster extraction. It never parses rows, matches classes, creates a class or writes a slot. Structured parsing is not built because no representative timetable PDFs exist. |
| A2b Structured timetable import | **Not built** | Match course code/section to an existing owned class, preview slots and require confirmation. Unmatched rows are flagged for manual class creation. | Must never create a class automatically or overwrite a slot without the teacher seeing the change. Needs representative timetable PDFs before parser work. |
| A3 Local OCR | **Not built** | Render scanned pages locally and run a free in-process OCR engine. The OCR output still goes through the same editable preview. | No paid service or card. OCR accuracy and runtime must be measured on sample scans before it is offered. |
| A4 Optional Gemini extraction | **Gated** | A last-resort structured extractor for documents that text extraction and OCR cannot structure. Raw rosters may leave the server only after the consent and risk text below exists. | The Gemini free tier may use content to improve products and may involve human review. No AI path is coded until the owner accepts that risk in this file. |

### Gemini consent and risk acceptance gate (not yet satisfied)

Before any code sends a roster or timetable to Gemini, this section must contain:

1. the exact student-facing notice and where it is shown;
2. the data fields that may leave the server;
3. the retention/training risk of the chosen free tier;
4. the owner's written acceptance and date; and
5. the fallback when a student or teacher opts out.

That text does **not** exist yet. Until it does, A4 stays unbuilt and raw rosters remain
server-side.

## 13. Out of scope (for now)

- Student using another student's phone or account.
- Account/device-key theft that can also convince a teacher to approve the attacker's device.
- iOS and other browsers.
- Native mobile app (Layer 5).
- Any extra room hardware.
