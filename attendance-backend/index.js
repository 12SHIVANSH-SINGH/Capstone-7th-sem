//------for port from env file--------
const dotenv = require('dotenv');
// Only load the local file outside production, regardless of casing.
if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
    dotenv.config({ path: "./config/config.env" });
}

// Load environment values before importing routes/controllers that read them.
const { assertSafeDevConfiguration } = require('./utils/devAuth');
const { assertSafeTestAccountConfig } = require('./utils/signInPolicy');
const { assertProductionEnv } = require('./utils/validateEnv');
try {
    assertProductionEnv();
    assertSafeDevConfiguration();
    assertSafeTestAccountConfig();
} catch (error) {
    console.error(`Refusing to start: ${error.message}`);
    process.exit(1);
}

// Load the app (and every route/model) before registering shutdown handlers,
// so a signal that arrives during startup can still close Mongoose cleanly.
const app = require('./app');
const mongoose = require('mongoose');
const connectdatabase = require("./config/database");
const { startServer } = require("./utils/startServer");

// The listener is only assigned after MongoDB and all model indexes are ready.
let server = null;
let shuttingDown = false;

const closeResources = async () => {
    try {
        // false: do not wait for background index builds; the listener is gone.
        await mongoose.connection.close(false);
    } catch (error) {
        console.error(`Error closing MongoDB: ${error.message}`);
    }
};

const shutDown = (kind, error, exitCode = 1) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (error) console.error(`Error: ${error.message || error}`);
    console.log(`shutting down server due to ${kind}`);

    const finish = () => {
        closeResources().finally(() => process.exit(exitCode));
    };

    if (!server) {
        // Startup failed before the listener existed, so there is nothing to close.
        finish();
        return;
    }

    // Stop accepting connections, let in-flight requests finish, then close
    // the database. A stuck keep-alive connection must not block the deploy.
    const forceTimer = setTimeout(() => {
        console.error("Forcing shutdown after 10s");
        process.exit(exitCode);
    }, 10_000);
    forceTimer.unref();
    server.close(() => {
        clearTimeout(forceTimer);
        finish();
    });
    if (typeof server.closeIdleConnections === "function") {
        server.closeIdleConnections();
    }
};

//handling uncaught exception
process.on("uncaughtException", err => shutDown("uncaught", err));
//unhandled promise rejection
process.on("unhandledRejection", err => shutDown("unhandled", err));
// Render sends SIGTERM on deploy/restart; Ctrl-C sends SIGINT locally.
process.on("SIGTERM", () => shutDown("SIGTERM", null, 0));
process.on("SIGINT", () => shutDown("SIGINT", null, 0));

app.get("/", (req, res) => {
    res.json("Hello");
});

/**
 * Build every registered model's indexes and wait for the builds to finish.
 * app.js has already loaded all routes and their models at this point, so
 * mongoose.modelNames() covers proof/session indexes and the rest.
 */
const initIndexes = async () => {
    const modelNames = mongoose.modelNames();
    await Promise.all(modelNames.map((name) => mongoose.model(name).init()));
    return modelNames;
};

const start = async () => {
    const startedServer = await startServer({
        connect: connectdatabase,
        initIndexes,
        listen: () =>
            app.listen(process.env.PORT, () => {
                console.log(`server is working at http://localhost:${process.env.PORT}`);
            }),
        logger: console,
    });
    if (startedServer) {
        server = startedServer;
    }
};

start().catch((error) => {
    console.error(`Refusing to start: ${error.message}`);
    process.exit(1);
});
