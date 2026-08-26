// models/uniqueCodeModel.js
const mongoose = require('mongoose');

const uniqueCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  batch: {
    type: String,
    required: true
  },
  year: {
    type: String,
    required: true
  },
  course: {
    type: String,
    required: true
  },
  room: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('UniqueCode', uniqueCodeSchema);