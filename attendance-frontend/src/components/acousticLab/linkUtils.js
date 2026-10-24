import { buildReceiverSearch, readReceiverConditions } from "../../acoustic/transmitPlan";

export const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
};

export const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const requestWakeLock = async () => {
  try {
    if (!navigator.wakeLock?.request) return null;
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
};

export const releaseWakeLock = async (lock) => {
  try {
    await lock?.release?.();
  } catch {
    // Already released.
  }
};

export const initialRunId = () => {
  if (typeof window === "undefined") return "";
  return String(new URLSearchParams(window.location.search).get("run") || "").toUpperCase();
};

export const initialConditions = () => {
  if (typeof window === "undefined") return {};
  return readReceiverConditions(window.location.search);
};

export const linkFor = (path, runId, conditions = {}) => {
  if (typeof window === "undefined") return path;
  const search = buildReceiverSearch(runId, conditions);
  return `${window.location.origin}${path}${search ? `?${search}` : ""}`;
};

export const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
