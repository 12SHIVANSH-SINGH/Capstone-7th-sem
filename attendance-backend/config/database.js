const mongoose = require('mongoose');
const dotenv = require('dotenv');
if (process.env.NODE_ENV !== "PRODUCTION") {
dotenv.config({ path: "./config/config.env" });
}

const connectdatabase = () => {
    mongoose.connect(process.env.DB_URI).then((data) => {
        console.log(`mongodb connected with server:${data.connection.host}`);
    })
}

module.exports = connectdatabase