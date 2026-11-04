const AuditLog = require("../models/auditLogModels");
const { isDbReady } = require("./dbReady");

const requestIp = (req) =>
  String(
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      ""
  );

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
    return await AuditLog.create({
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
