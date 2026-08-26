# Debugging

## Observed validation failures

- Backend `npm start` before installation: `Cannot find module 'express'` from `app.js`. Install dependencies first.
- Frontend `npm run build` before installation: `react-scripts: command not found`. Install dependencies first.
- Backend `npm test`: expected placeholder failure; this does not run a test suite.

## Source-backed checks

1. Start backend from `attendance-backend`, not the workspace root, because dotenv uses `./config/config.env` relative to the process directory.
2. Confirm `DB_URI`, `JWT_SECRET`, and `PORT` are supplied. Placeholder DB/JWT values cannot start a usable backend.
3. Check MongoDB reachability if startup prints no successful connection log. Connection is initiated but not awaited/caught in its local module.
4. For passkey failures, inspect `CLIENT_URL` and `RP_ID` against the browser origin/relying-party requirements. Defaults are deployed-domain values, not local values.
5. For browser auth failures, inspect the credentialed request/cookie behavior and the hard-coded CORS origins. `secure` cookies and WebAuthn require suitable browser/transport conditions.

No source-backed debug endpoint, request ID, metrics dashboard, tracing system, or structured logging integration exists.
