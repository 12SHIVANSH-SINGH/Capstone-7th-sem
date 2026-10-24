const mongoose = require('mongoose');
const dotenv = require('dotenv');
// Production uses real environment variables only, whatever the casing.
if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
dotenv.config({ path: "./config/config.env" });
}

const connectdatabase = () => {
    const uri = process.env.DB_URI || process.env.MONGODB_URI;
    mongoose.connect(uri).then((data) => {
        console.log(`mongodb connected with server:${data.connection.host}`);
    }).catch((error) => {
        console.error(`MongoDB connection failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = connectdatabase