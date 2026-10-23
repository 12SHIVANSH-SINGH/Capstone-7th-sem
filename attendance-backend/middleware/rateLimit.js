/**
 * Small in-memory fixed-window rate limiter for sign-in endpoints.
 *
 * No dependency and no shared store: each process counts its own requests.
 * On a single Render instance that is enough to stop credential-guessing and
 * accidental login loops. If the service is scaled out later, replace the Map
 * with Redis; the middleware contract stays the same.
 */

const createRateLimiter = ({
  windowMs = 10 * 60 * 1000,
  max = 30,
  message = "Too many attempts. Wait a few minutes and try again.",
  now = Date.now,
  keyFor = (req) => req.ip || req.socket?.remoteAddress || "unknown",
  maxKeys = 5000,
} = {}) => {
  const buckets = new Map();

  const sweep = (timestamp) => {
    if (buckets.size < maxKeys) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(key);
    }
    // Still full of live entries: drop the oldest to keep memory bounded.
    while (buckets.size >= maxKeys) {
      buckets.delete(buckets.keys().next().value);
    }
  };

  const middleware = (req, res, next) => {
    const timestamp = now();
    const key = keyFor(req) || "unknown";
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
      sweep(timestamp);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.set?.("RateLimit-Limit", String(max));
    res.set?.("RateLimit-Remaining", String(remaining));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
      res.set?.("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, message });
    }

    return next();
  };

  middleware.reset = () => buckets.clear();
  middleware.size = () => buckets.size;

  return middleware;
};

module.exports = { createRateLimiter };
