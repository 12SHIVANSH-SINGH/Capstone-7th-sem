const express = require('express');
const { logout, isAuth, getProfile, updateProfile, revokeSessions } = require('../controllers/userController');
const isAuthenticated = require('../middleware/auth');
const { isDbReady } = require('../utils/dbReady');

const router = express.Router();

// Cheap liveness probe. It deliberately stays green while the process is up,
// so a restart loop and a database outage are distinguishable in monitoring.
router.get('/health', (req, res) => {
    res.status(200).json({ success: true, status: 'ok' });
});

// Readiness means the API can serve data, not just accept a TCP connection.
// Render can use this to avoid routing traffic before MongoDB is connected.
router.get('/health/ready', (req, res) => {
    const database = isDbReady();
    res.status(database ? 200 : 503).json({
        success: database,
        status: database ? 'ready' : 'not-ready',
        checks: { database },
    });
});

// Logout is a state change, so it is POST-only. A cross-site link or <img>
// must not be able to end a session; old GET clients get an explicit 405.
router.post('/logout', logout);
router.get('/logout', (req, res) => {
    res.set('Allow', 'POST');
    res.status(405).json({ success: false, message: 'Use POST to log out' });
});
router.route('/islogin').get(isAuth);
router.get('/profile', isAuthenticated, getProfile);
router.patch('/profile', isAuthenticated, updateProfile);
router.post('/profile/sessions/revoke', isAuthenticated, revokeSessions);

module.exports = router;
