// CSRF guard for cookie-authenticated state changes.
//
// CORS is not an access control boundary: a cross-site HTML form can still POST
// to this API (and send the teacher's cookie) even though the browser refuses
// to expose the response. So every unsafe request is checked here before it
// reaches authentication or a controller that mutates state.
//
// Policy for POST / PUT / PATCH / DELETE:
//   * no Origin header -> allow (curl, server-to-server, tests). This is not a
//     browser cross-site request; those carry an Origin. A browser that omits
//     Origin but explicitly marks the request cross-site is still rejected.
//   * Origin equal to this request's own origin -> allow (single-service
//     hosting; req.protocol honours Express "trust proxy").
//   * Origin in the configured allow-list (CLIENT_URL / CLIENT_URLS and the
//     development defaults) -> allow (split frontend/API hosting).
//   * anything else -> 403 before any state change.
//
// Safe methods (GET / HEAD / OPTIONS) are untouched. They must not mutate
// state; logout is POST-only for exactly that reason.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SHARED_TUNNEL_ORIGIN = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

const normalizeOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();

const blocked = (res) =>
  res.status(403).json({
    success: false,
    message: "Cross-origin request blocked",
  });

const createOriginGuard = ({
  allowedOrigins = [],
  isProduction = false,
  allowSharedTunnel = !isProduction,
} = {}) => {
  const normalizedAllowed = new Set(
    Array.from(allowedOrigins).map(normalizeOrigin).filter(Boolean)
  );

  return function originGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");
    if (!origin) {
      // Modern browsers can describe a cross-site request even when a form
      // omits Origin. Do not reject plain no-Origin CLI/test traffic.
      if (String(req.get("sec-fetch-site") || "").toLowerCase() === "cross-site") {
        return blocked(res);
      }
      return next();
    }

    const normalizedOrigin = normalizeOrigin(origin);
    const host = req.get("host");
    const requestOrigin = host ? normalizeOrigin(`${req.protocol}://${host}`) : "";

    if (
      (requestOrigin && normalizedOrigin === requestOrigin) ||
      normalizedAllowed.has(normalizedOrigin) ||
      (allowSharedTunnel && SHARED_TUNNEL_ORIGIN.test(normalizedOrigin))
    ) {
      return next();
    }

    return blocked(res);
  };
};

module.exports = createOriginGuard;
module.exports.createOriginGuard = createOriginGuard;
module.exports.normalizeOrigin = normalizeOrigin;
module.exports.SAFE_METHODS = SAFE_METHODS;
