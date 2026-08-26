# Repository overview

## Confirmed inventory

The workspace root is not a Git repository and has no root manifest, README, Makefile, or orchestration configuration. It contains two clean, independent Git repositories:

| Directory | Purpose established by source | Entry point |
| --- | --- | --- |
| `attendance-backend/` | CommonJS Node.js Express API, with Mongoose persistence, JWT/cookie auth, WebAuthn ceremonies, room boundaries, and attendance codes. | `index.js`, invoked by `npm start` |
| `attendance-frontend/` | Create React App browser single-page UI for login/register, dashboards, room setup, code handling, and client-side location verification. | `src/index.js`, invoked by `npm start` |

Both use npm (`package.json` and `package-lock.json`); neither currently has `node_modules` checked out. The source languages are JavaScript, JSX, CSS, HTML, JSON, and an SVG asset. No TypeScript is present.

The backend package name is `hotel_management`, while directories and UI evidence use attendance terminology. The canonical product name is **UNKNOWN**.

## Technologies identified from manifests and imports

- Backend: Node CommonJS, Express 4, MongoDB via Mongoose 8, dotenv, cookie-parser, CORS, JSON Web Token, bcryptjs, and `@simplewebauthn/server`.
- Frontend: React 19, React DOM, React Router, Create React App / `react-scripts`, Axios, browser `fetch`, and `@simplewebauthn/browser`.
- Database: MongoDB is confirmed by `mongoose.connect(process.env.DB_URI)`. Provider, database name, credentials, migrations, and seed data are **UNKNOWN**.
- Browser APIs: WebAuthn and Geolocation are used by source code.

No CI/CD, Docker/Compose, Kubernetes, Infrastructure-as-Code, Makefile, migration, seed, lint, format, typecheck, cache, queue, or active scheduler configuration is represented in the checkout.

## Generated and non-source material

`node_modules`, frontend `build`, frontend `coverage`, local CRA environment files, logs, and VCS internals are ignored/generated categories. They were not analyzed as application source. `package-lock.json` files are dependency-resolution lockfiles, not hand-authored runtime logic. Public image files and CSS are UI assets/presentation; important runtime behavior is in JavaScript/JSX.
