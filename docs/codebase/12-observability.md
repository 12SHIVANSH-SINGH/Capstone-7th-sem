# Observability

The checked-out backend logs database connection and process-level failures with `console.log`, and logs one WebAuthn verification error with `console.error`. Error middleware returns JSON `{success:false, message}` for selected errors. There is no committed structured logging, correlation/request ID, metrics, tracing, health-check framework, alerting, audit log, or external error-reporting integration.

`GET /` returns JSON `"Hello"` and `GET /api/v1/` returns a CORS-related string, but neither is documented or implemented as a health contract. Treat health checks, SLOs, dashboards, and alert ownership as **UNKNOWN**.
