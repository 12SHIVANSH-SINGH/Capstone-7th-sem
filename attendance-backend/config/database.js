const mongoose = require('mongoose');
const dotenv = require('dotenv');
// Production uses real environment variables only, whatever the casing.
if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
dotenv.config({ path: "./config/config.env" });
}

/**
 * Open the shared Mongoose connection.
 *
 * The returned promise resolves once the connection is open and rejects with
 * the underlying error when it cannot be opened. Startup decides what to do
 * with that failure; this module never terminates the process itself.
 */
const connectdatabase = () => {
    const uri = process.env.DB_URI || process.env.MONGODB_URI;
    if (!String(uri || "").trim()) {
        return Promise.reject(new Error("DB_URI or MONGODB_URI is not configured"));
    }

    return mongoose.connect(uri).then((data) => {
        console.log(`mongodb connected with server:${data.connection.host}`);
        return data.connection;
    });
}

module.exports = connectdatabase
