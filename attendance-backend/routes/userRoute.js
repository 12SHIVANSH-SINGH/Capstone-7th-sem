const express = require('express');
const { logout, isAuth } = require('../controllers/userController');

const router = express.Router();

// Simple health probe used by deployments and the phone-test tunnel.
router.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
});

router.route('/logout').get(logout);
router.route('/islogin').get(isAuth);

module.exports = router;
