const { isDbReady } = require("./dbReady");
const { appendAuditEntry } = require("./auditChain");

// Express resolves req.ip through the trusted one-hop proxy configured in
// app.js. Reading X-Forwarded-For directly would let a client prepend a fake
// address to every audit entry.
const requestIp = (req) =>
  String(req?.ip || req?.socket?.remoteAddress || "").trim();

const actorSnapshot = (req, explicitActor = null) => {
  const actor = explicitActor || req?.user || null;
  return {
    actor: actor?._id || null,
    actorEmail: String(actor?.email || "").trim().toLowerCase(),
    actorRole: String(actor?.role || ""),
    impersonator: req?.impersonator?._id || null,
    impersonatorEmail: String(req?.impersonator?.email || "").trim().toLowerCase(),
  };
};

/**
 * Append an immutable audit entry. Auditing must never make the primary action
 * fail after the database write has already happened, so a logging failure is
 * reported to the server log instead of being thrown into the request.
 */
const writeAudit = async (req, entry) => {
  if (!isDbReady()) return null;
  try {
    const actor = actorSnapshot(req, entry.actor);
    return await appendAuditEntry({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ? String(entry.entityId) : "",
      ...actor,
      summary: entry.summary || "",
      before: entry.before ?? null,
      after: entry.after ?? null,
      metadata: entry.metadata ?? null,
      ip: requestIp(req),
      userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 500),
      isDemo: Boolean(entry.isDemo || req?.user?.isDemo),
    });
  } catch (error) {
    console.error(`[audit] failed to write ${entry?.action}: ${error.message}`);
    return null;
  }
};

const toAuditView = (log) => ({
  id: String(log._id),
  seq: Number.isInteger(log.seq) ? log.seq : null,
  hash: String(log.hash || ""),
  prevHash: String(log.prevHash || ""),
  action: log.action,
  entityType: log.entityType,
  entityId: log.entityId,
  actorEmail: log.actorEmail,
  actorRole: log.actorRole,
  impersonatorEmail: log.impersonatorEmail || "",
  summary: log.summary,
  before: log.before,
  after: log.after,
  metadata: log.metadata,
  createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : null,
  isDemo: Boolean(log.isDemo),
});

module.exports = {
  writeAudit,
  toAuditView,
  requestIp,
};
