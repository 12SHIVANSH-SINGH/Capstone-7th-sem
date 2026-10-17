// One-off dev migration (2026-10-17): copy legacy GPS rooms (locations
// collection) into the new Room collection and repoint classes at the new
// room documents. Safe to re-run: it reuses rooms that already exist.
//
// Usage: node scripts/migrate-rooms.js
require("dotenv").config({ path: "./config/config.env" });
const mongoose = require("mongoose");
const { Room } = require("../models/roomModels");

(async () => {
  await mongoose.connect(process.env.DB_URI);
  const db = mongoose.connection.db;

  const locations = await db.collection("locations").find({}).toArray();
  console.log(`legacy locations found: ${locations.length}`);

  for (const loc of locations) {
    let room = await Room.findOne({ roomNo: loc.roomNo });
    if (!room) {
      room = await Room.create({ roomNo: loc.roomNo });
      console.log(`  created room ${loc.roomNo}`);
    }
    const res = await db.collection("courseclasses").updateMany(
      { defaultRoom: loc._id },
      { $set: { defaultRoom: room._id } }
    );
    console.log(`  ${loc.roomNo}: ${res.modifiedCount} class(es) repointed`);
  }

  const roomCount = await Room.countDocuments({});
  const classCount = await db.collection("courseclasses").countDocuments({});
  console.log(`done. rooms=${roomCount} classes=${classCount}`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
