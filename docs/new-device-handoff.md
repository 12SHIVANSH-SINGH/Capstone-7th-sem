# New-device handoff — macOS

This is the single-owner handoff for moving Bio Attend to a new Mac and continuing the
capstone. It assumes the owner controls every commit, push and deploy. There is no second
developer and no Windows machine in this handoff.

**Snapshot:** 2026-11-23. Last owner-confirmed Render deployment: **`7148994`**. `HEAD` and
`origin/main` are **`d98bec1`**, which adds the 2026-11-21 register/UI-defect fixes and the
2026-11-22 evidence/device/export slice, including the per-session auto-present opt-in and the
new `test:device` suite. The working tree has the production-build fix for the committed
frontend; commit it, push, redeploy, then re-run gate **G2** before signed testing.

## 1. What Git carries and what it does not

| Item | In Git? | What to do on the new Mac |
| --- | --- | --- |
| Backend and frontend source | ✅ | `git clone` the repository. |
| `README.md`, `plan.md`, `progress.md` and docs | ✅ | Read after cloning. |
| `measurements/` evidence | ✅ | Comes with the clone. |
| `attendance-backend/config/config.env` | ❌ gitignored | Copy it from the old Mac through an encrypted channel, or recreate it from the example. Never commit it. |
| MongoDB Atlas URI/password | ❌ | Already in `config.env` and Render. Sign in to Atlas with the owner account. |
| Google OAuth client ID | ❌ in Git | Already in `config.env` and Render. Sign in to Google Cloud with the owner account. |
| Render service and environment variables | ❌ | Sign in to the Render dashboard with the owner account. Nothing needs recreating. |
| MongoDB local data | ❌ | Start a fresh local database; do not copy `~/data/db`. |
| Generated PDFs in `test-artifacts/` | ❌ gitignored | Regenerate with the script below. |

**Never put a secret in a Markdown file, a commit, a screenshot or a chat message.**

## 2. Install the tools

Open Terminal and install the basics:

```bash
xcode-select --install          # if the command-line tools are missing
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Install Node. The repository's `.nvmrc` says **24**, and the backend requires **Node 22.13
or newer**. Node 24 LTS is the recommended choice:

```bash
brew install nvm
mkdir -p ~/.nvm
# Add the two nvm lines printed by `brew info nvm` to ~/.zshrc, then restart Terminal.
nvm install 24
nvm use 24
node -v                           # v24.x or newer
```

Install the remaining tools:

```bash
brew tap mongodb/brew
brew install mongodb-community    # or use the official MongoDB macOS installer
brew install --cask google-chrome
brew install cloudflared          # optional: HTTPS tunnel for real-phone microphone tests
brew install mongodb-database-tools  # only needed for the encrypted backup/restore drill
```

If `mongod` is already installed elsewhere, keep that installation; the only requirement is
that it listens on `127.0.0.1:27017`.

## 3. Clone the repository

```bash
mkdir -p ~/Workspace/projects/CAPSTONE
cd ~/Workspace/projects/CAPSTONE
git clone https://github.com/12SHIVANSH-SINGH/Capstone-7th-sem.git Attendance
cd Attendance
git rev-parse --short HEAD
git status --short
```

At the handoff snapshot, `HEAD` and `origin/main` are `d98bec1`; the working tree has the
production-build fix. The tree should be clean after the owner commits it. Record the new
hash and update the status docs after verifying it.

Install dependencies separately; this is **not** an npm workspace:

```bash
cd attendance-backend
npm ci
cd ../attendance-frontend
npm ci
```

If `npm ci` rejects a stale lockfile, run `npm install` once, review the diff, and commit only
the intended dependency change.

## 4. Restore the backend configuration

The backend reads `attendance-backend/config/config.env`. It is gitignored. Copy the real file
from the old Mac using an encrypted transfer, or create it from the safe template:

```bash
cd attendance-backend
cp config/config.env.example config/config.env
```

Fill at least these values:

```dotenv
PORT=4000
DB_URI=mongodb://127.0.0.1:27017/attendance
JWT_SECRET=<long-random-local-secret>
JWT_EXPIRE=5d
COOKIE_EXPIRE=2
GOOGLE_CLIENT_ID=<owner-google-oauth-web-client-id>
CLIENT_URL=http://localhost:3000
TEACHER_EMAILS=2023ugcs059@nitjsr.ac.in
SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com
SUPER_ADMIN_SESSION_HOURS=12
```

The real local file may also contain the Atlas URI, test-account lists and WebAuthn settings.
Do not guess them. If a value is missing, ask the owner or read the old configuration.

## 5. Start the local stack

Use a fresh database directory. The old `~/data/db` is partially root-owned on the previous
machine; do not reuse it.

```bash
mkdir -p ~/data/db-attendance-dev ~/data/log
mongod --dbpath ~/data/db-attendance-dev \
  --logpath ~/data/log/mongod-attendance.log
```

Leave MongoDB running in its own terminal, then start the backend:

```bash
cd attendance-backend
npm run dev
```

Wait for the MongoDB connection, `MongoDB indexes are ready` and `server is working`. Check:

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:4000/api/v1/health/ready
```

Start the frontend in a second terminal:

```bash
cd attendance-frontend
npm start
```

Open **http://localhost:3000**. The development personas (`teacher`, `student1`…) and demo
data are available only with `npm run dev`.

For a real phone, the microphone needs HTTPS:

```bash
cd attendance-frontend
npm run start:shared
cloudflared tunnel --url http://localhost:3000
```

Register the tunnel origin with Google only if you need Google sign-in on the phone. The
acoustic lab and TX/RX pages do not require sign-in.

## 6. Run the local gate

```bash
cd attendance-backend
npm test
npm test -- --test-isolation=none

cd ../attendance-frontend
npm run test:proof
npm run test:acoustic
npm run test:checkin
npm run test:attendance
npm run test:studentcheckin
npm run test:auth
npm run test:device
npm run test:rosterimport
npm run test:timetableimport

CI=true REACT_APP_API_URL=/api/v1 \
  REACT_APP_GOOGLE_CLIENT_ID=<same-client-id> \
  REACT_APP_GOOGLE_HOSTED_DOMAIN= \
  npm run build
```

Expected at the handoff snapshot:

| Gate | Expected |
| --- | --- |
| Backend, both modes | **271/271** |
| Frontend helper total | **120/120** (proof 15, acoustic 51, check-in 10, attendance 12, student check-in 14, auth 2, device 4, roster 6, timetable 6) |
| Production build | compiles successfully |

The audio and check-in tests do not prove physical range. The 2026-10-25 sweep still fails at
5 m (4/10) and 10 m (1/10); reverse direction and muted control are unmeasured.

Generate the synthetic PDFs for the manual preview tests:

```bash
cd attendance-backend
node scripts/generate-test-pdfs.js
```

It writes text-layer and no-text-layer PDFs to the gitignored `test-artifacts/` directory.

## 7. Verify the deployed service

The Render dashboard is the source of truth for the live commit. Do not infer it from a
reachable URL.

1. Open the Render dashboard for `bio-attend`.
2. Open **Events** or **Deploys** and read the live commit.
3. Compare it with the commit you intend to test.
4. Check the health endpoints and headers:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://bio-attend.onrender.com/api/v1/health
curl -sS https://bio-attend.onrender.com/api/v1/health/ready
curl -sS -D - -o /dev/null https://bio-attend.onrender.com/
```

Expected: health **200**, readiness **200** with `"database": true`, and the security headers
listed in [`testing-plan.md`](testing-plan.md) §G2.

At handoff the owner confirmed Render shows **`7148994`**. `d98bec1` and its working-tree
build fix are newer. Commit the fix, push and deploy, then repeat G2 and record the new hash in
`progress.md` and [`testing-plan.md`](testing-plan.md).

## 8. What to do next, in order

Do not start with A2b/A3/A4. The one-week completion path is:

| Order | Work | Done when |
| --- | --- | --- |
| 1 | Fix and test the register/evidence slice | Done in `d98bec1`: the three register defects are fixed, evidence filtering and draft-only bulk marking work, and auto-present is a per-session opt-in. |
| 2 | Commit the build fix, push, deploy and re-run G2 | Render shows the reviewed commit; local tree is clean. |
| 3 | Run G0–G7 from [`testing-plan.md`](testing-plan.md) | Every gate is PASS or explicitly BLOCKED with evidence. |
| 4 | Run AC → FL → AD → PDF → DP/RS | Every suite records PASS/FAIL/BLOCKED; no open P0/P1 defect. |
| 5 | Measure the physical cascade and range | 1 m/5 m/10 m both directions, muted control, real phone-to-phone rehearsal; record device models and volume. |
| 6 | Build A2b with real timetable PDFs | Structured preview, existing-class matching, teacher confirmation, unmatched rows flagged. |
| 7 | Build A3 local OCR | Free in-process OCR, measured on sample scans; preview still requires confirmation. |
| 8 | Decide A4 Gemini extraction | Only after the owner dates and signs the draft student notice and risk acceptance in `plan.md` §12. |
| 9 | Assemble the capstone submission pack | Report, slides, demo script and evidence appendix point at real results only. |

## 9. A2b/A3/A4 gates

- **A2b** needs representative college timetable PDFs. Do not invent a layout. Put the samples
  in the gitignored `test-artifacts/timetable-samples/` directory (or another private folder;
  never commit real student documents). Build the parser against the samples, show a slot
  preview, match only existing owned classes, and flag unmatched rows for manual class
  creation. Never create a class or overwrite a slot silently.
- **A3** must use a free, local, in-process OCR engine with no card. OCR output goes through
  the same editable preview and teacher confirmation. Measure accuracy and runtime on sample
  scans before offering it.
- **A4** stays unbuilt until the owner dates and signs the draft in `plan.md` §12, which
  already lists the exact student notice, the fields that may leave the server, the free-tier
  retention/training risk and the opt-out fallback. Raw rosters remain server-side until D4
  is signed.

## 10. Common failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Backend exits before `server is working` | Node older than 22.13 | `nvm use 24`, then retry. |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running | Start `mongod` with the fresh database directory. |
| `config.env` missing values | Secrets were not transferred | Copy the real file securely; never commit it. |
| `EACCES` on MongoDB data | Reusing the old root-owned `~/data/db` | Use `~/data/db-attendance-dev`. |
| Microphone permission fails on a phone | The page is HTTP, not HTTPS | Use `npm run start:shared` plus `cloudflared`. |
| Google sign-in fails on a tunnel | The tunnel origin is not registered | Add it to the OAuth client, or use the deployed site. |
| Render serves an older build | The deploy did not finish or is from another commit | Re-check the dashboard; do not test an older deploy. |

## 11. Boundaries that do not change on a new device

- Acoustic proof is evidence; attendance is teacher-confirmed and audited.
- The server mints every key. Phones never invent keys.
- One proof per student per wave; keys and key history stay server-side.
- PDF/timetable imports are extract → preview → teacher confirms.
- No automatic scoring, no ID round, no mobile app yet.
- The owner controls every push, tag, merge and deploy.
- Do not call Layer 1 measured-passed without the 5 m/10 m, reverse and muted-control results.
