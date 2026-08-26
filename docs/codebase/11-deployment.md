# Deployment

No Dockerfile, Docker Compose file, Kubernetes/Helm manifest, CI workflow, Procfile, or deployment-platform configuration was found in either repository. Therefore the production deployment command, image, platform settings, secret injection, static hosting method, and SPA fallback are **UNKNOWN**.

Evidence of previously intended remote services is limited to literals: the frontend calls `attendance-backend-ql7c.onrender.com`, and backend CORS/WebAuthn defaults reference `attendance-frontend-sage.vercel.app`. These names do not prove current ownership, availability, or deployment workflow.

The only production-sensitive startup branch is `NODE_ENV === "PRODUCTION"`, which prevents the backend from loading `config/config.env`; external environment injection is then required but undocumented.
