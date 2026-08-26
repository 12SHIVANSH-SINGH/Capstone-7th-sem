const express = require("express");

const {generateCode, deleteCode,getCodeDetails } = require("../controllers/codeController"); 

const router = express.Router();

router.post("/genCode", generateCode);
router.post("/deleteCode", deleteCode);
router.post("/getCode", getCodeDetails);

module.exports = router; // Use module.exports instead of export default

