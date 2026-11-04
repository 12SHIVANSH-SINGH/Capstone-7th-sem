/**
 * Location helpers for the query evidence panel.
 *
 * Coordinates are stored only when the browser explicitly shares them. The
 * teacher's session-start location is the reference point; the student's query
 * location is compared to it. A missing location is a valid state (permission
 * denied, desktop browser, demo phone) and is shown as unavailable rather than
 * guessed.
 */

const EARTH_RADIUS_M = 6_371_000;
const MAX_ACCURACY_M = 100_000;

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const parseDate = (value) => {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const normaliseLocation = (input, { defaultSource = "browser" } = {}) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const latitude = Number(input.latitude ?? input.lat);
  const longitude = Number(input.longitude ?? input.lng);
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return null;
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return null;

  const rawAccuracy = Number(input.accuracy);
  const accuracy = isFiniteNumber(rawAccuracy) && rawAccuracy >= 0 && rawAccuracy <= MAX_ACCURACY_M
    ? rawAccuracy
    : null;

  const source = ["browser", "manual", "teacher-session", "demo", "unknown"].includes(input.source)
    ? input.source
    : defaultSource;

  return {
    latitude,
    longitude,
    accuracy,
    capturedAt: parseDate(input.capturedAt || input.timestamp),
    source,
  };
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const distanceMeters = (first, second) => {
  if (!first || !second) return null;
  const lat1 = Number(first.latitude);
  const lon1 = Number(first.longitude);
  const lat2 = Number(second.latitude);
  const lon2 = Number(second.longitude);
  if (![lat1, lon1, lat2, lon2].every(isFiniteNumber)) return null;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
};

const locationView = (location) => {
  if (!location?.latitude && location?.latitude !== 0) return null;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    capturedAt: location.capturedAt
      ? new Date(location.capturedAt).toISOString()
      : null,
    source: location.source || "unknown",
  };
};

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return "Unknown";
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${(meters / 1_000).toFixed(2)} km`;
};

module.exports = {
  EARTH_RADIUS_M,
  normaliseLocation,
  distanceMeters,
  locationView,
  formatDistance,
};
