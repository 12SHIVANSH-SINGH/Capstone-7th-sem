const isProduction = (env = process.env) =>
  String(env.NODE_ENV || "").trim().toLowerCase() === "production";

const normaliseOrigin = (value) => String(value || "").trim().replace(/\/+$/, "");

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map(normaliseOrigin)
    .filter(Boolean);

const localOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4000",
  "http://127.0.0.1:4000",
];

/**
 * Expected WebAuthn origins come from server-side configuration, never from
 * a request header. A forged Origin header must not be able to redefine the
 * origin that the assertion is checked against.
 *
 * Precedence: WEBAUTHN_ORIGINS, then CLIENT_URL(S) (split hosting), then
 * Render's generated external URL (single service), then localhost in
 * development. `RENDER_EXTERNAL_URL` is set by Render automatically.
 */
const configuredOrigins = (env = process.env) => {
  const explicit = splitList(env.WEBAUTHN_ORIGINS);
  const clients = [
    ...splitList(env.CLIENT_URL),
    ...splitList(env.CLIENT_URLS),
  ];
  const render = splitList(env.RENDER_EXTERNAL_URL);
  const origins = explicit.length
    ? explicit
    : clients.length
    ? clients
    : render.length
    ? render
    : isProduction(env)
    ? []
    : localOrigins;

  return [...new Set(origins.map(normaliseOrigin).filter(Boolean))];
};

const rpIdFor = (env = process.env) => {
  const configured = String(env.WEBAUTHN_RP_ID || "").trim().toLowerCase();
  if (configured) return configured;
  const origins = configuredOrigins(env);
  if (!origins.length) return "";
  try {
    return new URL(origins[0]).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
};

const rpName = (env = process.env) =>
  String(env.WEBAUTHN_RP_NAME || "").trim() || "Bio Attend";

const webauthnConfig = (env = process.env) => ({
  origins: configuredOrigins(env),
  rpID: rpIdFor(env),
  rpName: rpName(env),
});

module.exports = {
  configuredOrigins,
  isProduction,
  nonProductionOrigins: localOrigins,
  normaliseOrigin,
  rpIdFor,
  rpName,
  webauthnConfig,
};
