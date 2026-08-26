# Unknowns and maintainer questions

## Required to operate with confidence

1. Which Node/npm versions are supported and should be pinned?
2. Which MongoDB instance/database should local developers use, and how is it provisioned/reset?
3. What values should local `CLIENT_URL` and `RP_ID` use, and what is the approved way to point the frontend at a local backend?
4. What deployment platforms and commands are canonical for the two independent repositories?
5. What is the intended production configuration/secret-management mechanism?

## Required to understand product behavior

6. What action is intended to persist a student's attendance? No such model or endpoint is present.
7. Is passkey authentication, password authentication, or both the supported login route? `/register` omits required `name` and pre-hashes a password the model hashes again, while passkey auth does not issue a session token.
8. What access-control policy should protect room and code endpoints? No active route applies auth/role middleware.
9. What is the desired code-expiration/cleanup policy? Schema/controller conflict over `expiresAt`.
10. Are static dashboard records placeholders or expected product data?

## Engineering/process gaps

11. Where are tests and CI checks maintained, if outside these repositories?
12. What browser/device matrix and permission expectations apply to WebAuthn and geolocation?
13. What normal shutdown, logs, monitoring, alerts, backups, and incident procedures exist?
14. Are the tracked backend config file and hard-coded deployed URLs intentional and current?
