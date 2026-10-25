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

// The listener is only assigned after MongoDB and all model indexes are ready.
let server = null;

const shutDown = (kind, error) => {
    console.log(`Error:${error && error.message ? error.message : error}`);
    console.log(`shutting down server due to ${kind} error`);
    if (!server) {
        // Startup failed before the listener existed, so there is nothing to close.
        process.exit(1);
        return;
    }
    server.close(() => {
        process.exit(1);
    });
};

//handling uncaught exception
process.on("uncaughtException", err => shutDown("uncaught", err));
//unhandled promise rejection
process.on("unhandledRejection", err => shutDown("unhandled", err));

const app = require('./app');
const mongoose = require('mongoose');
const connectdatabase = require("./config/database");
const { startServer } = require("./utils/startServer");

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
