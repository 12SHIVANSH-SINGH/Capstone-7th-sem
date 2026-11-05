/**
 * Content-Security-Policy for the single-service deployment.
 *
 * The React build is served from this origin, so the policy can stay tight:
 * only our own bundles, Google Identity Services, and the browser workers the
 * acoustic lab and offline shell need. Scripts are never inline; the dark
 * theme bootstrap lives in public/theme-init.js instead of index.html.
 *
 * React writes inline style attributes, so style-src keeps 'unsafe-inline'.
 * That is weaker than a nonce-based style policy but still materially better
 * than allowing inline scripts, which are the path an XSS payload needs to
 * call the device-signing function.
 */
const isProduction = (env = process.env) =>
  String(env.NODE_ENV || "").trim().toLowerCase() === "production";

const buildCsp = (env = process.env) => {
  const production = isProduction(env);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' https://accounts.google.com",
    // React writes inline style attributes, and Google Identity Services
    // injects its own button stylesheet from accounts.google.com.
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://accounts.google.com",
    "frame-src https://accounts.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    production ? "upgrade-insecure-requests" : null,
  ]
    .filter(Boolean)
    .join("; ");
};

module.exports = { buildCsp, isProduction };
