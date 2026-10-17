# Capstone-7th-sem

## Acoustic prototype: secure phone test

The acoustic capability check is deliberately separate from attendance. It has no sign-in, does not store results, and cannot mark a student present. Browser microphone access on a phone requires HTTPS; opening a laptop's `http://LAN-IP:3000` address will not work.

For a short-lived development test, keep the source local and expose only the frontend through a Cloudflare quick tunnel:

1. Install `cloudflared` on the development laptop (`brew install cloudflared` on macOS).
2. In `attendance-frontend`, run `npm run start:shared`.
3. In a second terminal, run `cloudflared tunnel --url http://localhost:3000`.
4. Open the emitted `https://…trycloudflare.com/acoustic-lab` address on each Android phone. The tunnel provides the secure context required for microphone testing; it does not deploy the application.
5. Stop both commands when testing ends. Do not expose an administrative or production account through a quick tunnel.

Record, for every phone: model, Android version, Chrome version, reported sample rate, whether echo cancellation/noise suppression/auto gain can be disabled, and the five displayed signal margins. The next implementation decision is based on these actual readings.
