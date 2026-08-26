# Directory guide

## `attendance-backend/`

| Path | Owns / why it exists | Key dependencies and consumers |
| --- | --- | --- |
| `index.js` | executable server bootstrap | imports `app` and `config/database`; used by npm start |
| `app.js` | Express middleware/order and route mounting | consumed by `index.js`; imports routes/error middleware |
| `config/` | Mongo connection and tracked runtime config | read by bootstrap/database module |
| `routes/` | public HTTP endpoint definitions | mounted by `app.js`; dispatch controllers |
| `controllers/` | request validation, auth/WebAuthn, code and room behavior | called by routes; uses models/utils |
| `models/` | User, Location, UniqueCode Mongoose schemas | called by controllers/auth middleware |
| `middleware/` | rejected-promise forwarding, error serialization, unused active auth guard | installed/imported by app/routes/controllers |
| `utils/` | custom error and token response utility | used by controllers/middleware |

Read `index.js`, `app.js`, all route files, `controllers/userController.js`, and their models first. `middleware/auth.js` exists but routes using it are commented out.

## `attendance-frontend/`

| Path | Owns / why it exists | Key dependencies and consumers |
| --- | --- | --- |
| `src/index.js` | browser React bootstrapping into `#root` | CRA HTML and `App` |
| `src/App.js` | full client route table | imported by index |
| `src/components/` | pages/components, direct HTTP/WebAuthn/geolocation behavior | imported by `App` or Home |
| `src/components/login/` | password and passkey registration/login UI | Express auth endpoints |
| `src/components/Mark/` | passkey auth and local room-coordinate check | code/room API and browser geolocation |
| `src/components/teacher/` | room setup and code lifecycle UI | room/code endpoints |
| `src/components/student/` | session check and static dashboard display | session endpoint |
| `src/assets/`, `public/` | visual assets and CRA HTML/PWA shell | UI/build output |

Defined client routes are `/`, `/login`, `/register`, `/admin/addRoom`, `/admin/takeAttendance`, `/markAttendance`, `/student-dashboard`, and `/teacher-dashboard`. Home links to `/help`, `/academic-calendar`, and `/privacy`, but no matching route appears in `App.js`.
