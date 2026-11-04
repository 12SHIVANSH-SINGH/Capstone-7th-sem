export const formatDate = (value, options = {}) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

export const formatShortDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export const relativeTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return `${minutes > 0 ? "in " : ""}${Math.abs(minutes)}m${minutes < 0 ? " ago" : ""}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours > 0 ? "in " : ""}${Math.abs(hours)}h${hours < 0 ? " ago" : ""}`;
  const days = Math.round(hours / 24);
  return `${days > 0 ? "in " : ""}${Math.abs(days)}d${days < 0 ? " ago" : ""}`;
};

export const formatDistance = (meters) => {
  if (meters === null || meters === undefined || Number.isNaN(Number(meters))) return "Unavailable";
  const value = Number(meters);
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(2)} km`;
};

export const percentLabel = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : `${value}%`;

export const classLabel = (entry) =>
  `${entry?.courseCode || entry?.class?.courseCode || "Class"}${
    entry?.section || entry?.class?.section ? ` · ${entry.section || entry.class.section}` : ""
  }`;

export const initials = (name, email) =>
  String(name || email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const HONORIFICS = new Set(["dr", "prof", "mr", "ms", "mrs", "shri", "smt"]);

/**
 * A friendly first name for greetings. Academic titles are dropped so a
 * teacher called "Dr. Ananya Verma" is greeted as "Ananya", not "Dr.".
 */
export const givenName = (value) => {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFICS.has(parts[0].toLowerCase().replace(/\.$/, ""))) {
    parts.shift();
  }
  return parts[0] || "there";
};
