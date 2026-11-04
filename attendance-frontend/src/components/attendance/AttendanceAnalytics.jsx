import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FiBarChart2,
  FiCheckCircle,
  FiDownload,
  FiRefreshCw,
  FiUsers,
  FiXCircle,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import {
  classLabel,
  formatDate,
  formatDateTime,
  percentLabel,
  relativeTime,
} from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import { Donut, LineChart } from "../../ui/Charts";
import { PageLoader, Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";

const requestConfig = { withCredentials: true };
const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const statusPill = (status) => {
  if (status === "present") return <Badge variant="success" dot>Present</Badge>;
  if (status === "absent") return <Badge variant="danger" dot>Absent</Badge>;
  if (status === "excused") return <Badge variant="info" dot>Excused</Badge>;
  return <Badge variant="warning" dot>Pending</Badge>;
};

const queryStatusPill = (status) => {
  if (status === "approved") return <Badge variant="success" dot>Approved</Badge>;
  if (status === "rejected") return <Badge variant="danger" dot>Rejected</Badge>;
  if (status === "expired") return <Badge variant="neutral" dot>Expired</Badge>;
  return <Badge variant="warning" dot>Pending</Badge>;
};

const toneFor = (percentage) => {
  if (percentage === null || percentage === undefined) return "indigo";
  if (percentage >= 85) return "success";
  if (percentage >= 70) return "warning";
  return "danger";
};

const AttendanceAnalytics = () => {
  const { user, loading, logout } = useRoleSession(["student", "teacher", "superadmin"]);
  const toast = useToast();
  const role = user?.role || "student";
  const isStudent = role === "student";

  const [studentData, setStudentData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [overview, setOverview] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [studentDetail, setStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStudent = useCallback(async () => {
    const response = await axios.get(`${SERVER_URL}/attendance/me`, requestConfig);
    setStudentData(response.data || null);
  }, []);

  const loadClasses = useCallback(async () => {
    const url = role === "superadmin" ? `${SERVER_URL}/admin/classes` : `${SERVER_URL}/classes`;
    const response = await axios.get(url, requestConfig);
    const source = Array.isArray(response.data?.classes) ? response.data.classes : [];
    const list = source.map((entry) => ({
      id: entry.id || entry._id,
      courseCode: entry.courseCode,
      title: entry.title,
      section: entry.section || "",
      teacher: entry.teacher,
    }));
    setClasses(list);
    setClassId((current) => (list.some((entry) => entry.id === current) ? current : list[0]?.id || ""));
    return list;
  }, [role]);

  const loadOverview = useCallback(
    async (nextClassId = classId) => {
      if (!nextClassId) return;
      setLoadingOverview(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const response = await axios.get(
          `${SERVER_URL}/attendance/classes/${nextClassId}/overview${
            params.toString() ? `?${params.toString()}` : ""
          }`,
          requestConfig
        );
        setOverview(response.data || null);
      } catch (requestError) {
        setError(messageFor(requestError, "Could not load class attendance."));
      } finally {
        setLoadingOverview(false);
      }
    },
    [classId, from, to]
  );

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setPageLoading(true);
      try {
        if (isStudent) {
          await loadStudent();
        } else {
          const list = await loadClasses();
          if (list[0]) await loadOverview(list[0].id);
        }
      } catch (requestError) {
        if (requestError?.response?.status !== 401) {
          setError(messageFor(requestError, "Could not load attendance."));
        }
      } finally {
        setPageLoading(false);
      }
    };
    load();
    // The initial load should not rerun every time a filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isStudent]);

  const openStudent = async (student) => {
    setStudentDetail({ student, summary: null, records: [] });
    setDetailLoading(true);
    try {
      const response = await axios.get(
        `${SERVER_URL}/attendance/classes/${classId}/students/${encodeURIComponent(student.email)}`,
        requestConfig
      );
      setStudentDetail({ student: response.data.student, ...response.data });
    } catch (requestError) {
      toast(messageFor(requestError, "Could not load the student's attendance."), "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const name = user?.name || user?.email?.split("@")[0] || "You";
  const selectedClass = useMemo(
    () => classes.find((entry) => entry.id === classId) || null,
    [classes, classId]
  );

  if (loading || pageLoading) return <PageLoader label="Loading attendance analytics…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const renderStudent = () => {
    const summary = studentData?.summary || { present: 0, absent: 0, pending: 0, excused: 0, total: 0, percentage: null };
    return (
      <div className="page-stack">
        <div className="metric-strip">
          <div className="metric metric--indigo">
            <div className="metric__label">Overall attendance</div>
            <div className="metric__value">{percentLabel(summary.percentage)}</div>
            <div className="metric__hint">{summary.present} present · {summary.absent} absent</div>
          </div>
          <div className="metric">
            <div className="metric__label">Sessions</div>
            <div className="metric__value">{summary.total}</div>
            <div className="metric__hint">{summary.pending} waiting for a decision</div>
          </div>
          <div className="metric metric--success">
            <div className="metric__label">Present</div>
            <div className="metric__value">{summary.present}</div>
            <div className="metric__hint">Approved queries count as present</div>
          </div>
          <div className="metric metric--danger">
            <div className="metric__label">Absent</div>
            <div className="metric__value">{summary.absent}</div>
            <div className="metric__hint">Pending rows are not counted as absent</div>
          </div>
        </div>

        <div className="page-grid page-grid--2">
          <Card title="Your classes" subtitle="Percentage counts decided sessions only.">
            {studentData?.classes?.length ? (
              <div className="query-list">
                {studentData.classes.map((entry) => (
                  <div className="class-card" key={entry.id}>
                    <div className="class-card__head">
                      <div>
                        <div className="class-card__code">{classLabel(entry)}</div>
                        <div className="class-card__title">{entry.title}</div>
                        <div className="class-card__meta">Room {entry.roomNo || "—"}</div>
                      </div>
                      <Badge variant={toneFor(entry.percentage) === "success" ? "success" : toneFor(entry.percentage) === "warning" ? "warning" : toneFor(entry.percentage) === "danger" ? "danger" : "neutral"}>
                        {percentLabel(entry.percentage)}
                      </Badge>
                    </div>
                    <div className="class-card__stats">
                      <div className="class-card__stat"><strong>{entry.present}</strong><span>Present</span></div>
                      <div className="class-card__stat"><strong>{entry.absent}</strong><span>Absent</span></div>
                      <div className="class-card__stat"><strong>{entry.pending}</strong><span>Pending</span></div>
                    </div>
                    <div className="progress"><span className={`progress__bar progress__bar--${toneFor(entry.percentage)}`} style={{ width: `${entry.percentage || 0}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FiUsers />} title="No classes yet" text="Your attendance appears after you are added to a class roster." />
            )}
          </Card>

          <Card title="Recent sessions" subtitle="Newest first. Pending rows mean the teacher has not finalised the register.">
            {studentData?.recent?.length ? (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Session</th><th>Class</th><th>Status</th><th>Finalised</th></tr></thead>
                  <tbody>
                    {studentData.recent.map((entry) => (
                      <tr key={entry.recordId}>
                        <td>{formatDate(entry.startedAt)}</td>
                        <td><div className="data-table__main">{entry.class?.courseCode || "Class"}</div><div className="data-table__sub">{entry.class?.title}</div></td>
                        <td>{statusPill(entry.status)}</td>
                        <td>{entry.finalised ? <Badge variant="neutral">Yes</Badge> : <Badge variant="warning">No</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-inline">No attendance records yet.</p>
            )}
          </Card>
        </div>

        <Card title="Your queries" subtitle="If you were present but unmarked, raise a query from the Query centre." actions={<Button variant="soft" size="sm" onClick={() => (window.location.href = "/queries")}>Open queries</Button>}>
          {studentData?.queries?.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Class</th><th>Raised</th><th>Status</th><th>Expires</th><th>Teacher note</th></tr></thead>
                <tbody>
                  {studentData.queries.map((query) => (
                    <tr key={query.id}>
                      <td>{classLabel(query.classSnapshot)}</td>
                      <td>{formatDate(query.createdAt)}</td>
                      <td>{queryStatusPill(query.status)}</td>
                      <td>{query.status === "pending" ? relativeTime(query.expiresAt) : formatDate(query.expiresAt)}</td>
                      <td>{query.decisionNote || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="empty-inline">No queries raised.</p>}
        </Card>
      </div>
    );
  };

  const renderStaff = () => {
    const summary = overview?.summary || { present: 0, absent: 0, pending: 0, excused: 0, total: 0, percentage: null, classAverage: null };
    const trend = (overview?.trend || []).map((point) => ({ ...point, value: point.percentage }));
    return (
      <div className="page-stack">
        <Card>
          <div className="filters">
            <Field label="Class" htmlFor="analytics-class">
              <select id="analytics-class" className="ui-input" value={classId} onChange={(event) => { setClassId(event.target.value); loadOverview(event.target.value); }}>
                {classes.map((entry) => (
                  <option key={entry.id} value={entry.id}>{classLabel(entry)} — {entry.title}</option>
                ))}
              </select>
            </Field>
            <Field label="From" htmlFor="analytics-from"><input id="analytics-from" className="ui-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To" htmlFor="analytics-to"><input id="analytics-to" className="ui-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
            <Button variant="secondary" onClick={() => loadOverview()} loading={loadingOverview}>
              <FiRefreshCw aria-hidden="true" /> Apply range
            </Button>
            <Button variant="soft" onClick={() => (window.location.href = "/exports")}>
              <FiDownload aria-hidden="true" /> Export centre
            </Button>
          </div>
          {overview?.term && (
            <p className="query-window" style={{ marginTop: 10 }}>
              Term: {overview.term.name || "—"} · range {overview.term.from ? formatDate(overview.term.from) : "term start"} to {overview.term.to ? formatDate(overview.term.to) : "now"}
            </p>
          )}
        </Card>

        {classes.length === 0 ? (
          <Card><EmptyState icon={<FiUsers />} title="No classes available" text="Create a class first, then return for attendance analytics." /></Card>
        ) : loadingOverview ? (
          <Card><div className="loading-inline"><Spinner /> Loading class register…</div></Card>
        ) : !overview ? (
          <Card><EmptyState icon={<FiBarChart2 />} title="Nothing to show" text="Choose a class or adjust the date range." /></Card>
        ) : (
          <>
            <div className="metric-strip">
              <div className="metric metric--indigo">
                <div className="metric__label">Class average</div>
                <div className="metric__value">{percentLabel(summary.percentage)}</div>
                <div className="metric__hint">{summary.present} present / {summary.decided} decided</div>
              </div>
              <div className="metric">
                <div className="metric__label">Students</div>
                <div className="metric__value">{overview.students?.length || 0}</div>
                <div className="metric__hint">{summary.total} register rows</div>
              </div>
              <div className="metric metric--success">
                <div className="metric__label">Present</div>
                <div className="metric__value">{summary.present}</div>
                <div className="metric__hint">{summary.excused} excused</div>
              </div>
              <div className="metric metric--warning">
                <div className="metric__label">Pending</div>
                <div className="metric__value">{summary.pending}</div>
                <div className="metric__hint">Not counted as absent</div>
              </div>
              <div className="metric">
                <div className="metric__label">Queries</div>
                <div className="metric__value">{overview.queries?.pending || 0}</div>
                <div className="metric__hint">{overview.queries?.approved || 0} approved · {overview.queries?.expired || 0} expired</div>
              </div>
            </div>

            <div className="page-grid page-grid--sidebar">
              <Card title="Attendance trend" subtitle="Closed sessions across the selected range.">
                <LineChart points={trend} label="Class attendance trend" />
              </Card>
              <Card title="Register health">
                <div className="attendance-hero">
                  <Donut value={summary.percentage} label="Present" tone={toneFor(summary.percentage)} />
                  <div className="stat-inline">
                    <div className="stat-inline__item"><span>Sessions</span><strong>{overview.sessions?.length || 0}</strong></div>
                    <div className="stat-inline__item"><span>Finalised</span><strong>{overview.sessions?.filter((session) => session.attendanceFinalized).length || 0}</strong></div>
                    <div className="stat-inline__item"><span>Class avg.</span><strong>{percentLabel(summary.classAverage)}</strong></div>
                  </div>
                </div>
                <div className="notice notice--info" style={{ marginTop: 14 }}>
                  <FiCheckCircle className="notice__icon" aria-hidden="true" />
                  <div><strong>Queries are corrections</strong><p>Approved queries count as present. Pending rows are excluded from the percentage until the teacher finalises the session.</p></div>
                </div>
              </Card>
            </div>

            <Card title="Students" subtitle="Click a student to open their per-session history.">
              {overview.students?.length ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Roll</th><th>Student</th><th>Present</th><th>Absent</th><th>Pending</th><th>Attendance</th><th>Last</th><th /></tr></thead>
                    <tbody>
                      {overview.students.map((student) => (
                        <tr key={student.email}>
                          <td>{student.rollNumber || "—"}</td>
                          <td><div className="data-table__main">{student.name || student.email}</div><div className="data-table__sub">{student.email}</div></td>
                          <td>{student.present}</td>
                          <td>{student.absent}</td>
                          <td>{student.pending}</td>
                          <td>
                            <div className="progress-row">
                              <div className="progress"><span className={`progress__bar progress__bar--${toneFor(student.percentage)}`} style={{ width: `${student.percentage || 0}%` }} /></div>
                              <span>{percentLabel(student.percentage)}</span>
                            </div>
                          </td>
                          <td>{student.lastStatus ? statusPill(student.lastStatus) : "—"}</td>
                          <td><Button variant="ghost" size="sm" onClick={() => openStudent(student)}>History</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-inline">No attendance records in this range.</p>}
            </Card>

            <Card title="Sessions" subtitle="Session register totals for the selected range.">
              {overview.sessions?.length ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Started</th><th>Status</th><th>Present</th><th>Absent</th><th>Pending</th><th>Finalised</th><th>Query window</th></tr></thead>
                    <tbody>
                      {[...overview.sessions].reverse().map((session) => (
                        <tr key={session.id}>
                          <td>{formatDateTime(session.startedAt)}</td>
                          <td><Badge variant={session.status === "active" ? "success" : "neutral"} dot>{session.status}</Badge></td>
                          <td>{session.summary?.present ?? 0}</td>
                          <td>{session.summary?.absent ?? 0}</td>
                          <td>{session.summary?.pending ?? 0}</td>
                          <td>{session.attendanceFinalized ? <Badge variant="success">Yes</Badge> : <Badge variant="warning">No</Badge>}</td>
                          <td>{session.queryWindowEndsAt ? relativeTime(session.queryWindowEndsAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty-inline">No sessions for this class in the selected range.</p>}
            </Card>
          </>
        )}
      </div>
    );
  };

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Attendance analytics</h1>
          <p className="ui-page-head__sub">
            {isStudent
              ? "See your percentage per class, every decided session and any query that changed the register."
              : "Class averages, per-student percentages, session trends and term totals. Pending rows are shown separately from absences."}
          </p>
        </div>
        {!isStudent && selectedClass && (
          <div className="ui-page-head__actions">
            <Badge variant="info">{classLabel(selectedClass)}</Badge>
          </div>
        )}
      </div>

      {error && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: 16 }}>
          <FiXCircle className="notice__icon" aria-hidden="true" />
          <div><strong>Attendance could not load</strong><p>{error}</p></div>
        </div>
      )}

      {isStudent ? renderStudent() : renderStaff()}

      <Modal
        open={Boolean(studentDetail)}
        onClose={() => setStudentDetail(null)}
        title={studentDetail?.student?.name || studentDetail?.student?.email || "Student attendance"}
        subtitle={studentDetail?.student?.email || ""}
        wide
      >
        {detailLoading || !studentDetail?.summary ? (
          <div className="loading-inline"><Spinner /> Loading student history…</div>
        ) : (
          <div className="page-stack">
            <div className="metric-strip">
              <div className="metric"><div className="metric__label">Attendance</div><div className="metric__value">{percentLabel(studentDetail.summary.percentage)}</div><div className="metric__hint">{studentDetail.summary.present}/{studentDetail.summary.decided} decided</div></div>
              <div className="metric"><div className="metric__label">Present</div><div className="metric__value">{studentDetail.summary.present}</div></div>
              <div className="metric"><div className="metric__label">Absent</div><div className="metric__value">{studentDetail.summary.absent}</div></div>
              <div className="metric"><div className="metric__label">Pending</div><div className="metric__value">{studentDetail.summary.pending}</div></div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Session</th><th>Status</th><th>Source</th><th>Proofs</th><th>Decision note</th></tr></thead>
                <tbody>
                  {(studentDetail.records || []).map((record) => (
                    <tr key={record.id}>
                      <td>{formatDateTime(record.session?.startedAt || record.markedAt)}</td>
                      <td>{statusPill(record.status)}</td>
                      <td><span className="chip">{record.source}</span></td>
                      <td>{record.evidence?.proofCount || 0}</td>
                      <td>{record.decisionNote || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {studentDetail.queries?.length > 0 && (
              <div>
                <p className="page-section-title">Queries</p>
                <div className="query-list" style={{ marginTop: 8 }}>
                  {studentDetail.queries.map((query) => (
                    <div className="query-card query-card--pending" key={query.id}>
                      <div className="query-card__head">
                        <div><p className="query-card__sub">{formatDateTime(query.createdAt)}</p></div>
                        {queryStatusPill(query.status)}
                      </div>
                      <div className="query-card__body">{query.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
};

export default AttendanceAnalytics;
