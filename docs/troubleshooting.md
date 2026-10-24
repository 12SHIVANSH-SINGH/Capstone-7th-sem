# Troubleshooting

**"Cannot find module …" when starting**
Dependencies are not installed. Run `npm install` inside `attendance-backend/` or `attendance-frontend/`.

**Backend won't start / database errors**
Check that MongoDB is running (step 1 of [getting started](getting-started.md)) and that `attendance-backend/config/config.env` exists with real values. That file is not in git — ask the project owner.

**Node version error**
The backend needs Node 22 or newer. Check with `node -v` and update if needed.

**Google says "Access blocked" for a test account**
That Gmail is not on the Google Cloud OAuth consent screen's test-user list. Add it there, or sign in with the college account. Also remember: with the local OAuth client, sign-in only works from `http://localhost:3000`; the deployed site uses its own authorized origin.

**The sound lab page stays silent / no microphone prompt**
Microphone access requires HTTPS. Don't open the laptop's LAN IP on the phone — use the Cloudflare tunnel (see getting started) and open the `https://….trycloudflare.com` link.

**The tunnel link stopped working**
Cloudflare quick tunnels get a new random URL on every run and die when the laptop sleeps or the command stops. Re-run `cloudflared tunnel --url http://localhost:3000` and use the new link.

**"Port 3000/4000 already in use"**
Something is already running on that port. Stop it:

```bash
lsof -tiTCP:3000 | xargs kill    # or 4000
```

**A random URL shows the "404 — This page doesn't exist" screen**
That's expected — unknown addresses get our 404 page.
