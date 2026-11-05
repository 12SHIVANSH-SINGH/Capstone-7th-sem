const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCsp } = require("../utils/csp");

test("production CSP forbids inline scripts and frames", () => {
  const policy = buildCsp({ NODE_ENV: "production" });

  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self' https:\/\/accounts\.google\.com/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-eval'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /worker-src 'self' blob:/);
  assert.match(policy, /connect-src 'self' https:\/\/accounts\.google\.com/);
  // GIS injects its button stylesheet from accounts.google.com. The app no
  // longer imports Google Fonts, so no fonts.googleapis origin is needed.
  assert.match(
    policy,
    /style-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com/
  );
  assert.doesNotMatch(policy, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("development CSP does not force HTTPS upgrades", () => {
  const policy = buildCsp({ NODE_ENV: "test" });

  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  assert.match(policy, /script-src 'self' https:\/\/accounts\.google\.com/);
});

test("CSP is not tied to a stale NODE_ENV captured at require time", () => {
  assert.match(buildCsp({ NODE_ENV: "production" }), /upgrade-insecure-requests/);
  assert.doesNotMatch(buildCsp({ NODE_ENV: "development" }), /upgrade-insecure-requests/);
});
