const mongoose = require("mongoose");

const adminPasskeySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Base64URL credential id from the authenticator.
    credentialId: { type: String, required: true, unique: true },
    // Base64URL-encoded public key. The private key never leaves the device.
    publicKey: { type: String, required: true },
    counter: { type: Number, default: 0, min: 0 },
    transports: [{ type: String }],
    deviceType: { type: String, default: "" },
    backedUp: { type: Boolean, default: false },
    lastUsedAt: Date,
  },
  { timestamps: true }
);

adminPasskeySchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model("AdminPasskey", adminPasskeySchema);
