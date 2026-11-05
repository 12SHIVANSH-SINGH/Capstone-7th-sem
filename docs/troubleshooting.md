# Troubleshooting

For production-only failures (Render, Atlas, OAuth origins, rollback), see
[deployment.md](deployment.md). For the full page/API list and access rules, see
[routes.md](routes.md).

## Setup

**"Cannot find module …" when starting**
Dependencies are not installed. Run `npm install` inside `attendance-backend/` and
`attendance-frontend/`.

**Backend will not start / database errors**
Check that MongoDB is running (step 3 of [getting started](getting-started.md)) and that
`attendance-backend/config/config.env` exists with real values. That file is gitignored —
ask the project owner. Startup must print the MongoDB connection, `MongoDB indexes are
ready`, then `server is working`. If an index cannot build, it exits on purpose.

**Node version error**
Node 22.13 or newer (or 24+) is required; PDF.js 6 will not load on older Node 22 builds.
Check `node -v` and the Render `NODE_VERSION`.

**"Port 3000/4000 already in use"**

```bash
lsof -tiTCP:3000 | xargs kill    # or 4000
```

## Sign-in and access

**Google says "Access blocked" for a test account**
That Gmail is not on the Google Cloud OAuth consent screen's **Test users** list while the
app is in Testing. Add it there, or sign in with the college account. With the local OAuth
client, sign-in only works from `http://localhost:3000`; the deployed site uses its own
authorized origin.

**Super-admin signs in but lands on the student or teacher dashboard**
The signed-in address must exactly match `SUPER_ADMIN_EMAILS` on the running backend, and
it must not also be in `TEACHER_EMAILS` or a `TEST_*` list (startup rejects overlaps). Fix
the environment, restart/redeploy, then sign out and back in. An empty list logs
"SUPER_ADMIN_EMAILS is empty; no account can open /admin".

**The Gmail owner is missing from the Google account chooser**
`REACT_APP_GOOGLE_HOSTED_DOMAIN` is probably set to `nitjsr.ac.in`, which filters the
chooser to that Workspace domain. Clear it (empty or unset), rebuild the frontend and
redeploy; it is baked in at build time. Server allowlists still decide access after Google
returns the identity.

**`/admin` works in development but not after deploying**
Confirm `SUPER_ADMIN_EMAILS=12shivanshsingha@gmail.com` and
`SUPER_ADMIN_SESSION_HOURS=12` are on the **backend** service, and the frontend was built
with the hosted-domain hint empty. Admin sessions are intentionally short (12 hours by
default); sign in again if expired. Demo controls are hidden in production by design and
demo endpoints return 404.

**A page returns 401**
No session, an expired session, a disabled account, or a session that no longer satisfies
the environment allowlist. Sign in again. After a `JWT_SECRET` change, every old session is
invalid.

**A page returns 403**
The session is valid but the role or class ownership is wrong. Teacher-owned class routes
do not accept a super-admin; use the `/admin` console for cross-teacher actions. A student
can only read their own queries and records.

**A destructive admin action returns 428 `step_up_required`**
The super-admin session is valid but has no recent passkey approval. Open **Admin →
Security**, register a passkey if needed, then retry the action and approve the browser
prompt. The approval cookie lasts five minutes. If the browser cannot create a passkey, use
a current Chrome, Edge, Safari or Firefox build over HTTPS (or localhost) and confirm
`WEBAUTHN_ORIGINS` matches the console's exact origin.

**The passkey prompt is cancelled, times out or says the origin is wrong**
`NotAllowedError`/`AbortError` means the prompt was dismissed or timed out; retry and approve
it. `SecurityError` means the page origin does not match the server's WebAuthn origin.
`InvalidStateError` means that passkey is already registered on this account — register a
different one or use the existing passkey. A super-admin cannot self-recover from lost
passkeys; see [deployment.md](deployment.md#passkey-recovery).

**Exports return 429**
Exports are limited to 30 downloads per 10 minutes per account/IP, and every download is
audited. Wait for the window to reset. If several people share one IP, expect the shared
bucket to fill faster.

**Roster PDF upload returns `pdf_no_text_layer`**
The PDF is a scan or has no embedded text layer. Use CSV/paste for now; local OCR is not
built. A password-protected PDF returns `pdf_password_protected`, a damaged/non-PDF file
returns `pdf_invalid` or `pdf_unreadable`, a file over 10 MB returns `pdf_too_large`, and a
document over 20 pages or 200,000 characters is refused rather than partially imported.

**Roster PDF upload returns 429**
PDF extraction is limited to 20 requests per 10 minutes per account/IP. Wait for the window
to reset. The limit is in-memory on the single Render instance.

**PDF extraction worked but the roster is wrong**
Extraction only fills the editable text box. Correct the rows, run **Preview roster** and
check the validation errors before **Save roster**. A saved roster still needs the separate
confirmation step; extraction itself never writes enrollments. Real college PDF layouts are
unvalidated until sample documents are supplied.

**PDF upload returns 401 or 404**
The session expired, the caller is not a teacher, or the class is not owned by that teacher.
Sign in again and open the class from **Classes**.

**`/health/ready` returns 503**
The process is alive but MongoDB is not connected. Check `DB_URI`, Atlas network access and
the startup log. `/health` staying 200 while `/health/ready` is 503 is the intended split
between liveness and readiness.

**The audit chain verification reports a break**
Stop changing audit data and restore from a known-good encrypted backup. Break details name
the first bad `seq` and whether the stored hash or link is wrong; legacy rows written before
P1 are counted separately and do not fail verification. Do not edit audit rows to "fix" the
chain.

**A student is rejected at sign-in**
Their email is not on an active roster and is not in `TEST_STUDENT_EMAILS`. Add the college
account to the roster, or configure the exact Gmail test address. If it is a changed
device, the student is signed in but must wait for teacher approval.

**Test teacher still gets student access**
The address is in `TEST_STUDENT_EMAILS`, not `TEST_TEACHER_EMAILS`. Move it to the teacher
list and restart; startup rejects an address that is in both.

**A removed test account still has access**
Removing it from `TEST_*_EMAILS` blocks new sign-ins and rejects the old session on its next
request. The stored user row keeps its role; delete or demote it if that matters.

**Server refuses to start with an `*_EMAILS` error**
A list has a malformed, duplicate or `@dev.invalid` address, an overlap, a college address
in a test list, a Gmail in `TEACHER_EMAILS`, or more than 10 entries in a test list. Fix
the variable and restart.

## Check-in, evidence and attendance

**Microphone does not start**
It needs HTTPS (or localhost), Chrome, microphone permission and a user tap. Close other
audio apps and keep the tab visible. On a phone, use the Cloudflare tunnel; a LAN IP is not
a secure origin.

**The tunnel link stopped working**
Cloudflare quick tunnels get a new random URL each run and die when the laptop sleeps or
the command stops. Re-run `cloudflared tunnel --url http://localhost:3000` and use the new
link.

**"Advance wave" is disabled or returns 409**
The current wave has no accepted evidence yet, the session is closed, or another tab
advanced first. Keep the current key playing, confirm a phone submitted, and reload before
retrying. Advance only after phones have had time to submit.

**The evidence card is empty**
Evidence is per session. Confirm the teacher screen is showing the live session (or the
correct closed session from history), the student joined after the session started, and
their account is on the class roster with an approved device. Exact retries do not add a
second row. A phone still listening for an old key is refused.

**The student page says the key expired or the wave changed**
A wave key lives two minutes. Ask the teacher to advance/replay the current wave, then tap
**Join** again. The old frame is deliberately rejected.

**The register is missing a student**
Only active roster rows become attendance rows. Check the roster and enrollment status,
and that the student belongs to this class, not another section.

**A student cannot raise a query**
Queries open when the teacher **closes** the session and stay open for 24 hours; the
finalisation step is separate. Pending rows are not absences. Expired queries stay
reviewable, and a teacher can reopen one with an audit note.

**Exports are empty or 403**
Exports use the same records as the screen and are restricted to staff. Pick the correct
class and date range; a teacher only exports their own classes, while a super-admin can
export across teachers. User and audit workbooks are super-admin-only.

**Demo data is missing**
Demo controls appear only outside production and only for a super-admin. Check
`NODE_ENV`, the `SUPER_ADMIN_EMAILS` grant and the System Settings demo toggle. The
production API returns **404** for `/admin/demo/*`.

## Frontend and deployment

**A random URL shows "404 — This page doesn't exist"**
That is expected; unknown client routes render the 404 page.

**The deployed site still looks old after a redeploy**
Hashed `static/` assets are cached aggressively and `index.html` is revalidated, so a normal
reload should pick up the new shell. Confirm the new `main.*.js` hash is being served and
hard-reload. `REACT_APP_*` values are baked in at build time; changing one requires a new
build, not just a restart.

**Static app loads but API calls fail after a split deployment**
The CSRF origin guard needs the exact frontend origin in `CLIENT_URLS` (comma separated, no
trailing slash). Same-origin hosting is automatic. See
[deployment.md](deployment.md).
