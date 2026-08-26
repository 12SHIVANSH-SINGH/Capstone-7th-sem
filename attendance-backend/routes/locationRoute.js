const express = require("express");

const { addlocation, loc, getRoom } = require("../controllers/locationController.js"); 

const router = express.Router();

router.post("/admin/addRoom", addlocation);

router.post(`/getRoom`, getRoom);

module.exports = router; // Use module.exports instead of export default

