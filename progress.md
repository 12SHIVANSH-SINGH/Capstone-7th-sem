# progress.md: Where we are

Update this at the end of every session. If it disagrees with the real code, the code wins: fix this file and tell the owner.

Last updated: 2026-10-17 (created from the planning conversation)

## Status

- Current layer: **Layer 1, Physical layer** (web app sends and hears tones)
- Current slice: **not yet confirmed**. The owner says some code already exists, but it was not visible when this file was written (see "Already built").
- Last gate passed: none
- Next action: owner fills in "Already built" below, then the next session verifies it against the slice list.

## Done: planning (no code)

- [x] Requirements gathered and decisions confirmed (see `plan.md` section 3)
- [x] Design written: signal, cascade, ID round, roster, identity, retention, hosting, risks
- [x] Layered plan with gates
- [x] Planning doc exists as a Claude doc ("Acoustic Presence Check-in: Plan") and is now mirrored in `plan.md`
- [x] `plan.md`, `agent.md`, `progress.md`, `resume-prompt.md` created

## Already built (UNVERIFIED, owner to fill in)

The owner reports that some part is already built. I could not see it, so nothing here is confirmed.

| Item | Where it lives (path or URL) | What it does | Tested? (yes/no, how) |
| --- | --- | --- | --- |
| (fill in) | | | |

Instruction for the next session: look at the real files, match each item to a slice below, mark those slices as "built, needs test" (not "done"), and run their tests first.

## Layer 1: slice list

Status key: `todo`, `built, needs test`, `passed`, `failed`

| # | Slice | Pass/fail test | Status |
| --- | --- | --- | --- |
| 1.1 | Static page with a Join button, served over HTTPS (free host) | Page opens on an Android Chrome phone from the hosted URL | todo |
| 1.2 | Join starts AudioContext and mic; app logs real sample rate and the mic settings the browser applied; refuses below 44.1 kHz | Log shows sample rate and applied settings on a real phone | todo |
| 1.3 | Play one tone at a chosen frequency with ~6 ms fade; frequency sweep page | A second phone's spectrum view shows the tone; no audible clicks | todo |
| 1.4 | Single-tone detector (Goertzel) with live level display and noise-floor estimate | Detects a tone from the other phone at 1 m; quiet room shows no detection | todo |
| 1.5 | Band sweep across 15-20 kHz on each available phone model; record which frequencies play and record well | Table of phone model vs usable frequencies saved in this file | todo |
| 1.6 | FSK frame encoder (start marker, 7 data symbols, 2 check symbols, no repeated adjacent tone) | Node test: encode then decode a synthetic buffer, 1000 random keys, all correct | todo |
| 1.7 | Frame decoder tested on synthetic audio with added noise and echo | Node test: decode rate and false-positive rate reported at several noise levels | todo |
| 1.8 | Live send and receive between two phones at 1 m | Frames sent vs decoded recorded; at least 95% | todo |
| 1.9 | Range test at 6 m and at the far corner (about 20 m) | Same record at each distance; at least 95% (proposed target) | todo |
| 1.10 | Choose the band (18-20 kHz or lower) from the measurements; decide whether Layer 1 gate passes | Decision written here with the numbers behind it | todo |

Layer 1 gate (from `plan.md`): frames decode at 1 m, 6 m and the far corner, proposed target 95% of frames on phones students actually use.

## Later layers (not started; do not begin before the previous gate passes)

- Layer 2: Cascade. Server mints keys, waves, domain-restricted Google sign-in, roster upload, free-host check. Gate: small rehearsal reaches every phone; waves and time per wave measured.
- Layer 3: ID round and scoring. Time slots, neighbour reports, review queue, same-day override, 1-day expiry job and attendance lock. Gate: outside phones rejected; inside phones accepted or queued.
- Layer 4: Class pilot with 70-120 students. Gate: attendance matches manual roll call; false accepts and rejects counted.
- Layer 5: Mobile app, decided after Layer 4.

Each of these must be broken into slices like Layer 1 before work starts.

## Measurements log

Record real results here (phone model, Android version, Chrome version, band, distance, frames sent, frames decoded, notes).

| Date | Phone | Android / Chrome | Band | Distance | Sent | Decoded | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## Session log

| Date | Slice | What was done | Test result | Next |
| --- | --- | --- | --- | --- |
| 2026-10-17 | n/a | Planning and these four markdown files | n/a | Owner lists what is already built; verify it |

## Open items (from `plan.md`)

- Can the teacher's phone sit in the centre, or must it stay at the front?
- Confirm the college Google domain sign-in setup.
- Pick the free host for Layer 2 after checking idle sleep and connection limits.
- Confirm the assumptions in `plan.md` section 3.

## Blockers

None recorded.
