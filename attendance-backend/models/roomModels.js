const mongoose = require("mongoose");

// A room is just a name now. The legacy GPS Room-corners model (locationModels)
// was removed with the local-device GPS flow; attendance is verified by
// near-ultrasonic key tones instead.
const roomSchema = new mongoose.Schema(
  {
    roomNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 40,
    },
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = { Room };
