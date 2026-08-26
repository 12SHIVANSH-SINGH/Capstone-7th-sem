const mongoose = require("mongoose");

const roundTo8Decimals = (num) => parseFloat(num.toFixed(12));

const locationSchema = new mongoose.Schema({
    roomNo: {
        type: String,
        required: true
    },
    cor1_lat: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor1_long: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor2_lat: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor2_long: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor3_lat: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor3_long: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor4_lat: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    },
    cor4_long: {
        type: Number,
        required: true,
        set: roundTo8Decimals
    }
});

const Location = mongoose.model("Location", locationSchema);

module.exports = { Location }; // Use module.exports instead of export
