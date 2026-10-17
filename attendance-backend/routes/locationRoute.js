const express = require("express");

const { addlocation, loc, getRoom } = require("../controllers/locationController.js"); 
const isAuthenticated = require("../middleware/auth");

const router = express.Router();

router.post("/admin/addRoom", isAuthenticated, isAuthenticated.authorizeRoles("teacher"), addlocation);

router.post(`/getRoom`, getRoom);

module.exports = router; // Use module.exports instead of export default
