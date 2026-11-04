/**
 * Role-aware primary navigation. Kept as data so the app shell and mobile menu
 * cannot drift from each other.
 */
const STUDENT_LINKS = [
  { to: "/student-dashboard", label: "Dashboard" },
  { to: "/student/check-in", label: "Check-in" },
  { to: "/attendance", label: "Attendance" },
  { to: "/queries", label: "Queries" },
  { to: "/timetable", label: "Timetable" },
  { to: "/acoustic-lab", label: "Audio lab" },
  { to: "/help", label: "Help" },
];

const TEACHER_LINKS = [
  { to: "/teacher-dashboard", label: "Dashboard" },
  { to: "/teacher/classes", label: "Classes" },
  { to: "/teacher/check-in", label: "Check-in" },
  { to: "/teacher/sessions", label: "Sessions" },
  { to: "/attendance", label: "Analytics" },
  { to: "/queries", label: "Queries" },
  { to: "/exports", label: "Exports" },
  { to: "/timetable", label: "Timetable" },
  { to: "/acoustic-lab", label: "Audio lab" },
  { to: "/help", label: "Help" },
];

const SUPERADMIN_LINKS = [
  { to: "/admin", label: "Admin" },
  { to: "/attendance", label: "Analytics" },
  { to: "/queries", label: "Queries" },
  { to: "/teacher/sessions", label: "Sessions" },
  { to: "/exports", label: "Exports" },
  { to: "/timetable", label: "Timetable" },
  { to: "/notifications", label: "Notifications" },
  { to: "/profile", label: "Profile" },
  { to: "/help", label: "Help" },
];

export const roleLinks = (role) => {
  if (role === "superadmin") return SUPERADMIN_LINKS;
  if (role === "teacher") return TEACHER_LINKS;
  return STUDENT_LINKS;
};

export const mergeLinks = (role, links = []) => {
  const merged = [];
  const seen = new Set();
  for (const link of [...links, ...roleLinks(role)]) {
    if (!link?.to || seen.has(link.to)) continue;
    seen.add(link.to);
    merged.push(link);
  }
  return merged;
};

export const isLinkActive = (pathname, to) =>
  pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
