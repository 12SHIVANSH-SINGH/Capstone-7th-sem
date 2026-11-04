/**
 * Small shared routing helpers for signed-in UI.
 *
 * The server owns the session; the browser only needs to know which dashboard
 * to open for the role it returned from /islogin. Keeping the mapping here
 * stops the landing page, login page and app-shell logo from drifting apart.
 */

const dashboardPath = (role) => {
  if (role === "superadmin") return "/admin";
  if (role === "teacher") return "/teacher-dashboard";
  return "/student-dashboard";
};

const roleLabel = (role) => {
  if (role === "superadmin") return "Super admin";
  if (role === "teacher") return "Teacher";
  return "Student";
};

module.exports = { dashboardPath, roleLabel };
