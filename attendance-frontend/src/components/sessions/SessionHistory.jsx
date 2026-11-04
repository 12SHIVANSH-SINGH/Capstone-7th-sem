import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFilter,
  FiRefreshCw,
  FiShield,
  FiUsers,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import { classLabel, formatDate, formatDateTime, percentLabel, relativeTime } from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import Tabs from "../../ui/Tabs";
import { PageLoader, Spinner } from "../../ui/Spinner";
import EventTimeline from "../shared/EventTimeline";
import SessionAttendanceModal from "../teacher/SessionAttendanceModal";

const requestConfig = { withCredentials: true };
const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const SessionHistory = () => {
  const { user, loading, logout } = useRoleSession(["teacher", "superadmin"]);
  const navigate = useNavigate();
  const role = user?.role || "teacher";
  const isAdmin = role === "superadmin";

  const [tab, setTab] = useState("sessions");
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [registerSession, setRegisterSession] = useState(null);

  const loadClasses = useCallback(async () => {
    const url = isAdmin ? `${SERVER_URL}/admin/classes` : `${SERVER_URL}/classes`;
    const response = await axios.get(url, requestConfig);
    const list = Array.isArray(response.data?.classes) ? response.data.classes : [];
    setClasses(
      list.map((entry) => ({
        id: entry.id || entry._id,
        courseCode: entry.courseCode,
        title: entry.title,
        section: entry.section || "",
      }))
    );
  }, [isAdmin]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (classId) params.set("classId", classId);
      if (status) params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "200");
      const url = isAdmin ? `${SERVER_URL}/admin/sessions` : `${SERVER_URL}/attendance/sessions`;
      const response = await axios.get(`${url}?${params.toString()}`, requestConfig);
      setSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
    } catch (requestError) {
      if (requestError?.response?.status === 401) return;
      setError(messageFor(requestError, "Could not load session history."));
    } finally {
      setSessionsLoading(false);
    }
  }, [classId, from, isAdmin, status, to]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const params = new URLSearchParams({ limit: "150" });
      if (isAdmin && auditQuery.trim()) params.set("q", auditQuery.trim());
      const url = isAdmin ? `${SERVER_URL}/admin/audit` : `${SERVER_URL}/audit/me`;
      const response = await axios.get(`${url}?${params.toString()}`, requestConfig);
      setAudit(Array.isArray(response.data?.logs) ? response.data.logs : []);
    } catch (requestError) {
      if (requestError?.response?.status === 401) return;
      setAuditError(messageFor(requestError, "Could not load the audit trail."));
    } finally {
      setAuditLoading(false);
    }
  }, [auditQuery, isAdmin]);

  useEffect(() => {
    if (!user) return;
    const initialise = async () => {
      setPageLoading(true);
      try {
        await loadClasses();
        await loadSessions();
      } catch (requestError) {
        if (requestError?.response?.status !== 401) {
          setError(messageFor(requestError, "Could not open session history."));
        }
      } finally {
        setPageLoading(false);
      }
    };
    initialise();
  }, [user, loadClasses, loadSessions]);

  useEffect(() => {
    if (!user || tab !== "audit") return;
    loadAudit();
  }, [user, tab, loadAudit]);

  const totals = useMemo(() => {
    const finalised = sessions.filter((session) => session.attendanceFinalized).length;
    const pendingQueries = sessions.reduce((sum, session) => sum + (session.queries?.pending || 0), 0);
    const decided = sessions.reduce(
      (sum, session) => sum + (session.attendanceSummary?.present || 0) + (session.attendanceSummary?.absent || 0),
      0
    );
    const present = sessions.reduce((sum, session) => sum + (session.attendanceSummary?.present || 0), 0);
    return {
      finalised,
      pendingQueries,
      percentage: decided ? Math.round((present / decided) * 1000) / 10 : null,
      present,
    };
  }, [sessions]);

  if (loading || pageLoading) return <PageLoader label="Loading session history…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const name = user.name || user.email?.split("@")[0] || "You";

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Session history</h1>
          <p className="ui-page-head__sub">
            Every live check-in, its register health, query window and attendance state. Teachers
            see their own sessions; a super admin sees every teacher and can open any register.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" size="sm" onClick={() => { loadSessions(); if (tab === "audit") loadAudit(); }}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "sessions", label: "Sessions", count: sessions.length },
          { value: "audit", label: "Audit trail", count: audit.length || undefined },
        ]}
      />

      {tab === "sessions" && (
        <div className="page-stack">
          <div className="metric-strip">
            <div className="metric metric--indigo">
              <div className="metric__label">Sessions</div>
              <div className="metric__value">{sessions.length}</div>
              <div className="metric__hint">{totals.finalised} finalised</div>
            </div>
            <div className="metric metric--success">
              <div className="metric__label">Attendance</div>
              <div className="metric__value">{percentLabel(totals.percentage)}</div>
              <div className="metric__hint">{totals.present} present decisions</div>
            </div>
            <div className="metric metric--warning">
              <div className="metric__label">Pending queries</div>
              <div className="metric__value">{totals.pendingQueries}</div>
              <div className="metric__hint">Corrections awaiting review</div>
            </div>
            <div className="metric">
              <div className="metric__label">Open review windows</div>
              <div className="metric__value">
                {sessions.filter((session) => session.queryWindowEndsAt && new Date(session.queryWindowEndsAt) > new Date()).length}
              </div>
              <div className="metric__hint">24 hours after close</div>
            </div>
          </div>

          <Card title="Filters" subtitle="Narrow the history by class, status or date.">
            <div className="filters">
              <Field label="Class" htmlFor="history-class">
                <select id="history-class" className="ui-input" value={classId} onChange={(event) => setClassId(event.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((entry) => (
                    <option key={entry.id} value={entry.id}>{classLabel(entry)} — {entry.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status" htmlFor="history-status">
                <select id="history-status" className="ui-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="From" htmlFor="history-from">
                <input id="history-from" type="date" className="ui-input" value={from} onChange={(event) => setFrom(event.target.value)} />
              </Field>
              <Field label="To" htmlFor="history-to">
                <input id="history-to" type="date" className="ui-input" value={to} onChange={(event) => setTo(event.target.value)} />
              </Field>
              <Button onClick={loadSessions} loading={sessionsLoading}>
                <FiFilter aria-hidden="true" /> Apply filters
              </Button>
            </div>
          </Card>

          {error && (
            <div className="notice notice--danger" role="alert">
              <FiAlertTriangle className="notice__icon" aria-hidden="true" />
              <div><strong>Sessions could not load</strong><p>{error}</p></div>
            </div>
          )}

          <Card
            title="Check-in sessions"
            subtitle={isAdmin ? "Across every teacher. Open a register to override or remove a row." : "Newest first. Open a closed register to finalise attendance."}
            actions={<Badge variant="neutral">{sessions.length} shown</Badge>}
          >
            {sessionsLoading ? (
              <div className="loading-inline"><Spinner /> Loading sessions…</div>
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={<FiCalendar />}
                title="No sessions match"
                text="Start a check-in from the Check-in page, or relax the filters above."
                action={<Button variant="soft" onClick={() => navigate("/teacher/check-in")}>Open check-in</Button>}
              />
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {isAdmin && <th>Teacher</th>}
                      <th>Started</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Register</th>
                      <th>Queries</th>
                      <th>Review window</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        {isAdmin && (
                          <td>
                            <div className="data-table__main">{session.teacher?.name || "—"}</div>
                            <div className="data-table__sub">{session.teacher?.email || ""}</div>
                          </td>
                        )}
                        <td>
                          <div className="data-table__main">{formatDate(session.startedAt)}</div>
                          <div className="data-table__sub">{formatDateTime(session.startedAt)}</div>
                        </td>
                        <td>
                          <div className="data-table__main">{classLabel(session.class)}</div>
                          <div className="data-table__sub">
                            {session.class?.title || ""} · Room {session.roomNo || session.room?.roomNo || "—"}
                          </div>
                        </td>
                        <td>
                          <div className="chip-row">
                            <Badge variant={session.status === "active" ? "success" : "neutral"} dot>
                              {session.status}
                            </Badge>
                            {session.attendanceFinalized ? (
                              <Badge variant="success">Finalised</Badge>
                            ) : (
                              <Badge variant="warning">Pending</Badge>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="progress-row">
                            <div className="progress">
                              <span
                                className={`progress__bar progress__bar--${session.attendanceSummary?.percentage >= 85 ? "success" : session.attendanceSummary?.percentage >= 70 ? "warning" : "danger"}`}
                                style={{ width: `${session.attendanceSummary?.percentage || 0}%` }}
                              />
                            </div>
                            <span>{percentLabel(session.attendanceSummary?.percentage)}</span>
                          </div>
                          <div className="data-table__sub">
                            {session.attendanceSummary?.present || 0} present · {session.attendanceSummary?.absent || 0} absent · {session.attendanceSummary?.pending || 0} pending
                          </div>
                        </td>
                        <td>
                          <Badge variant={session.queries?.pending ? "warning" : "neutral"}>
                            {session.queries?.total || 0} total
                          </Badge>
                          <div className="data-table__sub">{session.queries?.pending || 0} waiting</div>
                        </td>
                        <td>
                          {session.queryWindowEndsAt ? (
                            <span className={new Date(session.queryWindowEndsAt) > new Date() ? "query-window query-window--open" : "query-window query-window--closed"}>
                              <FiClock aria-hidden="true" /> {relativeTime(session.queryWindowEndsAt)}
                            </span>
                          ) : (
                            <span className="query-window">—</span>
                          )}
                        </td>
                        <td>
                          <div className="data-table__actions">
                            <Button variant="soft" size="sm" onClick={() => setRegisterSession(session)}>
                              <FiUsers aria-hidden="true" /> Register
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => navigate("/queries")}>
                              Queries
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "audit" && (
        <div className="page-stack">
          <Card
            title="Audit trail"
            subtitle={isAdmin ? "Every teacher, query, register, class and settings action." : "Your attendance and query decisions. The log is append-only."}
            actions={
              <Button variant="ghost" size="sm" onClick={loadAudit} loading={auditLoading}>
                <FiRefreshCw aria-hidden="true" /> Refresh
              </Button>
            }
          >
            {isAdmin && (
              <div className="filters" style={{ marginBottom: 14 }}>
                <Field label="Search audit" htmlFor="audit-search" hint="Action, actor email, summary or entity id.">
                  <input
                    id="audit-search"
                    className="ui-input"
                    value={auditQuery}
                    onChange={(event) => setAuditQuery(event.target.value)}
                    placeholder="query.approved, teacher@…"
                  />
                </Field>
                <Button variant="secondary" onClick={loadAudit} loading={auditLoading}>Search</Button>
              </div>
            )}

            {auditError ? (
              <div className="notice notice--danger" role="alert">
                <FiAlertTriangle className="notice__icon" aria-hidden="true" />
                <div><strong>Audit unavailable</strong><p>{auditError}</p></div>
              </div>
            ) : auditLoading ? (
              <div className="loading-inline"><Spinner /> Loading audit entries…</div>
            ) : audit.length === 0 ? (
              <EmptyState icon={<FiShield />} title="No audit entries yet" text="Attendance decisions, query reviews and finalisation will appear here." />
            ) : (
              <EventTimeline
                events={audit.map((entry) => ({
                  id: entry.id,
                  at: entry.createdAt,
                  title: entry.action,
                  detail: entry.summary,
                  tone: entry.action.includes("deleted") || entry.action.includes("rejected") ? "danger" : entry.action.includes("approved") || entry.action.includes("finalized") ? "success" : "info",
                  icon: entry.action.includes("deleted") ? "!" : entry.action.includes("approved") || entry.action.includes("finalized") ? "✓" : "•",
                  meta: (
                    <>
                      <span className="chip">{entry.actorEmail || "system"}</span>
                      {entry.impersonatorEmail && <span className="chip chip--warning">via {entry.impersonatorEmail}</span>}
                      {entry.entityType && <span className="chip">{entry.entityType}</span>}
                      {entry.isDemo && <span className="chip chip--warning">demo</span>}
                    </>
                  ),
                }))}
              />
            )}
          </Card>

          <div className="notice notice--info">
            <FiCheckCircle className="notice__icon" aria-hidden="true" />
            <div>
              <strong>Append-only by design</strong>
              <p>Audit entries are written even when an attendance row or query is later corrected. Super-admin overrides also record the prior value.</p>
            </div>
          </div>
        </div>
      )}

      <SessionAttendanceModal
        open={Boolean(registerSession)}
        session={registerSession}
        mode={isAdmin ? "admin" : "teacher"}
        onClose={() => setRegisterSession(null)}
        onChanged={() => { loadSessions(); if (tab === "audit") loadAudit(); }}
      />
    </AppShell>
  );
};

export default SessionHistory;
