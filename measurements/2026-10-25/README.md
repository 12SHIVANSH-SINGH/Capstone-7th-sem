# 2026-10-25 — distance sweep from 1 m to 10 m

Five paired runs recorded on 2026-10-25. The 1 m run passed at 100%; 2 m and 3 m reached 90%; 5 m and 10 m fell to 40% and 10%. Overall **33 of 50 frames decoded (66%)**, so the proposed Layer 1 gate (>=95% at 1 m, 5 m and 10 m) is **not met**. All reports use app version 1.8.0, 48 kHz on both ends, Android 10 / Chrome 155, 10 planned frames, 120 ms symbols and a 450 ms gap. TX and RX run IDs match because the receiver link was used, and every decoded key matches its transmitter report.

| Distance | Key | TX run | RX run | Sent | Decoded | Rate | RX margin range | TX settings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 m | 67685752 | KNLTDK | KNLTDK | 10 | 10 | 100% | 22.8-34.6 dB | 50% amplitude, 450 ms gap |
| 2 m | 112601243 | JXSW5P | JXSW5P | 10 | 9 | 90% | 20.4-32.8 dB | 50% amplitude, 450 ms gap |
| 3 m | 168524840 | ZNUZRT | ZNUZRT | 10 | 9 | 90% | 24.7-34.5 dB | 50% amplitude, 450 ms gap |
| 5 m | 127494959 | 4Y32LT | 4Y32LT | 10 | 4 | 40% | 11.1-12.9 dB | 45% amplitude, 450 ms gap |
| 10 m | 159574813 | 6RHC9R | 6RHC9R | 10 | 1 | 10% | 10.2 dB | 50% amplitude, 450 ms gap |

## Caveats

- Phone models and media volume were not recorded. Both ends report Android 10 and
  Chrome 155.0.0.0 with 48 kHz context and track rates, so do not label these runs as
  M01 or M32 without evidence.
- Distances are the conditions typed on the transmitter and copied to the receiver link.
  `room` and `notes` are null in every report.
- All five pairs used 10 repeats, a 450 ms gap and 120 ms symbols. Amplitude was 0.5 for
  every run except 5 m, which used 0.45, so the 5 m row is not a perfectly matched
  setting.
- The 1 m run meets the proposed 95% target, but 5 m (40%) and 10 m (10%) do not; the
  intermediate 2 m and 3 m runs reached 90%.
- The 5 m and 10 m RX margins (11.1-12.9 dB and 10.2 dB) sit close to the 9 dB detection
  threshold, while the 1 m-3 m margins are 20.4-34.6 dB.
- Unlike 2026-10-24, TX and RX run IDs match in every pair because the receiver link was
  used; the decoded key also matches the TX key each time.
- No muted-transmitter control or labelled reverse-direction run exists in this series.
  The transmitting and receiving phone roles were not recorded.
- The 2026-10-24 runs used different settings (50% amplitude with 10 repeats, and 90%
  amplitude with 20 repeats), did not record phone models or volume, and their 5 m RX
  report still said `distance: "1 m"`. The two days are not a controlled comparison.

## Files

- `tx-KNLTDK-1m.json`, `rx-KNLTDK-1m.json`
- `tx-JXSW5P-2m.json`, `rx-JXSW5P-2m.json`
- `tx-ZNUZRT-3m.json`, `rx-ZNUZRT-3m.json`
- `tx-4Y32LT-5m.json`, `rx-4Y32LT-5m.json`
- `tx-6RHC9R-10m.json`, `rx-6RHC9R-10m.json`
