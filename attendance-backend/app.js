const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
app.disable("x-powered-by");

// Minimal security headers. The microphone stays available to this origin
// because the acoustic lab needs it; camera and geolocation are not used.
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  next();
});

// Browser origins allowed to call this API with cookies.
// Add exact origins (deployments) with CLIENT_URLS=origin1,origin2 in config.env.
const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
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
app.use(express.json());

app.set('trust proxy', true); // Add this in your main Express config

const userRoute = require('./routes/userRoute');
app.use("/api/v1", userRoute);

const classRoute = require('./routes/classRoute');
app.use("/api/v1", classRoute);

const checkInSessionRoute = require('./routes/checkInSessionRoute');
app.use("/api/v1", checkInSessionRoute);

const googleAuthRoute = require('./routes/googleAuthRoute');
app.use("/api/v1", googleAuthRoute);

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
  app.use(express.static(frontendBuild));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(frontendBuild, 'index.html'));
  });
}

const errorMiddleware = require('./middleware/error');
app.use(errorMiddleware);

module.exports = app;
