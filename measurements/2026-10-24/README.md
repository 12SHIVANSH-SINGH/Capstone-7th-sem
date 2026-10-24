# 2026-10-24 — first real two-phone link runs

Both runs passed the forward direction at 100%. They were recorded before the
1.9a report-pairing change, so the TX and RX run IDs differ; the decoded key is
what pairs each report. Phone models and media volume were not recorded.

| Distance | Key | TX run | RX run | Sent | Decoded | Rate | RX margin range | TX settings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 m | 88666047 | A75QP7 | YMBT86 | 10 | 10 | 100% | 28.0-39.6 dB | 50% amplitude, 450 ms gap |
| 5 m | 45021576 | VRH74L | PUEVEN | 20 | 20 | 100% | 29.1-36.8 dB | 90% amplitude, 250 ms gap |

## Caveats

- TX Chrome 154 -> RX Chrome 123, Android 10 on both reports; exact phone models
  were not recorded, so do not label these as M01/M32 without evidence.
- The 5 m RX report still says `distance: "1 m"` because the condition was typed
  on the transmitter only. 1.9a now copies distance/room/notes in the receiver
  link.
- No muted control, reverse-direction run or 10 m run exists yet.
- 1 m and 5 m used different amplitude/gap settings, so they are not a clean
  distance comparison.

## Files

- `tx-A75QP7-1m.json`, `rx-YMBT86-1m.json`
- `tx-VRH74L-5m.json`, `rx-PUEVEN-5m.json`
