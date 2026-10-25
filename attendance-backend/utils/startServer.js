/**
 * Ordered server startup.
 *
 * Opening the HTTP listener before MongoDB is connected and every model's
 * indexes exist lets a burst of requests create documents that a unique index
 * would have rejected. On a fresh database that can leave duplicate rows; the
 * later unique-index build then fails forever.
 *
 * This module makes the order explicit and injectable so the failure paths can
 * be tested without a live MongoDB:
 *
 *   connect -> initIndexes -> log readiness -> listen
 *
 * A connection or index failure logs, exits 1, and never calls listen.
 */

const defaultExit = (code) => process.exit(code);

const startServer = async ({
  connect,
  initIndexes,
  listen,
  logger = console,
  exit = defaultExit,
} = {}) => {
  if (
    typeof connect !== "function" ||
    typeof initIndexes !== "function" ||
    typeof listen !== "function"
  ) {
    throw new TypeError("startServer requires connect, initIndexes and listen functions");
  }

  try {
    await connect();
  } catch (error) {
    logger.error(`Refusing to start: database connection failed: ${error.message}`);
    exit(1);
    return null;
  }

  let models;
  try {
    models = await initIndexes();
  } catch (error) {
    logger.error(`Refusing to start: database index initialization failed: ${error.message}`);
    exit(1);
    return null;
  }

  const modelNames = Array.isArray(models) ? models : [];
  logger.log(
    modelNames.length > 0
      ? `MongoDB indexes are ready for ${modelNames.length} model(s): ${modelNames.join(", ")}`
      : "MongoDB indexes are ready"
  );

  try {
    return listen();
  } catch (error) {
    logger.error(`Refusing to start: HTTP listener failed: ${error.message}`);
    exit(1);
    return null;
  }
};

module.exports = { startServer };
