/**
 * One-shot browser location capture.
 *
 * Location is optional evidence: a denied permission or a desktop browser
 * without GPS must not stop check-in or a query. Callers receive null and can
 * show "location unavailable" instead of an error dialog.
 */
const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 30_000,
};

export const getCurrentLocation = (overrides = {}) =>
  new Promise((resolve) => {
    if (typeof window === "undefined" || !window.navigator?.geolocation) {
      resolve(null);
      return;
    }
    window.navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
          capturedAt: new Date().toISOString(),
          source: "browser",
        });
      },
      () => resolve(null),
      { ...GEO_OPTIONS, ...overrides }
    );
  });

export const canUseGeolocation = () =>
  typeof window !== "undefined" && Boolean(window.navigator?.geolocation);
