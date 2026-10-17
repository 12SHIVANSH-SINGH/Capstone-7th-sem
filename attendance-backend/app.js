const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

// Browser origins allowed to call this API with cookies.
// Add exact origins (deployments) with CLIENT_URLS=origin1,origin2 in config.env.
const defaultOrigins = [
  "http://localhost:3000", // React development server
  "http://127.0.0.1:3000", // Same server, alternate host name
  "https://attendance-frontend-sage.vercel.app", // Deployment inherited with the project
];
const allowedOrigins = new Set(
  [...defaultOrigins, process.env.CLIENT_URL, ...String(process.env.CLIENT_URLS || "").split(",")]
    .map((origin) => String(origin || "").trim().replace(/\/+$/, ""))
    .filter(Boolean)
);
// Shared quick tunnels used for phone testing get a fresh random host each run.
const sharedTunnelOrigin = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, the React development proxy, server-to-server.
      if (!origin) return callback(null, true);
      const normalisedOrigin = origin.replace(/\/+$/, "");
      if (allowedOrigins.has(normalisedOrigin) || sharedTunnelOrigin.test(normalisedOrigin)) {
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

const locationRoute = require('./routes/locationRoute');
app.use("/api/v1", locationRoute);
app.set('trust proxy', true); // Add this in your main Express config

const notes = require('./routes/userRoute');
app.use("/api/v1", notes);

const codeRoute = require('./routes/codeRoute');
app.use("/api/v1", codeRoute);

const classRoute = require('./routes/classRoute');
app.use("/api/v1", classRoute);

const googleAuthRoute = require('./routes/googleAuthRoute');
app.use("/api/v1", googleAuthRoute);

const errorMiddleware = require('./middleware/error');
app.use(errorMiddleware);

module.exports = app;
