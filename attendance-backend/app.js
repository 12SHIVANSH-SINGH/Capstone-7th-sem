const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { buildCsp } = require('./utils/csp');

const app = express();
app.disable("x-powered-by");

const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

// Minimal security headers. The microphone and browser geolocation stay
// available to this origin: the acoustic lab needs audio, and an attendance
// query can attach a one-shot location snapshot. Camera stays disabled.
app.use((req, res, next) => {
  res.set("Content-Security-Policy", buildCsp());
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), geolocation=(self), microphone=(self)");
  res.set("X-Permitted-Cross-Domain-Policies", "none");
  res.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  // Render terminates TLS and forwards HTTP here. HSTS is only sent in
  // production so local HTTP development is never pinned to HTTPS.
  if (isProduction) {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// API responses carry sessions, keys and evidence. A shared cache must never
// keep them, regardless of which route answered. Route-level no-store remains
// for direct router tests.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Browser origins allowed to call this API with cookies.
// Add exact origins (deployments) with CLIENT_URLS=origin1,origin2 in config.env.
// Localhost is a development origin. A production process must list its
// frontend origin explicitly; single-service hosting needs no origin at all.
const defaultOrigins = isProduction
  ? []
  : [
      "http://localhost:3000", // React development server
      "http://127.0.0.1:3000", // Same server, alternate host name
    ];
const allowedOrigins = new Set(
  [...defaultOrigins, process.env.CLIENT_URL, ...String(process.env.CLIENT_URLS || "").split(",")]
    .map((origin) => String(origin || "").trim().replace(/\/+$/, ""))
    .filter(Boolean)
);
// Quick tunnels used during phone testing get a fresh random host each run.
// They are allowed only outside production; a production deployment must list
// its exact frontend origin in CLIENT_URLS.
const sharedTunnelOrigin = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, the React development proxy, server-to-server.
      if (!origin) return callback(null, true);
      const normalisedOrigin = origin.replace(/\/+$/, "");
      if (
        allowedOrigins.has(normalisedOrigin) ||
        (!isProduction && sharedTunnelOrigin.test(normalisedOrigin))
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // Allow credentials (cookies, headers)
  })
);

app.use(cookieParser());
// JSON stays tightly bounded. The one document upload is a roster PDF on an
// authenticated teacher route; multer caps it at 10 MB and keeps it in memory
// only for deterministic text extraction.
app.use(express.json({ limit: "200kb" }));

// Render terminates TLS at exactly one proxy hop. Trusting every hop would let
// a client spoof X-Forwarded-For and defeat IP-based rate limiting.
app.set('trust proxy', 1);

// Cookie-authenticated mutations must come from this API's own origin or an
// explicitly configured frontend. CORS alone does not stop a cross-site form
// POST; this guard does, before authentication or state changes run.
const createOriginGuard = require('./middleware/originGuard');
app.use(createOriginGuard({ allowedOrigins, isProduction }));

const userRoute = require('./routes/userRoute');
app.use("/api/v1", userRoute);

const classRoute = require('./routes/classRoute');
app.use("/api/v1", classRoute);

const checkInSessionRoute = require('./routes/checkInSessionRoute');
app.use("/api/v1", checkInSessionRoute);

const googleAuthRoute = require('./routes/googleAuthRoute');
app.use("/api/v1", googleAuthRoute);

const attendanceRoute = require('./routes/attendanceRoute');
app.use("/api/v1", attendanceRoute);

const queryRoute = require('./routes/queryRoute');
app.use("/api/v1", queryRoute);

const notificationRoute = require('./routes/notificationRoute');
app.use("/api/v1", notificationRoute);

const timetableRoute = require('./routes/timetableRoute');
app.use("/api/v1", timetableRoute);

const exportRoute = require('./routes/exportRoute');
app.use("/api/v1", exportRoute);

const adminRoute = require('./routes/adminRoute');
app.use("/api/v1", adminRoute);

// One-click dev identities exist only when NODE_ENV=development|test AND
// DEV_AUTH_ENABLED=true. A production process never mounts these routes.
const { isDevAuthEnabled } = require('./utils/devAuth');
if (isDevAuthEnabled()) {
  const devAuthRoute = require('./routes/devAuthRoute');
  app.use("/api/v1", devAuthRoute);
}

// Optional single-service hosting: when the React production build exists next
// to the backend, serve it from the same origin as the API. This keeps cookies
// same-site and prevents frontend/backend deployments from drifting apart.
const path = require('path');
const fs = require('fs');
const frontendBuild = path.join(__dirname, '..', 'attendance-frontend', 'build');
if (fs.existsSync(path.join(frontendBuild, 'index.html'))) {
  // CRA puts content-hashed bundles under static/, so those can be cached
  // forever. index.html must stay revalidated or a new deploy is invisible.
  const staticDir = path.join(frontendBuild, 'static') + path.sep;
  app.use(
    express.static(frontendBuild, {
      setHeaders(res, filePath) {
        res.set(
          "Cache-Control",
          filePath.startsWith(staticDir)
            ? "public, max-age=31536000, immutable"
            : "no-cache"
        );
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // Deep links return the shell; the shell must be checked before each load.
    res.set("Cache-Control", "no-cache");
    return res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

const errorMiddleware = require('./middleware/error');
app.use(errorMiddleware);

module.exports = app;
