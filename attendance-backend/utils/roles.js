// Shared role helpers. Keep role strings in one place so a future rename does
// not silently leave a guard behind.
const ROLES = Object.freeze({
  STUDENT: "student",
  TEACHER: "teacher",
  SUPERADMIN: "superadmin",
});

const ALL_ROLES = Object.values(ROLES);
const STAFF_ROLES = [ROLES.TEACHER, ROLES.SUPERADMIN];

const isSuperAdmin = (user) => user?.role === ROLES.SUPERADMIN;
const isTeacher = (user) => user?.role === ROLES.TEACHER;
const isStudent = (user) => user?.role === ROLES.STUDENT;
const isStaff = (user) => STAFF_ROLES.includes(user?.role);

// Super admins can read a staff view, but destructive/class-owned actions use
// a separate admin endpoint so the audit trail names the right authority.
const canViewAsStaff = (user) => isStaff(user);

const dashboardPathForRole = (role) => {
  if (role === ROLES.SUPERADMIN) return "/admin";
  if (role === ROLES.TEACHER) return "/teacher-dashboard";
  return "/student-dashboard";
};

module.exports = {
  ROLES,
  ALL_ROLES,
  STAFF_ROLES,
  isSuperAdmin,
  isTeacher,
  isStudent,
  isStaff,
  canViewAsStaff,
  dashboardPathForRole,
};
