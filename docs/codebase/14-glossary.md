# Glossary

- **Code** — a six-digit `UniqueCode` value associated with batch, year, course, and room.
- **Location/room boundary** — `Location` document holding a room number and four coordinate pairs.
- **Passkey** — WebAuthn credential stored under `User.passKey`.
- **RP ID** — WebAuthn relying-party ID (`RP_ID`).
- **CLIENT_URL** — expected WebAuthn browser origin in backend controller configuration.
- **Token cookie** — `token` JWT set by traditional/password login/registration and WebAuthn registration response utility.
- **Mark flow** — frontend sequence that authenticates a passkey, looks up code/room data, obtains browser location, and displays local bound-check result. It is not evidence of persisted attendance.
