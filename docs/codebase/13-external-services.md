# External services and browser capabilities

| Dependency/capability | Confirmed use | Unknowns |
| --- | --- | --- |
| MongoDB | Mongoose connects using `DB_URI`; models read/write User, Location, UniqueCode. | provider, database, access, backups, initialization |
| WebAuthn/passkeys | SimpleWebAuthn server/browser packages conduct registration/authentication. | supported devices/browsers, canonical origin/RP config |
| Browser Geolocation | room setup captures four points; marking reads current location. | permission policy and operational accuracy requirements |
| Remote API domain | frontend literals call a Render-looking HTTPS host. | service ownership/current state/deployment process |
| Remote frontend domain | backend CORS and WebAuthn defaults reference a Vercel-looking host. | service ownership/current state/deployment process |

No payment, email, object storage, analytics, cache, message broker, or third-party identity provider integration is evidenced by active source imports.
