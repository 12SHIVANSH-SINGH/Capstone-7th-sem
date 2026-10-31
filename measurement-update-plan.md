# Required updates after the 2026-10-25 measurement archive

Created: 2026-10-25
Source data: `measurements/2026-10-25/` (10 JSON reports + README)
Scope: documentation corrections and status updates only. No code, plan, or gate decision changes.
Status: **completed 2026-10-25**; kept as an audit trail. A later 2.4a pass also changed `plan.md` and two `docs/diagrams/*.puml` files for the discovery endpoint, not for the measurements below.

## New measurements to reflect

Five paired runs, one per distance, app version 1.8.0, Android 10 / Chrome 155 on both ends, 48 kHz, 10 planned frames, 120 ms symbols, 450 ms gap. Phone models and media volume were not recorded. TX/RX run IDs and keys match in every pair.

| Distance | Key | TX run | RX run | Sent | Decoded | Rate | RX margin range | TX settings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 m | 67685752 | KNLTDK | KNLTDK | 10 | 10 | 100% | 22.8-34.6 dB | 50% amplitude, 450 ms gap |
| 2 m | 112601243 | JXSW5P | JXSW5P | 10 | 9 | 90% | 20.4-32.8 dB | 50% amplitude, 450 ms gap |
| 3 m | 168524840 | ZNUZRT | ZNUZRT | 10 | 9 | 90% | 24.7-34.5 dB | 50% amplitude, 450 ms gap |
| 5 m | 127494959 | 4Y32LT | 4Y32LT | 10 | 4 | 40% | 11.1-12.9 dB | 45% amplitude, 450 ms gap |
| 10 m | 159574813 | 6RHC9R | 6RHC9R | 10 | 1 | 10% | 10.2 dB | 50% amplitude, 450 ms gap |

Overall: 33/50 decoded (66%). The 1 m run meets the proposed 95% target; 5 m and 10 m fail. Reverse direction and muted-transmitter control are still unmeasured. The 2026-10-24 5 m "pass" is not a true 5 m result: its RX report still says `distance: "1 m"`.

## Files to update

### `progress.md`

- [x] Update the `Last updated` line to mention the 2026-10-25 archived sweep.
- [x] Rewrite the current-slice/status paragraph: replace the 1 m 10/10 and 5 m 20/20 claim with the 2026-10-25 results; state that 5 m and 10 m fail; note reverse and muted control remain unmeasured.
- [x] Slice 1.8 row: add a caveat that the 2026-10-25 sweep supersedes the 5 m claim.
- [x] Slice 1.9 row: replace "1 m 100% and 5 m 100%" with all five distances; mark 5 m and 10 m as failing.
- [x] Slice 1.10 row: keep `todo`, but note the new evidence points to a range problem.
- [x] "Next slice" section: make diagnosing/fixing 5 m and 10 m the highest priority, then rerun them plus reverse direction and muted control. Keep the student shell as the next code slice.
- [x] Layer 1 blocker: say the gate now fails at 5 m/10 m, not only that runs are missing.
- [x] Measurements log: add five 2026-10-25 rows (1, 2, 3, 5, 10 m) with keys, sent/decoded, margins and settings; note models/media volume were not recorded.
- [x] Replace "No new phone measurement was taken in session 14" with a pointer to `measurements/2026-10-25/`.
- [x] Session log: add a row for the archive creation and verification.

### `measurements/README.md`

- [x] Replace the final "Current Layer 1 gate" conclusion. Do not call both 2026-10-24 1 m and 5 m runs passes; the 5 m RX was actually at 1 m.
- [x] Add the 2026-10-25 sweep: 1 m passes; 5 m (40%) and 10 m (10%) fail; reverse and muted control still pending.
- [x] Note that 2026-10-25 settings were consistent except 5 m used 0.45 amplitude.

### `README.md`

- [x] Status table: rename the 1 m row to a distance-sweep row and replace "10/10 at 1 m, 20/20 at 5 m" with the 2026-10-25 results; mark 5 m and 10 m as failing.
- [x] "What works today" TX/RX bullet: add that the link works at 1 m but degrades sharply at 5 m/10 m.
- [x] Notes: update the band-tuning paragraph to say the 10 m run exists and failed at 10%, with 5 m at 40%; band/range tuning is still required.

### `agent.md`

- [x] Current-phase bullet 1: replace the 1 m/5 m pass claim with the 2026-10-25 numbers; keep the gate open; state reverse/control are still pending and that the 2026-10-24 5 m result was not a true 5 m measurement.
- [x] Adjust the "Next code slice" wording only as needed to keep Layer 1 range diagnosis as the top priority while the student shell remains the next code slice.

### `resume-prompt.md`

- [x] Current-state bullet 1: replace the 1 m/5 m 100% statement with the 2026-10-25 results and the 5 m/10 m failure.
- [x] State that the 10 m run is no longer pending; it measured 10%, and reverse + control remain pending.
- [x] Update the next-slice/priority sentence to put range diagnosis first, with the student shell still next for code.

### `docs/what-is-this.md`

- [x] Update the "Live phone-to-phone tone test" row: 1 m 10/10, 2 m/3 m 9/10, 5 m 4/10, 10 m 1/10; reverse/control still pending.
- [x] Ensure the table no longer implies 5 m passed.

### `docs/how-it-works.md`

- [x] Rewrite the final "What we measured so far" paragraph: keep the M32 19.5 kHz lab weakness, replace "passed at 1 m and 5 m" with the 2026-10-25 sweep and the 5 m/10 m failure.
- [x] Say the band may still move lower and range/reverse-direction work remains.

### `docs/deployment.md`

- [x] Section 7, "Matrix and controls": replace "forward 1 m and 5 m runs passed 100% on 2026-10-24" with the 2026-10-25 results and the 5 m/10 m failure.
- [x] Keep the gate checklist wording, but state the gate is still open and now blocked by a measured range failure, not only missing runs.

## Files that do not need changes

- `plan.md`: the gate target and Layer 2 gating are unchanged; no 1.10 decision has been made.
- `docs/diagrams/*.puml`: architecture and flow are unchanged.
- `docs/getting-started.md`, `docs/troubleshooting.md`, `attendance-frontend/README.md`: no measurement claims to correct.
- `measurements/2026-10-24/`: historical record; leave as-is.
- `measurements/2026-10-25/README.md`: already contains the current report.
