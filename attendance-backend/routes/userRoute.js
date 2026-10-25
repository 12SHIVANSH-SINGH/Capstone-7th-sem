const express = require('express');
const { logout, isAuth } = require('../controllers/userController');

const router = express.Router();

// Simple health probe used by deployments and the phone-test tunnel.
router.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
});

// Logout is a state change, so it is POST-only. A cross-site link or <img>
// must not be able to end a session; old GET clients get an explicit 405.
router.post('/logout', logout);
router.get('/logout', (req, res) => {
    res.set('Allow', 'POST');
    res.status(405).json({ success: false, message: 'Use POST to log out' });
});
router.route('/islogin').get(isAuth);

module.exports = router;
