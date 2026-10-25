/**
 * Small shared routing helpers for signed-in UI.
 *
 * The server owns the session; the browser only needs to know which dashboard
 * to open for the role it returned from /islogin. Keeping the mapping here
 * stops the landing page, login page and app-shell logo from drifting apart.
 */

const dashboardPath = (role) => (role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");

module.exports = { dashboardPath };
