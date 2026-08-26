# Running locally

## What is confirmed

The manifests establish the following commands. The current environment has Node `v22.13.0` and npm `10.9.2`; the repository declares no project-level Node/npm engine version, so its supported version is **UNKNOWN**.

| Location | Command | Evidence | Validation on 2026-08-22 |
| --- | --- | --- | --- |
| `attendance-backend` | `npm install` | `package.json` + lockfile | Not run: it downloads/writes dependencies. |
| `attendance-backend` | `npm start` | `scripts.start = node index.js` | Run before install; failed: `Cannot find module 'express'`. |
| `attendance-backend` | `npm test` | manifest | Run; intentionally fails with `Error: no test specified`. |
| `attendance-frontend` | `npm install` | manifest + lockfile | Not run: it downloads/writes dependencies. |
| `attendance-frontend` | `npm start` | manifest and CRA README | Script exists; not started (persistent server and dependencies absent). |
| `attendance-frontend` | `npm run build` | manifest and CRA README | Run before install; failed: `react-scripts: command not found`. |
| `attendance-frontend` | `npm test` | manifest and CRA README | Cannot run before dependency installation; expected tool is `react-scripts test`. |

## Evidence-backed setup procedure

1. Install Node/npm compatible with the dependencies. Exact supported versions are **UNKNOWN**; do not infer them from the local machine.
2. Obtain an accessible MongoDB URI and a secure JWT secret from the project owner. No usable values are supplied by the tracked backend config file.
3. From `attendance-backend`, install the locked dependencies:

   ```sh
   npm install
   ```

4. Make `config/config.env` usable. The code reads it relative to the backend working directory unless `NODE_ENV` equals exactly `PRODUCTION`.
5. Start the backend from that directory:

   ```sh
   npm start
   ```

6. From `attendance-frontend`, install the locked dependencies and start CRA:

   ```sh
   npm install
   npm start
   ```

CRA's committed README says its dev server uses `http://localhost:3000` and hot reload after installation. Backend CORS allows that origin.

## Important local-integration limitation

The frontend hard-codes `https://attendance-backend-ql7c.onrender.com/api/v1` in its API-using components. Starting the local backend does **not** by itself direct the checked-in frontend to it. The repository contains no front-end environment switch, proxy configuration, or documented local API configuration. How developers are expected to test frontend changes against a local API is **UNKNOWN** and needs maintainer confirmation.

## Prerequisites and lifecycle gaps

MongoDB is required at backend startup. No database initialization, migration, seed, debug, watch/development-server, production-serving, or normal shutdown command is committed. `index.js` handles uncaught exceptions/rejections by closing the HTTP server and exiting, but it has no `SIGINT`/`SIGTERM` handler. Stopping a foreground process with terminal interruption is operationally normal, but graceful cleanup behavior is **not repository-documented**.
