//------for port from env file--------
const dotenv = require('dotenv');
// Only load the local file outside production, regardless of casing.
if (String(process.env.NODE_ENV || "").toLowerCase() !== "production") {
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

const app = require('./app');
const connectdatabase = require("./config/database");

app.get("/", (req, res) => {
    res.json("Hello");
});

connectdatabase();

const server = app.listen(process.env.PORT, () => {
    console.log(`server is working at http://localhost:${process.env.PORT}`);
});

//handling uncaught exception
process.on("uncaughtException", err => {
    console.log(`Error:${err.message}`);
    console.log("shutting down server due to uncaught error")
    server.close(() => {
        process.exit(1);
    })
})
//unhandled promise rejection
process.on("unhandledRejection", err => {
    console.log(`Error:${err.message}`);
    console.log("shutting down server due to unhandled error")
    server.close(() => {
        process.exit(1);
    })
})
