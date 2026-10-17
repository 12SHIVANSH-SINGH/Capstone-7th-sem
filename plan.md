# Acoustic Presence Check-in: Plan

Oct 16, 2026 · @Shivansh

## Goal and constraints

The goal is to mark attendance for 70-120 students by proving each phone was physically inside one 20 m × 20 m classroom, using only student smartphones, a web app and a server.

- No room hardware: no speaker, screen or beacon. The teacher's phone stays with the teacher and only starts the process.
- Cheating is expected: fake GPS, forwarded codes, and a friend inside relaying to a friend outside.
- A server is allowed. When the system is unsure about a student, it rejects them and the teacher can approve by hand.
- The build is layered: a web app first, a mobile app only if the web demo works.
- First iteration: Android phones made in 2020 or later, any brand, running Chrome. About 20% of the class uses iOS, which comes in a later iteration.
- Time target: the teacher starts about 40 minutes into a 50-55 minute class, and the check-in finishes within 5-6 minutes.

## Core idea

Sound stays inside a room, so hearing a fresh signal is the proof of presence. Phones pass a signal to each other as near-inaudible tones (18-20 kHz), and the server decides who is present.

Location itself cannot be the secret. Everyone knows where the classroom is, phone GPS is typically off by 5-10 m even outdoors and worse indoors, and a web app cannot prove its GPS reading is real. So the design splits the job into three parts:

- **Student credential:** one unique code per student (70-120), tied to that student's device.
- **Wave key:** a short-lived key minted by the server for each wave (K0, K1, K2 and so on). A phone gets the next key only after proving it heard the previous one.
- **Room channel:** sound carries each key from phones to nearby phones. Anyone outside the walls does not hear it.

The master key is therefore never typed and never derived from coordinates. It is the chain K0 → K1 → K2, and each link is released only to a phone that heard the one before.

## Signal design

Each key travels as a short sequence of tones using frequency-shift keying (FSK). The values below are starting points to be tuned in Layer 1, not final numbers.

| Setting       | Starting value                                                                      | Reason                                                                        |
| ------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Tone range    | 18.0-19.8 kHz                                                                       | Mostly inaudible to adults, inside what 44.1/48 kHz phone audio can represent |
| Tones         | 17, about 110 Hz apart: 1 start marker + 16 data tones                              | Wide spacing limits leakage between neighbouring tones                        |
| Symbol length | 120 ms                                                                              | Long enough to ride through echo in a hard-walled room                        |
| Frame         | Start marker (2 symbols) + 7 data symbols + 2 check symbols, about 1.3 s            | 7 data symbols in base 15 give about 170 million distinct values              |
| Coding        | Two consecutive tones are never the same                                            | Symbol boundaries come from tone changes, so no silent gaps are needed        |
| Receiver      | AudioWorklet running Goertzel filters on the 17 tones                               | Cheaper than a full FFT and runs off the main thread                          |
| Detection     | A tone counts only if it stands about 9 dB above the median of the 17               | Adapts to room noise instead of using a fixed level                           |
| Capture       | getUserMedia, mono, with echoCancellation, noiseSuppression and autoGainControl off | Phone speech filters would otherwise erase the tones                          |
| Transmit      | One OscillatorNode per symbol with a 6 ms fade in and out                           | Avoids audible clicks at symbol changes                                       |

Hardware reality to plan for:

- Many phone speakers and microphones fall off above 17-18 kHz. A frequency sweep in Layer 1 measures this per phone model.
- A lower band is acceptable. Layer 1 also sweeps a lower band (for example 15-17 kHz) and uses it when it decodes more reliably. It is partly audible to younger students, so keep the volume low and the frames short.
- iOS Safari may ignore the processing switches. The app reads and logs the microphone's actual settings.
- The audio sample rate must be at least 44.1 kHz; the app refuses to start below that.
- The tab must stay in the foreground with the screen on (Screen Wake Lock), or the browser pauses audio.

## Cascade logic

&#91;embedded content: key cascade · the room, then one phone's loop\]

A phone that hears a valid key reports it to the server, receives the next key, plays it, and then stays quiet for that session.

1. The teacher taps Start. The server creates K0 and the teacher's phone plays it repeatedly.
2. A student phone that decodes Kn sends its credential, Kn and a device signature to the server.
3. The server checks that Kn is valid, fresh and unused by that student, marks the student as heard in wave n+1, and returns K(n+1).
4. The phone plays K(n+1) two or three times, then stays muted so signals cannot loop.
5. Phones in the same wave play the identical signal, so their sounds add up instead of colliding.
6. A phone that hears a valid key from any wave joins at the lowest wave it heard.
7. The cascade ends when a wave adds no new students or the check-in window closes.

Each wave costs one frame (about 1.3 s) plus a server round trip, so a 20 m room should need only a handful of waves. Layer 2 measures the real count.

## Anti-cheat: the ID round

The cascade proves a phone heard some key, but once decoded a key is only data: a friend inside the room could text it to someone outside. The ID round closes that gap by proving each phone was heard by its neighbours, not just that it heard.

1. After the waves finish, the server gives every student a time slot.
2. In its own slot, a phone sends a short ID signal. In every other slot it listens.
3. Each phone reports which IDs it heard.
4. The server marks a student present only if enough different neighbours heard them. The threshold is set from Layer 2 test data.

A student at home or in the corridor has no neighbours in the room to hear them, so a forwarded key alone does not pass.

Slot length is open until Layer 1 shows the shortest frame that decodes reliably: at 1 s per slot, 120 students take 2 minutes. One option to test is letting the slot position itself identify the student, so the burst can be a plain tone. That needs every phone's clock synchronised with the server to within tens of milliseconds.

Other signals add confidence but never decide alone: GPS near the expected area, the same public IP or Wi-Fi network, submission time inside the key's lifetime, and the wave number.

The system is strict by default. Anything borderline goes into a review list where the teacher approves or rejects each student by hand.

## Layered build plan

&#91;embedded content: build plan · 5 layers, each with a gate\]

Each layer is built only after the previous gate passes. The targets are proposals for you to confirm or change.

## Risks and honest limits

A cheater with a physically present accomplice can still get through: the accomplice's phone is really in the room. The design makes this costly and visible to the teacher, not impossible. Other risks:

| Risk                                                                                      | Effect                                    | Mitigation                                                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Phones that cannot play or hear 18+ kHz                                                   | Those students fail at the physical layer | Per-model sweep test in Layer 1; fall back to a lower band or teacher approval         |
| iOS Safari ignores echo and noise settings, or lowers volume while the microphone is open | Tones muted or distorted                  | Log the real microphone settings; test on iPhones students actually own                |
| 100+ phones sounding in a hard-walled room                                                | Garbled symbols                           | Phones in one wave send the identical signal; long symbols; measure rather than assume |
| Key forwarded by text message                                                             | Remote student obtains a key              | Short key lifetime and the ID round                                                    |
| GPS spoofing                                                                              | Fake location                             | GPS is a weak extra check, never the decision                                          |
| Screen locks or tab goes to background                                                    | Audio pauses                              | Wake Lock and a foreground tab; iOS has no workaround                                  |
| Student outside near an open door                                                         | Might hear the tones                      | ID round and strict threshold; teacher review                                          |
| Younger students hearing 18 kHz                                                           | Annoyance                                 | Highest working band at low volume; short frames                                       |

## Decisions

| Question            | Decision                                                                                                                            | Effect on the plan                                                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phones and browsers | Android, Chrome, phones from 2020 onward, any brand; about 20% of the class uses iOS                                                | Iteration 1 targets Android with Chrome. iOS is a later iteration and is not part of the Layer 1 test.                                                                                                                                                                              |
| Band                | A lower band is acceptable, and preferred if it works                                                                               | Layer 1 compares the 18-20 kHz band with a lower band and picks the one that decodes most reliably on 2020+ phones.                                                                                                                                                                 |
| Stored data         | GPS reading, IP address and device ID, kept as a secondary check                                                                    | Browsers cannot read a hardware device ID. The "device ID" is a random ID plus a key pair created on first use and stored in the browser, so clearing site data resets it.                                                                                                          |
| Retention           | Stored data lives for one day. A student with a problem raises a query that same day; after that it lapses and attendance is locked | The server needs a daily expiry job, a same-day query path into the teacher's review queue, and a lock on attendance records once the day ends. Teacher overrides therefore also have to happen that day.                                                                           |
| Teacher override    | Only for the review queue                                                                                                           | The teacher cannot change a student's mark outside the queue of unsure cases.                                                                                                                                                                                                       |
| Time budget         | Teacher starts at about minute 40; done in 5-6 minutes                                                                              | On paper each wave takes about 5-6 s (frame repeated 2-3 times plus a server trip), so a handful of waves is about 30 s, and the ID round at 1 s per student is about 2 min for 120. These are rough and get measured in Layers 2 and 3.                                            |
| Hosting             | A free service such as Render, Netlify or Vercel                                                                                    | Layer 1 needs only static hosting over HTTPS. From Layer 2 the server must stay awake and handle live connections for 5-6 minutes, so check each free tier's idle sleep and connection limits before choosing.                                                                      |
| Student notice      | A short notice in the app, shown before the first check-in and confirmed with a tap, plus one announcement by the teacher           | The Join button, which browsers require before the microphone can be used, also confirms the notice. The text says what is collected (GPS reading, IP address, device ID), why (a backup check on attendance), that it is deleted after one day, and how to raise a query that day. |
