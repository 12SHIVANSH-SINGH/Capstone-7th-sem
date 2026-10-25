const { test } = require("node:test");
const assert = require("node:assert/strict");

const { startServer } = require("../utils/startServer");

const createLogger = () => {
  const logs = [];
  const errors = [];
  return {
    logs,
    errors,
    logger: {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => errors.push(args.join(" ")),
    },
  };
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("listen waits for both the connection and index initialization", async () => {
  const events = [];
  const connectGate = deferred();
  const indexGate = deferred();
  let indexesReady = false;
  let listenCalled = false;
  const { logger } = createLogger();
  const exits = [];

  const starting = startServer({
    connect: async () => {
      events.push("connect:start");
      await connectGate.promise;
      events.push("connect:done");
    },
    initIndexes: async () => {
      events.push("init:start");
      await indexGate.promise;
      indexesReady = true;
      events.push("init:done");
      return ["CheckInProof", "CheckInSession"];
    },
    listen: () => {
      assert.equal(indexesReady, true, "listen must not run before indexes are ready");
      listenCalled = true;
      events.push("listen");
      return { marker: "server" };
    },
    logger,
    exit: (code) => exits.push(code),
  });

  assert.deepEqual(events, ["connect:start"]);
  assert.equal(listenCalled, false);

  connectGate.resolve();
  await tick();
  assert.deepEqual(events, ["connect:start", "connect:done", "init:start"]);
  assert.equal(listenCalled, false, "listen must not run while indexes are building");

  indexGate.resolve();
  const server = await starting;

  assert.deepEqual(events, ["connect:start", "connect:done", "init:start", "init:done", "listen"]);
  assert.deepEqual(server, { marker: "server" });
  assert.deepEqual(exits, []);
});

test("a connection rejection exits 1 and never initializes indexes or listens", async () => {
  const { logger, logs, errors } = createLogger();
  const exits = [];
  let initCalled = false;
  let listenCalled = false;

  const server = await startServer({
    connect: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:27017");
    },
    initIndexes: async () => {
      initCalled = true;
      return [];
    },
    listen: () => {
      listenCalled = true;
      return {};
    },
    logger,
    exit: (code) => exits.push(code),
  });

  assert.equal(server, null);
  assert.equal(initCalled, false);
  assert.equal(listenCalled, false);
  assert.deepEqual(exits, [1]);
  assert.deepEqual(logs, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /database connection failed: connect ECONNREFUSED/);
});

test("an index rejection exits 1 and never listens", async () => {
  const { logger, logs, errors } = createLogger();
  const exits = [];
  let connectCalled = false;
  let listenCalled = false;

  const server = await startServer({
    connect: async () => {
      connectCalled = true;
    },
    initIndexes: async () => {
      throw new Error("E11000 duplicate key error: one_proof_per_student_wave");
    },
    listen: () => {
      listenCalled = true;
      return {};
    },
    logger,
    exit: (code) => exits.push(code),
  });

  assert.equal(connectCalled, true);
  assert.equal(server, null);
  assert.equal(listenCalled, false);
  assert.deepEqual(exits, [1]);
  assert.deepEqual(logs, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /database index initialization failed: E11000 duplicate key/);
});

test("successful startup logs index readiness and returns the server", async () => {
  const { logger, logs, errors } = createLogger();
  const exits = [];
  const fakeServer = { listening: true };

  const server = await startServer({
    connect: async () => {},
    initIndexes: async () => ["CheckInProof", "CheckInSession", "User"],
    listen: () => fakeServer,
    logger,
    exit: (code) => exits.push(code),
  });

  assert.equal(server, fakeServer);
  assert.deepEqual(exits, []);
  assert.deepEqual(errors, []);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^MongoDB indexes are ready for 3 model\(s\): CheckInProof, CheckInSession, User$/);
});
