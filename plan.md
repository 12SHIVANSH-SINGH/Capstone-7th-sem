# Plan: Acoustic Presence Check-in

Source of truth for WHAT we are building and WHY. Read this before doing anything.
Companion files: `agent.md` (how to work), `progress.md` (where we are), `resume-prompt.md` (how to restart a session).

## 1. Goal

Mark attendance for 70-120 students by proving each phone was physically inside one 20 m x 20 m classroom, using only student smartphones, a web app and a server.

- The room is 20 **metres** (not feet). 120 students in 400 m2 is realistic, and range is a real problem, so the echo cascade is justified.
- No room hardware: no speaker, screen or beacon installed in the room.
- The teacher's ordinary phone speaker plays the first signal. The phone stays with the teacher and only starts the process. It is never passed around.
- Cheating is expected: fake GPS, forwarded codes, a friend inside relaying to a friend outside.
- A student using another student's phone or account is **out of scope for now**.
- Build is layered: web app first, mobile app only if the web demo succeeds.

## 2. Core idea

Sound stays inside a room, so hearing a fresh signal is the proof of presence. Phones pass the signal on as near-inaudible tones, and the server decides who is present.

Location (GPS) cannot be the secret: everyone knows where the room is, phone GPS is typically 5-10 m off and worse indoors, and a web app cannot prove its GPS reading is real. GPS is only a weak secondary check.

Three parts:

- **Student credential:** one unique identity per student (70-120), tied to the student's device.
- **Wave key:** a short-lived key minted by the server per wave (K0, K1, K2, ...). A phone gets the next key only after proving it heard the previous one. The "master key" is never typed; it is this chain.
- **Room channel:** sound carries each key from phones to nearby phones. Anyone outside the walls does not hear it.

## 3. Decisions (confirmed by the owner)

| Topic | Decision | Effect |
| --- | --- | --- |
| Phones and browsers | Iteration 1: Android, Chrome, phones from 2020 or later, any brand. About 20% of the class uses iOS, which comes in a later iteration | iOS is not part of the Layer 1 test |
| Band | Lower band is acceptable and preferred if it works | Layer 1 compares 18-20 kHz with a lower band (e.g. 15-17 kHz) and picks the more reliable one |
| Stored data | GPS reading, IP address, device ID, kept as a secondary verification layer | Browsers cannot read a hardware device ID. "Device ID" = random ID + key pair created on first use and stored in the browser; clearing site data resets it |
| Retention | Stored data lives for 1 day. Students raise any query that same day; after that it lapses and attendance is locked | Needs a daily expiry job, a same-day query path into the review queue, and a lock on attendance records. Teacher overrides must also happen that day |
| Teacher override | Only for the review queue (unsure cases) | The teacher cannot change marks outside the queue |
| Time budget | Class is 50-55 min. Teacher starts about minute 40. Check-in must finish in 5-6 min | Rough on paper: ~5-6 s per wave, a handful of waves ~30 s, ID round ~2 min for 120. Measure in Layers 2 and 3 |
| Hosting | Free service such as Render, Netlify or Vercel | Layer 1 needs only static HTTPS hosting. From Layer 2 the server must stay awake and hold live connections for 5-6 min, so check each free tier's idle sleep and connection limits first |
| Student notice | Short in-app notice shown before first check-in and confirmed with a tap (the Join button, which browsers require anyway for mic access), plus one teacher announcement | Notice states what is collected, why, that it is deleted after 1 day, and how to raise a query that day |
| Student identity | College Google account ending nitjsr.ac.in, one account per student. Example: `2023ugcs059@nitjsr.ac.in` encodes batch, programme, branch, roll number | Google sign-in limited to the nitjsr.ac.in domain, verified on the server. Batch/branch/roll are read from the address for display and grouping only; the roster decides class membership |
| Teacher phone | Ordinary phone speaker plays K0 and stays at the front of the room; it is never passed around | Counts as no room hardware. Students are 1-10 m away; if one phone captures poorly, the teacher may move the phone closer for that wave |

### Assumptions I made (not yet confirmed, change if wrong)

- Roster and final attendance results are kept for the term; only GPS/IP/device data expires after 1 day.
- The teacher's phone stays at the front of the room, 1-10 m from the nearest student phones. Moving closer is a fallback for a phone that captures poorly, not part of the normal flow.
- Layer 1 pass target of 95% of frames decoded is a proposal.

## 4. Roster

The roster is the list of college emails allowed to check in to this class (one row per enrolled student, 70-120 rows). It decides who can check in and who counts as absent (on the roster but not marked present).

- Source: a CSV the teacher uploads, with a paste-the-list box as the same feature. For the first pilot, paste 10-20 volunteer emails into the same box.
- One required column: `email`. Name and section are optional.
- On upload the server lowercases emails, removes duplicates, rejects anything not ending in nitjsr.ac.in, and flags addresses that do not match the `2023ugcs059` pattern for teacher review.
- Teacher can add or remove rows afterwards (e.g. late joiner).
- Not needed for Layer 1. First needed in Layer 2.

## 5. Signal design (starting values, tune in Layer 1)

Frequency-shift keying (FSK) with near-ultrasonic tones.

| Setting | Starting value | Reason |
| --- | --- | --- |
| Tone range | 18.0-19.8 kHz (also test a lower band, e.g. 15-17 kHz) | Mostly inaudible to adults; within what 44.1/48 kHz audio can represent |
| Tones | 17, about 110 Hz apart: 1 start marker + 16 data tones | Wide spacing limits leakage between neighbours |
| Symbol length | 120 ms | Rides through echo in a hard-walled room |
| Frame | Start marker (2 symbols) + 7 data symbols + 2 check symbols, about 1.3 s | 7 data symbols in base 15 gives ~170 million values |
| Coding | Two consecutive tones are never the same | Boundaries come from tone changes, no silent gaps |
| Receiver | AudioWorklet running Goertzel filters on the 17 tones | Cheaper than a full FFT, off the main thread |
| Detection | A tone counts only if ~9 dB above the median of the 17 | Adapts to room noise; no fixed level |
| Capture | getUserMedia, mono, echoCancellation / noiseSuppression / autoGainControl all off | Phone speech filters would erase the tones |
| Transmit | One OscillatorNode per symbol with ~6 ms fade in/out | Avoids audible clicks |

Hardware reality:

- Many phone speakers and mics roll off above 17-18 kHz. A frequency sweep in Layer 1 measures this per phone model.
- A lower band is partly audible to younger students: keep volume low and frames short.
- Refuse to start if the audio sample rate is below 44.1 kHz. Log the real applied mic settings.
- The tab must stay in the foreground with the screen on (Screen Wake Lock), or the browser pauses audio.
- Mic and audio need a user gesture (the Join button) and HTTPS.
- Android output latency varies by 50-200 ms: use `osc.start(time)` scheduling, and do not add random backoff (identical synchronised signals reinforce each other).

## 6. Cascade logic

1. Teacher taps Start. Server creates K0. Teacher's phone plays K0 repeatedly.
2. A student phone that decodes Kn sends its credential, Kn and a device signature to the server.
3. Server checks Kn is valid, fresh and unused by that student, marks the student heard in wave n+1, returns K(n+1).
4. The phone plays K(n+1) two or three times, then stays muted for the session (no feedback loops).
5. Phones in the same wave play the identical signal, so sounds add instead of colliding.
6. A phone that hears a valid key from any wave joins at the lowest wave it heard.
7. The cascade ends when a wave adds no new students or the check-in window closes.

Phone state machine: Listening -> Decoding -> Server check -> Transmitting -> Muted. Rejected or expired keys go back to Listening.

The server mints keys; phones never invent them. The wave number is a coarse distance-from-teacher signal.

## 7. Anti-cheat: the ID round

The cascade proves a phone heard some key, but a decoded key is just data and can be texted to someone outside. The ID round proves each phone was heard by its neighbours.

1. After the waves finish, the server gives every student a time slot.
2. In its own slot a phone sends a short ID signal. In every other slot it listens.
3. Each phone reports which IDs it heard.
4. Server marks a student present only if enough different neighbours heard them (threshold set from Layer 2 test data).

Slot length is open until Layer 1 shows the shortest reliable frame (1 s per slot = 2 min for 120). Option to test: slot position identifies the student so the burst can be a plain tone; this needs phone clocks synced to the server within tens of milliseconds.

Secondary signals (never decide alone): GPS near expected area, same public IP / Wi-Fi, submission time inside key lifetime, wave number.

Policy: strict by default. Borderline cases go to a review queue where the teacher approves or rejects by hand, on the same day.

## 8. Layers and gates

Each layer is built only after the previous gate passes, unless the owner explicitly allows a band-independent slice to proceed in parallel. Layer 2.1 (session core) and 2.2 (teacher check-in screen) were allowed on 2026-10-24 while the remaining Layer 1 range tests were still running; scoring and the ID round still wait for the Layer 1 gate decision.

| Layer | Scope | Gate |
| --- | --- | --- |
| 1 Physical layer | Web app sends and hears tones | Frames decode at 1 m, 5 m and 10 m from the teacher's phone at the front. Proposed target: 95% of frames, on phones students actually use |
| 2 Cascade | Server keys, waves, Google sign-in, roster | A small rehearsal reaches every phone. Waves needed and time per wave are measured |
| 3 ID round and scoring | Time slots, neighbour reports, review queue | Phones outside the room are rejected; inside phones accepted or queued for teacher review |
| 4 Class pilot | 70-120 students in the real room | Attendance matches a manual roll call; false accepts and false rejects counted |
| 5 Mobile app | Native audio, background operation, more functions | Decide after Layer 4 |

## 9. Risks and honest limits

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Phones that cannot play or hear 18+ kHz | Those students fail at the physical layer | Per-model sweep in Layer 1; lower band; teacher approval fallback |
| 100+ phones sounding in a hard-walled room | Garbled symbols | Identical signals per wave, long symbols, measure rather than assume |
| Key forwarded by text message | Remote student obtains a key | Short key lifetime and the ID round |
| GPS spoofing | Fake location | GPS is a weak extra check only |
| Screen locks / tab backgrounded | Audio pauses | Wake Lock, foreground tab |
| Student outside near an open door | Might hear tones | ID round, strict threshold, teacher review |
| Younger students hearing the signal | Annoyance | Highest working band at low volume, short frames |
| Free hosting sleeps or limits connections | Check-in fails mid-class | Check free-tier limits before Layer 2 |
| Accomplice physically in the room | Gets through | Out of scope for now; made visible to teacher, not impossible |
| iOS | Not covered in iteration 1 | Later iteration |

## 10. Open items

- Confirm student Google sign-in on production with a real student account; teacher Google sign-in is verified.
- Confirm Render free-plan behaviour during a live 5-6 minute check-in, including idle sleep and connection limits.
- A real Layer 2 pilot will need a CSRF review for the split-hosting cookie mode and a shared-store rate limiter if the service scales past one instance.

## 11. Out of scope (for now)

- Student using another student's phone or account.
- iOS and other browsers.
- Native mobile app (Layer 5).
- Any extra room hardware.
