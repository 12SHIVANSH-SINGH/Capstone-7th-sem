# Configuration

## Backend environment values

| Name | Confirmed code use | Supplied in `config/config.env`? |
| --- | --- | --- |
| `PORT` | Express listener port | yes |
| `DB_URI` | `mongoose.connect` URI | placeholder only |
| `JWT_SECRET` | sign/verify JWT | placeholder only |
| `JWT_EXPIRE` | JWT lifetime | yes |
| `COOKIE_EXPIRE` | token-cookie lifetime in days | yes |
| `NODE_ENV` | skips dotenv only when exactly `PRODUCTION` | no |
| `CLIENT_URL` | expected WebAuthn origin; production-looking default | no |
| `RP_ID` | WebAuthn relying-party ID; production-looking default | no |

The config file is tracked, and no separate example exists. Do not place real connection strings or secrets in new documentation. A usable `DB_URI` and `JWT_SECRET` must come from the project owner.

The backend CORS allow-list is hard-coded to `http://localhost:3000` and `https://attendance-frontend-sage.vercel.app`, allows credentials, and allows Content-Type/Authorization headers. Cookie creation uses `secure: true` and `sameSite: "none"`; exact local browser compatibility is unverified.

## Frontend configuration

No source `process.env` usage, proxy file, or committed frontend environment file exists. API base URLs are literal `https://attendance-backend-ql7c.onrender.com/api/v1` values in components. CRA-style local environment filenames are ignored, but that does not establish an active configuration contract.
