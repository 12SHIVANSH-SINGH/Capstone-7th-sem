const mongoose = require("mongoose");

// One short-lived challenge per WebAuthn ceremony. A TTL index removes stale
// rows even if the user abandons the browser prompt.
const webauthnChallengeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["registration", "authentication"],
      required: true,
    },
    challenge: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

webauthnChallengeSchema.index({ user: 1, kind: 1, createdAt: -1 });
webauthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("WebAuthnChallenge", webauthnChallengeSchema);
