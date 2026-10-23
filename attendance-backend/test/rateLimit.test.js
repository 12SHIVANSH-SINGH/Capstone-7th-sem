const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../middleware/rateLimit");

const fakeExchange = () => {
  const state = { status: 200, headers: {}, body: null, next: false };
  return {
    state,
    req: { ip: "203.0.113.7", socket: {} },
    res: {
      set(name, value) {
        state.headers[name] = value;
        return this;
      },
      status(code) {
        state.status = code;
        return this;
      },
      json(body) {
        state.body = body;
        return this;
      },
    },
    next: () => {
      state.next = true;
    },
  };
};

test("allows requests up to the limit and then returns 429", () => {
  let clock = 1000;
  const limiter = createRateLimiter({ max: 2, windowMs: 60000, now: () => clock });

  for (let index = 0; index < 2; index += 1) {
    const exchange = fakeExchange();
    limiter(exchange.req, exchange.res, exchange.next);
    assert.equal(exchange.state.next, true);
    assert.equal(exchange.state.status, 200);
  }

  const blocked = fakeExchange();
  limiter(blocked.req, blocked.res, blocked.next);
  assert.equal(blocked.state.next, false);
  assert.equal(blocked.state.status, 429);
  assert.equal(blocked.state.body.success, false);
  assert.match(blocked.state.body.message, /Too many attempts/);
  assert.equal(blocked.state.headers["Retry-After"], "60");
});

test("the window resets after the configured time", () => {
  let clock = 0;
  const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => clock });

  const first = fakeExchange();
  limiter(first.req, first.res, first.next);
  assert.equal(first.state.next, true);

  const second = fakeExchange();
  limiter(second.req, second.res, second.next);
  assert.equal(second.state.next, false);

  clock = 1000;
  const third = fakeExchange();
  limiter(third.req, third.res, third.next);
  assert.equal(third.state.next, true);
  assert.equal(limiter.size(), 1);
});

test("each client IP is counted separately", () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60000, now: () => 0 });

  const first = fakeExchange();
  limiter(first.req, first.res, first.next);
  assert.equal(first.state.next, true);

  const other = fakeExchange();
  other.req.ip = "198.51.100.9";
  limiter(other.req, other.res, other.next);
  assert.equal(other.state.next, true);

  const again = fakeExchange();
  limiter(again.req, again.res, again.next);
  assert.equal(again.state.next, false);
});
