const mongoose = require("mongoose");

// Auxiliary writes (audit, notifications, attendance snapshots) should not
// block a request when the unit tests run without a database. Production
// always has a connected Mongoose instance before the listener starts.
const isDbReady = () => mongoose.connection.readyState === 1;

module.exports = { isDbReady };
