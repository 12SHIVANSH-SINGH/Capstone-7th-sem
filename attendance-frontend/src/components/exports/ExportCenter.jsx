import React, { useCallback, useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDownload,
  FiFileText,
  FiGrid,
  FiList,
  FiRefreshCw,
  FiShield,
  FiUsers,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import { classLabel, formatDateTime } from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import { useToast } from "../../ui/Toast";
import { PageLoader } from "../../ui/Spinner";

const downloadBlob = async (path, fallbackName) => {
  const response = await fetch(`${SERVER_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    let message = "Export failed.";
    try {
      const body = await response.json();
      message = body?.message || message;
    } catch (error) {
      // The response was not JSON (for example, an HTML error page).
    }
    throw new Error(message);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const ExportCenter = () => {
  const { user, loading, logout } = useRoleSession(["teacher", "superadmin"]);
  const toast = useToast();
  const role = user?.role || "teacher";
  const isAdmin = role === "superadmin";

  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const classUrl = isAdmin ? `${SERVER_URL}/admin/classes` : `${SERVER_URL}/classes`;
      const [classResponse, sessionResponse] = await Promise.all([
        fetch(classUrl, { credentials: "include" }),
        fetch(`${SERVER_URL}/attendance/sessions?limit=100`, { credentials: "include" }),
      ]);
      if (!classResponse.ok || !sessionResponse.ok) throw new Error("Could not load export filters.");
      const classBody = await classResponse.json();
      const sessionBody = await sessionResponse.json();
      const list = (classBody.classes || []).map((entry) => ({
        id: entry.id || entry._id,
        courseCode: entry.courseCode,
        title: entry.title,
        section: entry.section || "",
      }));
      setClasses(list);
      setClassId((current) => (list.some((entry) => entry.id === current) ? current : list[0]?.id || ""));
      setSessions(Array.isArray(sessionBody.sessions) ? sessionBody.sessions : []);
      setSessionId((current) => (current || (sessionBody.sessions?.[0]?.id ?? "")));
    } catch (requestError) {
      setError(requestError.message || "Could not load the export centre.");
    } finally {
      setPageLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const run = async (key, path, fallbackName) => {
    setBusy(key);
    try {
      await downloadBlob(path, fallbackName);
      toast("Export downloaded.", "success");
    } catch (error) {
      toast(error.message || "The export could not be generated.", "error");
    } finally {
      setBusy("");
    }
  };

  const query = new URLSearchParams();
  if (classId) query.set("classId", classId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const queryString = query.toString() ? `?${query.toString()}` : "";
  const fileSuffix = classId ? classes.find((entry) => entry.id === classId)?.courseCode?.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "all";

  if (loading || pageLoading) return <PageLoader label="Loading export centre…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const name = user.name || user.email?.split("@")[0] || "You";

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Export centre</h1>
          <p className="ui-page-head__sub">
            Download a formatted attendance register, query evidence, session sheet, user directory or the audit log. Exports use the same teacher-confirmed data as the on-screen views.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" size="sm" onClick={load}>
            <FiRefreshCw aria-hidden="true" /> Refresh filters
          </Button>
        </div>
      </div>

      {error && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: 16 }}>
          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
          <div><strong>Export centre unavailable</strong><p>{error}</p></div>
        </div>
      )}

      <Card title="Report range" subtitle="Leave dates empty to use the configured term range. A class is required for a teacher's attendance export.">
        <div className="filters">
          <Field label="Class" htmlFor="export-class">
            <select id="export-class" className="ui-input" value={classId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((entry) => (
                <option key={entry.id} value={entry.id}>{classLabel(entry)} — {entry.title}</option>
              ))}
            </select>
          </Field>
          <Field label="From" htmlFor="export-from"><input id="export-from" className="ui-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="To" htmlFor="export-to"><input id="export-to" className="ui-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="Session sheet" htmlFor="export-session">
            <select id="export-session" className="ui-input" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              {sessions.length === 0 && <option value="">No sessions yet</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {classLabel(session.class)} · {formatDateTime(session.startedAt)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <div className="export-grid">
        <article className="export-card">
          <span className="export-card__icon" aria-hidden="true"><FiGrid /></span>
          <h3>Attendance register — Excel</h3>
          <p>Summary, per-student percentages, session totals and raw register rows in one workbook.</p>
          <div className="export-card__actions">
            <Button size="sm" onClick={() => run("attendance-xlsx", `/exports/attendance.xlsx${queryString}`, `bio-attend-${fileSuffix}.xlsx`)} loading={busy === "attendance-xlsx"} disabled={!classId}>
              <FiDownload aria-hidden="true" /> Download .xlsx
            </Button>
          </div>
        </article>

        <article className="export-card">
          <span className="export-card__icon" aria-hidden="true"><FiFileText /></span>
          <h3>Attendance register — PDF</h3>
          <p>A printable class register with student percentages, session totals and the term range.</p>
          <div className="export-card__actions">
            <Button variant="secondary" size="sm" onClick={() => run("attendance-pdf", `/exports/attendance.pdf${queryString}`, `bio-attend-${fileSuffix}.pdf`)} loading={busy === "attendance-pdf"} disabled={!classId}>
              <FiDownload aria-hidden="true" /> Download .pdf
            </Button>
          </div>
        </article>

        <article className="export-card">
          <span className="export-card__icon" aria-hidden="true"><FiList /></span>
          <h3>Attendance queries — Excel</h3>
          <p>Every query with status, distance, location note, reason and teacher decision.</p>
          <div className="export-card__actions">
            <Button size="sm" onClick={() => run("queries-xlsx", "/exports/queries.xlsx", "bio-attend-queries.xlsx")} loading={busy === "queries-xlsx"}>
              <FiDownload aria-hidden="true" /> Download .xlsx
            </Button>
            <Button variant="secondary" size="sm" onClick={() => run("queries-pdf", "/exports/queries.pdf", "bio-attend-queries.pdf")} loading={busy === "queries-pdf"}>
              <FiDownload aria-hidden="true" /> PDF
            </Button>
          </div>
        </article>

        <article className="export-card">
          <span className="export-card__icon" aria-hidden="true"><FiCheckCircle /></span>
          <h3>Session register</h3>
          <p>One session with its roster, status, source, evidence count and decision note.</p>
          <div className="export-card__actions">
            <Button size="sm" onClick={() => run("session-xlsx", `/exports/sessions/${sessionId}.xlsx`, "bio-attend-session.xlsx")} loading={busy === "session-xlsx"} disabled={!sessionId}>
              <FiDownload aria-hidden="true" /> .xlsx
            </Button>
            <Button variant="secondary" size="sm" onClick={() => run("session-pdf", `/exports/sessions/${sessionId}.pdf`, "bio-attend-session.pdf")} loading={busy === "session-pdf"} disabled={!sessionId}>
              <FiDownload aria-hidden="true" /> PDF
            </Button>
          </div>
        </article>

        {isAdmin && (
          <>
            <article className="export-card">
              <span className="export-card__icon" aria-hidden="true"><FiUsers /></span>
              <h3>User directory</h3>
              <p>Every account with role, status, demo flag, roll number, phone label and creation date.</p>
              <div className="export-card__actions">
                <Button size="sm" onClick={() => run("users", "/admin/export/users.xlsx", "bio-attend-users.xlsx")} loading={busy === "users"}>
                  <FiDownload aria-hidden="true" /> Download .xlsx
                </Button>
              </div>
            </article>

            <article className="export-card">
              <span className="export-card__icon" aria-hidden="true"><FiShield /></span>
              <h3>Audit log</h3>
              <p>Immutable record of attendance decisions, queries, class changes, settings and impersonation.</p>
              <div className="export-card__actions">
                <Button size="sm" onClick={() => run("audit", "/admin/export/audit.xlsx", "bio-attend-audit.xlsx")} loading={busy === "audit"}>
                  <FiDownload aria-hidden="true" /> Download .xlsx
                </Button>
              </div>
            </article>
          </>
        )}
      </div>

      <div className="notice notice--info">
        <FiCheckCircle className="notice__icon" aria-hidden="true" />
        <div>
          <strong>One source of truth</strong>
          <p>PDFs and spreadsheets are generated on the server from the same attendance records shown here. They contain no decoded acoustic keys, signatures or raw audio.</p>
        </div>
      </div>
    </AppShell>
  );
};

export default ExportCenter;
