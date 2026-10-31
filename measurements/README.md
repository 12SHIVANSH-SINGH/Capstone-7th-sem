# Real phone measurements

This folder holds the raw reports from real phones. They are evidence for the
Layer 1 gate and for later tuning — not attendance records.

## What to keep

One folder per test day:

```
measurements/YYYY-MM-DD/
  README.md          summary: pair, key, distance, sent/decoded, settings
  tx-<runId>.json    transmitter report
  rx-<runId>.json    receiver report
```

Keep the receiver and transmitter JSON files together. Two phones only count as
one run when their **decoded key matches**. Before 1.9a the run IDs were typed
by hand and could differ, so the key is the fallback pairing field.

## How to run a pair

1. Put the teacher phone at the front of the room, where it will actually sit.
2. On `/acoustic-tx`, fill in distance, room and notes **before** transmitting.
   Put both phone models, Chrome versions and the media volume in Notes.
3. Tap **Copy receiver link** and open it on the student phone. It carries the
   run ID, distance, room and notes. Typing the same ID manually also works.
4. Start listening on the receiver, then transmit.
5. Save both JSON reports and write the pair in the day's README.

Use the same amplitude, repeats, gap and media volume for every distance in a
series. Otherwise the results are not comparable.

## Current Layer 1 gate

Confirmed by the owner on 2026-10-24:

- The teacher's phone stays at the **front** and is never passed around.
- Student phones are **1-10 m** from it. Moving the phone closer is a fallback
  for a phone that captures poorly, not part of the normal flow.
- Decode **≥95% of frames** at **1 m, 5 m and 10 m**.
- Test both directions (M01 TX / M32 RX and M32 TX / M01 RX), because the M32
  speaker measured only 0.7 dB at 19.5 kHz in the lab.
- Muted-transmitter control must decode **0** frames.

The final 2026-10-25 distance sweep is the current evidence: **1 m 10/10,
2 m 9/10, 3 m 9/10, 5 m 4/10, 10 m 1/10**. The 1 m run meets the proposed
95% target, but **5 m and 10 m fail** and the gate is not met. The old
2026-10-24 5 m run is not a true 5 m measurement because its RX report still
said `distance: "1 m"`. The reverse direction and muted control are still
open. See `2026-10-25/README.md` for the caveats (phone models and media
volume were not recorded; 5 m used 45% amplitude).
