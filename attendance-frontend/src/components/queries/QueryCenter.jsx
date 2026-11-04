import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheck,
  FiClock,
  FiMapPin,
  FiMessageSquare,
  FiRefreshCw,
  FiRotateCcw,
  FiSend,
  FiX,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import { getCurrentLocation } from "../../utils/geolocation";
import { classLabel, formatDateTime, formatDistance, relativeTime } from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import Tabs from "../../ui/Tabs";
import { PageLoader, Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import LocationEvidence from "../shared/LocationEvidence";
import EventTimeline from "../shared/EventTimeline";

const requestConfig = { withCredentials: true };

const STATUS_META = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
  expired: { label: "Expired", variant: "neutral" },
};

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const statusBadge = (status) => {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return <Badge variant={meta.variant} dot>{meta.label}</Badge>;
};

const QueryCenter = () => {
  const { user, loading, logout } = useRoleSession(["student", "teacher", "superadmin"]);
  const toast = useToast();
  const role = user?.role || "student";
  const isStudent = role === "student";

  const [tab, setTab] = useState(isStudent ? "mine" : "pending");
  const [queries, setQueries] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [raiseSessionId, setRaiseSessionId] = useState("");
  const [reason, setReason] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [capturedLocation, setCapturedLocation] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [deciding, setDeciding] = useState("");

  const loadClasses = useCallback(async () => {
    if (isStudent) return;
    try {
      const url = role === "superadmin" ? `${SERVER_URL}/admin/classes` : `${SERVER_URL}/classes`;
      const response = await axios.get(url, requestConfig);
      const source = role === "superadmin" ? response.data?.classes : response.data?.classes;
      setClasses(
        (Array.isArray(source) ? source : []).map((entry) => ({
          id: entry.id || entry._id,
          courseCode: entry.courseCode,
          title: entry.title,
          section: entry.section || "",
          teacher: entry.teacher,
        }))
      );
    } catch (requestError) {
      if (requestError?.response?.status !== 401) {
        setError(messageFor(requestError, "Could not load classes."));
      }
    }
  }, [isStudent, role]);

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setPageLoading(true);
    setError("");
    try {
      if (isStudent) {
        const [queryResponse, sessionResponse] = await Promise.all([
          axios.get(`${SERVER_URL}/queries/mine`, requestConfig),
          axios.get(`${SERVER_URL}/attendance/me/sessions`, requestConfig),
        ]);
        setQueries(Array.isArray(queryResponse.data?.queries) ? queryResponse.data.queries : []);
        setSessions(Array.isArray(sessionResponse.data?.sessions) ? sessionResponse.data.sessions : []);
      } else {
        const url = role === "superadmin" ? `${SERVER_URL}/admin/queries` : `${SERVER_URL}/queries/review`;
        const response = await axios.get(url, requestConfig);
        setQueries(Array.isArray(response.data?.queries) ? response.data.queries : []);
        await loadClasses();
      }
    } catch (requestError) {
      if (requestError?.response?.status === 401) return;
      setError(messageFor(requestError, "Could not load attendance queries."));
    } finally {
      setPageLoading(false);
      setRefreshing(false);
    }
  }, [isStudent, loadClasses, role]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  useEffect(() => {
    if (!isStudent) {
      setTab((current) => (["pending", "approved", "rejected", "expired", "all"].includes(current) ? current : "pending"));
    }
  }, [isStudent]);

  const counts = useMemo(
    () =>
      queries.reduce(
        (accumulator, query) => {
          accumulator[query.status] = (accumulator[query.status] || 0) + 1;
          accumulator.all += 1;
          return accumulator;
        },
        { all: 0, pending: 0, approved: 0, rejected: 0, expired: 0 }
      ),
    [queries]
  );

  const filteredQueries = useMemo(() => {
    const list = queries.filter((query) => {
      if (tab !== "all" && query.status !== tab) return false;
      if (selectedClass && query.courseClass !== selectedClass) return false;
      return true;
    });
    return list;
  }, [queries, selectedClass, tab]);

  const eligibleSessions = useMemo(() => sessions.filter((session) => session.canRaiseQuery), [sessions]);
  const selectedRaiseSession = useMemo(
    () => sessions.find((session) => session.id === raiseSessionId) || eligibleSessions[0] || null,
    [raiseSessionId, eligibleSessions, sessions]
  );

  useEffect(() => {
    if (isStudent && !raiseSessionId && eligibleSessions[0]) setRaiseSessionId(eligibleSessions[0].id);
  }, [eligibleSessions, isStudent, raiseSessionId]);

  const captureLocation = async () => {
    setCapturing(true);
    const location = await getCurrentLocation();
    setCapturedLocation(location);
    setCapturing(false);
    toast(
      location
        ? `Location captured within ±${location.accuracy || 0} m.`
        : "Location unavailable. You can still send the query with a written reason.",
      location ? "success" : "info"
    );
  };

  const submitQuery = async (event) => {
    event.preventDefault();
    if (!selectedRaiseSession || !reason.trim()) return;
    setSubmitting(true);
    try {
      const location = capturedLocation || (await getCurrentLocation());
      await axios.post(
        `${SERVER_URL}/queries`,
        {
          sessionId: selectedRaiseSession.id,
          reason: reason.trim(),
          studentLocation: location,
          locationNote: locationNote.trim(),
        },
        requestConfig
      );
      toast("Query sent to your teacher.", "success");
      setReason("");
      setLocationNote("");
      setCapturedLocation(null);
      setRaiseSessionId("");
      setTab("mine");
      await loadData({ quiet: true });
    } catch (requestError) {
      toast(messageFor(requestError, "The query could not be sent."), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (query) => {
    setDetail({ query });
    setDecisionNote("");
    setDetailLoading(true);
    try {
      const response = await axios.get(`${SERVER_URL}/queries/${query.id}`, requestConfig);
      setDetail({ query: response.data.query, audit: response.data.audit || [] });
    } catch (requestError) {
      toast(messageFor(requestError, "Could not load query evidence."), "error");
      setDetail({ query });
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (decision) => {
    if (!detail?.query) return;
    setDeciding(decision);
    try {
      await axios.post(
        `${SERVER_URL}/queries/${detail.query.id}/decision`,
        { decision, note: decisionNote.trim() },
        requestConfig
      );
      toast(`Query ${decision}.`, decision === "approved" ? "success" : "info");
      setDetail(null);
      await loadData({ quiet: true });
    } catch (requestError) {
      toast(messageFor(requestError, "The decision could not be saved."), "error");
    } finally {
      setDeciding("");
    }
  };

  const reopen = async () => {
    if (!detail?.query) return;
    setDeciding("reopen");
    try {
      await axios.post(
        `${SERVER_URL}/queries/${detail.query.id}/reopen`,
        { note: decisionNote.trim() },
        requestConfig
      );
      toast("Query reopened. The student has been notified.", "success");
      setDetail(null);
      await loadData({ quiet: true });
    } catch (requestError) {
      toast(messageFor(requestError, "The query could not be reopened."), "error");
    } finally {
      setDeciding("");
    }
  };

  if (loading) return <PageLoader label="Loading queries…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const name = user.name || user.email?.split("@")[0] || "You";

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">{isStudent ? "Attendance queries" : "Query centre"}</h1>
          <p className="ui-page-head__sub">
            {isStudent
              ? "If you were in class but the register did not mark you present, raise a query. Your teacher decides using your reason and the location evidence."
              : "Review missed-attendance claims with the student's reason, check-in attempt and location evidence. Approved queries count as present."}
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" size="sm" onClick={() => loadData({ quiet: false })} loading={refreshing}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="notice notice--danger" role="alert">
          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
          <div><strong>Queries could not load</strong><p>{error}</p></div>
        </div>
      )}

      {isStudent ? (
        <div className="page-stack">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "mine", label: "My queries", count: queries.length },
              { value: "raise", label: "Raise a query", count: eligibleSessions.length },
            ]}
          />

          {tab === "mine" && (
            <div className="query-list">
              {queries.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<FiMessageSquare />}
                    title="No queries yet"
                    text="If a session closes and you were present but unmarked, open Raise a query while the review window is open."
                    action={<Button onClick={() => setTab("raise")}>Raise a query</Button>}
                  />
                </Card>
              ) : (
                queries.map((query) => (
                  <article key={query.id} className={`query-card query-card--${query.status}`}>
                    <div className="query-card__head">
                      <div>
                        <h3 className="query-card__title">{classLabel(query.classSnapshot)}</h3>
                        <p className="query-card__sub">
                          Raised {formatDateTime(query.createdAt)} · {relativeTime(query.createdAt)}
                        </p>
                      </div>
                      {statusBadge(query.status)}
                    </div>
                    <div className="query-card__body">{query.reason}</div>
                    <div className="query-card__foot">
                      <span className={`query-window ${query.status === "pending" ? "query-window--open" : ""}`}>
                        <FiClock aria-hidden="true" /> Review window{" "}
                        {query.status === "pending" ? `ends ${relativeTime(query.expiresAt)}` : `closed ${formatDateTime(query.expiresAt)}`}
                      </span>
                      {query.decisionNote && <span className="query-window">Teacher note: {query.decisionNote}</span>}
                      <Button variant="ghost" size="sm" onClick={() => openDetail(query)}>View evidence</Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}

          {tab === "raise" && (
            <div className="page-grid page-grid--sidebar">
              <Card title="Sessions you can query" subtitle="Only closed sessions in the review window appear here.">
                {sessions.length === 0 ? (
                  <p className="empty-inline">No closed sessions yet. Attendance appears after your teacher closes a check-in.</p>
                ) : (
                  <div className="query-list">
                    {sessions.map((session) => (
                      <article key={session.id} className={`query-card query-card--${session.query?.status || (session.canRaiseQuery ? "pending" : "expired")}`}>
                        <div className="query-card__head">
                          <div>
                            <h3 className="query-card__title">{classLabel(session.class)}</h3>
                            <p className="query-card__sub">
                              {formatDateTime(session.startedAt)} · {session.attendance?.status || "not on register"}
                            </p>
                          </div>
                          {session.canRaiseQuery ? (
                            <Badge variant="warning" dot>Window open</Badge>
                          ) : session.query ? (
                            statusBadge(session.query.status)
                          ) : (
                            <Badge variant="neutral">Not eligible</Badge>
                          )}
                        </div>
                        <div className="query-card__body">
                          {session.query
                            ? `You already raised a query for this session (${session.query.status}).`
                            : session.attendance?.status === "present"
                            ? "You are marked present for this session."
                            : session.windowOpen
                            ? "You can still raise a query for this session."
                            : "The 24-hour query window has closed."}
                        </div>
                        <div className="query-card__foot">
                          <Button
                            size="sm"
                            variant={session.canRaiseQuery ? "primary" : "secondary"}
                            disabled={!session.canRaiseQuery}
                            onClick={() => {
                              setRaiseSessionId(session.id);
                              setTab("raise");
                            }}
                          >
                            {session.canRaiseQuery ? "Select session" : "Unavailable"}
                          </Button>
                          {session.query && (
                            <Button variant="ghost" size="sm" onClick={() => openDetail(session.query)}>View query</Button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="New query" subtitle="Your teacher sees this with the session evidence.">
                {!eligibleSessions.length ? (
                  <EmptyState
                    icon={<FiClock />}
                    title="No session is open for queries"
                    text="The review window is 24 hours after a session closes. If you think the window is wrong, contact your teacher."
                  />
                ) : (
                  <form className="page-stack" onSubmit={submitQuery}>
                    <Field label="Session" htmlFor="query-session">
                      <select
                        id="query-session"
                        className="ui-input"
                        value={selectedRaiseSession?.id || ""}
                        onChange={(event) => setRaiseSessionId(event.target.value)}
                      >
                        {eligibleSessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {classLabel(session.class)} · {formatDateTime(session.startedAt)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="What happened?" htmlFor="query-reason" hint="At least 10 characters. Be specific about where you were sitting and what you saw.">
                      <textarea
                        id="query-reason"
                        className="ui-textarea"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={5}
                        maxLength={1000}
                        required
                        minLength={10}
                        placeholder="I was in the room for the whole lecture, but my phone could not decode the second wave."
                      />
                    </Field>
                    <Field label="Optional location note" htmlFor="query-location-note" hint="For example: front row, near the projector.">
                      <input
                        id="query-location-note"
                        className="ui-input"
                        value={locationNote}
                        onChange={(event) => setLocationNote(event.target.value)}
                        maxLength={300}
                        placeholder="Where were you sitting?"
                      />
                    </Field>
                    <div className="notice notice--info">
                      <FiMapPin className="notice__icon" aria-hidden="true" />
                      <div>
                        <strong>Location is optional evidence</strong>
                        <p>
                          A one-shot location snapshot is attached only if you allow it. Your teacher
                          compares it with the session-start location and judges the claim.
                        </p>
                        {capturedLocation && (
                          <p className="query-window query-window--open">
                            Captured now · ±{Math.round(capturedLocation.accuracy || 0)} m
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="page-toolbar">
                      <Button type="button" variant="secondary" onClick={captureLocation} loading={capturing}>
                        <FiMapPin aria-hidden="true" /> {capturedLocation ? "Recapture location" : "Share location"}
                      </Button>
                      <Button type="submit" loading={submitting} disabled={!selectedRaiseSession || reason.trim().length < 10}>
                        <FiSend aria-hidden="true" /> Send query
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            </div>
          )}
        </div>
      ) : (
        <div className="page-stack">
          <Card>
            <div className="page-toolbar">
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "pending", label: "Pending", count: counts.pending },
                  { value: "approved", label: "Approved", count: counts.approved },
                  { value: "rejected", label: "Rejected", count: counts.rejected },
                  { value: "expired", label: "Expired", count: counts.expired },
                  { value: "all", label: "All", count: counts.all },
                ]}
              />
              <Field label="Filter by class" htmlFor="query-class-filter">
                <select
                  id="query-class-filter"
                  className="ui-input"
                  value={selectedClass}
                  onChange={(event) => setSelectedClass(event.target.value)}
                >
                  <option value="">All classes</option>
                  {classes.map((entry) => (
                    <option key={entry.id} value={entry.id}>{classLabel(entry)}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <div className="query-list">
            {pageLoading ? (
              <div className="loading-inline"><Spinner /> Loading queries…</div>
            ) : filteredQueries.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<FiCheck />}
                  title="Nothing here"
                  text={`No ${tab === "all" ? "" : tab} queries${selectedClass ? " for this class" : ""}.`}
                />
              </Card>
            ) : (
              filteredQueries.map((query) => (
                <article key={query.id} className={`query-card query-card--${query.status}`}>
                  <div className="query-card__head">
                    <div>
                      <h3 className="query-card__title">
                        {query.studentName || query.studentEmail} · {classLabel(query.classSnapshot)}
                      </h3>
                      <p className="query-card__sub">
                        {query.studentEmail} · raised {formatDateTime(query.createdAt)} · {formatDistance(query.distanceMeters)} from teacher
                      </p>
                    </div>
                    <div className="query-card__meta">
                      {query.withinRadius === true && <Badge variant="success">In window</Badge>}
                      {query.withinRadius === false && <Badge variant="danger">Outside window</Badge>}
                      {statusBadge(query.status)}
                    </div>
                  </div>
                  <div className="query-card__body">{query.reason}</div>
                  <div className="query-card__foot">
                    <span className="query-window">
                      <FiClock aria-hidden="true" /> Window {formatDateTime(query.expiresAt)}
                    </span>
                    <Button size="sm" onClick={() => openDetail(query)}>
                      <FiMessageSquare aria-hidden="true" /> Review evidence
                    </Button>
                    {query.status !== "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => openDetail(query)}>
                        <FiRotateCcw aria-hidden="true" /> Reopen
                      </Button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="Query evidence"
        subtitle={detail?.query ? `${detail.query.studentName || detail.query.studentEmail} · ${classLabel(detail.query.classSnapshot)}` : "Loading…"}
        wide
        footer={
          detail?.query && !isStudent ? (
            detail.query.status === "approved" || detail.query.status === "rejected" ? (
              <>
                <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
                <Button onClick={reopen} loading={deciding === "reopen"}>
                  <FiRotateCcw aria-hidden="true" /> Reopen query
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setDetail(null)}>Cancel</Button>
                <Button variant="danger" onClick={() => decide("rejected")} loading={deciding === "rejected"}>
                  <FiX aria-hidden="true" /> Reject
                </Button>
                <Button onClick={() => decide("approved")} loading={deciding === "approved"}>
                  <FiCheck aria-hidden="true" /> Approve as present
                </Button>
              </>
            )
          ) : (
            <Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
          )
        }
      >
        {detail?.query && (
          <div className="page-stack">
            <div className="query-card__meta">
              {statusBadge(detail.query.status)}
              <span className="chip">{detail.query.status === "pending" ? `Expires ${relativeTime(detail.query.expiresAt)}` : `Decided ${formatDateTime(detail.query.decidedAt)}`}</span>
              {detail.query.reopenCount > 0 && <span className="chip">Reopened {detail.query.reopenCount}×</span>}
            </div>

            <div>
              <p className="page-section-title">Student reason</p>
              <p className="ui-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>{detail.query.reason}</p>
              {detail.query.locationNote && <p className="query-window">Location note: {detail.query.locationNote}</p>}
            </div>

            <div>
              <p className="page-section-title">Location evidence</p>
              <p className="page-section-sub">The teacher location is the reference point captured when the session started.</p>
              <div style={{ marginTop: 10 }}>
                <LocationEvidence
                  teacherLocation={detail.query.teacherLocation}
                  attemptLocation={detail.query.attemptLocation}
                  studentLocation={detail.query.studentLocation}
                  distanceMeters={detail.query.distanceMeters}
                  withinRadius={detail.query.withinRadius}
                  radiusMeters={detail.query.radiusMeters}
                />
              </div>
            </div>

            {detail.query.decisionNote && (
              <div className="notice notice--info">
                <FiCheck className="notice__icon" aria-hidden="true" />
                <div><strong>Teacher decision note</strong><p>{detail.query.decisionNote}</p></div>
              </div>
            )}

            {!isStudent && detail.query.status !== "approved" && detail.query.status !== "rejected" && (
              <Field label="Decision note" htmlFor="decision-note" hint="Visible to the student and kept in the audit trail.">
                <textarea
                  id="decision-note"
                  className="ui-textarea"
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Location and time match the class. Marked present."
                />
              </Field>
            )}

            {!isStudent && detail.query.status !== "approved" && detail.query.status !== "rejected" && (
              <div className="notice notice--warning">
                <FiAlertTriangle className="notice__icon" aria-hidden="true" />
                <div><strong>Approving changes the register</strong><p>The student becomes present for this session and the decision is written to the audit log.</p></div>
              </div>
            )}

            {(detail.query.status === "approved" || detail.query.status === "rejected") && !isStudent && (
              <Field label="Reopen note" htmlFor="reopen-note" hint="Explain why the query is being reopened.">
                <textarea
                  id="reopen-note"
                  className="ui-textarea"
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="New evidence was provided; reopening for another review."
                />
              </Field>
            )}

            <div>
              <p className="page-section-title">Audit trail</p>
              <div style={{ marginTop: 10 }}>
                {detailLoading ? (
                  <div className="loading-inline"><Spinner /> Loading audit…</div>
                ) : (
                  <EventTimeline
                    compact
                    events={(detail.audit || []).map((entry) => ({
                      id: entry.id,
                      at: entry.createdAt,
                      title: entry.action,
                      detail: entry.summary,
                      meta: entry.actorEmail ? <span className="chip">{entry.actorEmail}</span> : null,
                      tone: entry.action.includes("approved") ? "success" : entry.action.includes("rejected") || entry.action.includes("expired") ? "warning" : "indigo",
                    }))}
                    empty="No audit entries for this query yet."
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
};

export default QueryCenter;
