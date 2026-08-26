# Newcomer guide

## First 30 minutes

1. Read `attendance-backend/index.js`, `app.js`, and `config/database.js` for process assembly.
2. Read `attendance-frontend/src/index.js` and `App.js` for browser bootstrapping and routes.
3. Read backend routes, then `userController.js`, `codeController.js`, and `locationController.js` alongside their models.
4. Read `Login.jsx`, `Register.jsx`, `Mark.jsx`, `addRoom.jsx`, and `takeAttendance.jsx`; these own the actual client integrations.
5. Read [15-unknowns-and-open-questions.md](15-unknowns-and-open-questions.md) before assuming this is a complete attendance system.

## First 2 hours

Map `route → controller → model` for each endpoint and `App route → component → remote call` for the UI. Follow a passkey registration, code generation, room lookup, and mark flow in [runtime flows](05-runtime-flows.md). Identify that dashboards contain static data and no attendance record is persisted by available source.

## Before first change

Obtain maintainer answers about MongoDB, local API targeting, supported auth flow, code expiry, and required access control. Then install dependencies, make backend config usable, and run the relevant frontend build/test command. No existing tests cover behavior, so define verification before making a high-impact change.

## Where changes belong

| Desired change | Read/change area first |
| --- | --- |
| API route/response | backend `routes`, controller, model; every direct-calling frontend component |
| login/passkeys | `userController.js`, `userModels.js`, login/register/Mark components |
| rooms/location | location controller/model and `addRoom` / `Mark` components |
| attendance codes | code controller/model and `takeAttendance` / `Mark` components |
| browser navigation | `src/App.js` and relevant page |

Avoid initially touching authentication, JWT/cookies, WebAuthn RP settings, code expiry, and location logic without an agreed test plan; each has source-evidenced gaps or security impact.

## Daily commands

Use `npm start` in each respective repository after installation; `npm run build` and `npm test` belong to the frontend. Backend `npm test` is only a failing placeholder. See [running locally](02-running-locally.md) for validation status and blockers.
