import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiDownload,
  FiMapPin,
  FiRefreshCw,
  FiSave,
  FiShield,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import Modal from "../../ui/Modal";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import Tabs from "../../ui/Tabs";
import { Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import { classLabel, formatDateTime, formatDistance, percentLabel } from "../../utils/format";
import { describePasskeyError, withAdminStepUp } from "../../utils/adminStepUp";
import EventTimeline from "../shared/EventTimeline";
import LocationEvidence from "../shared/LocationEvidence";
import {
  attendanceUpdates,
  changedRecordIds,
  chosenStatus,
  evidenceBackedPendingIds,
  evidenceCount,
  filterRecords,
  isEvidenceBackedPending,
  markEvidenceBackedPresent,
  pendingEvidenceBreakdown,
  sourceLabel,
} from "./sessionAttendanceView";
import "./sessionAttendance.css";

const requestConfig = { withCredentials: true };

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const STATUS_BADGE = {
  present: { label: "Present", variant: "success" },
  absent: { label: "Absent", variant: "danger" },
  excused: { label: "Excused", variant: "info" },
  pending: { label: "Pending", variant: "warning" },
};

const statusBadge = (status) => {
  const meta = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return <Badge variant={meta.variant} dot>{meta.label}</Badge>;
};

const emptyData = { session: null, records: [], summary: null, queries: [] };

const SessionAttendanceModal = ({ open, session, mode = "teacher", onClose, onChanged }) => {
  const toast = useToast();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("register");
  const [drafts, setDrafts] = useState({});
  const [notes, setNotes] = useState({});
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [proofs, setProofs] = useState({
    loading: false,
    error: "",
    total: 0,
    byWave: [],
    proofs: [],
  });
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [expandedRecordId, setExpandedRecordId] = useState("");
  const [autoMarkSaving, setAutoMarkSaving] = useState(false);
  const [exporting, setExporting] = useState("");

  const isAdmin = mode === "admin";
  const sessionId = session?.id || "";

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!sessionId) return;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const url = isAdmin
          ? `${SERVER_URL}/admin/sessions/${sessionId}/attendance`
          : `${SERVER_URL}/check-in-sessions/${sessionId}/attendance`;
        const response = await axios.get(url, requestConfig);
        setData({
          session: response.data?.session || null,
          records: Array.isArray(response.data?.records) ? response.data.records : [],
          summary: response.data?.summary || null,
          queries: Array.isArray(response.data?.queries) ? response.data.queries : [],
        });
        setDrafts({});
        setNotes({});
        setSelectedRecordId((current) => current || response.data?.records?.[0]?.id || "");
      } catch (requestError) {
        if (requestError?.response?.status === 401) return;
        setError(messageFor(requestError, "Could not load this session register."));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [isAdmin, sessionId]
  );

  const loadProofs = useCallback(async () => {
    if (!sessionId || isAdmin) return;
    setProofs((current) => ({ ...current, loading: true }));
    try {
      const response = await axios.get(
        `${SERVER_URL}/check-in-sessions/${sessionId}/proofs`,
        requestConfig
      );
      setProofs({
        loading: false,
        error: "",
        total: Number(response.data?.total) || 0,
        byWave: Array.isArray(response.data?.byWave) ? response.data.byWave : [],
        proofs: Array.isArray(response.data?.proofs) ? response.data.proofs : [],
      });
    } catch (requestError) {
      setProofs((current) => ({
        ...current,
        loading: false,
        error: messageFor(requestError, "Could not load proof evidence for this session."),
      }));
    }
  }, [isAdmin, sessionId]);

  useEffect(() => {
    if (!open) return;
    setTab("register");
    setConfirmFinalize(false);
    setSelectedRecordId("");
    setDrafts({});
    setNotes({});
    setConfirmDelete(false);
    setEvidenceFilter("all");
    setExpandedRecordId("");
    setProofs({ loading: false, error: "", total: 0, byWave: [], proofs: [] });
    load();
    loadProofs();
  }, [open, load, loadProofs]);

  const records = useMemo(() => data.records || [], [data.records]);
  const summary = useMemo(
    () =>
      data.summary || {
        total: 0,
        present: 0,
        absent: 0,
        pending: 0,
        excused: 0,
        decided: 0,
        percentage: null,
      },
    [data.summary]
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || records[0] || null,
    [records, selectedRecordId]
  );
  const changedIds = useMemo(
    () => changedRecordIds(records, drafts, notes),
    [records, drafts, notes]
  );
  const sessionInfo = useMemo(() => data.session || session || {}, [data.session, session]);
  const evidenceBreakdown = useMemo(
    () => pendingEvidenceBreakdown(records, drafts),
    [records, drafts]
  );
  const visibleRecords = useMemo(
    () => filterRecords(records, drafts, evidenceFilter),
    [records, drafts, evidenceFilter]
  );
  const visibleEvidenceIds = useMemo(
    () => evidenceBackedPendingIds(visibleRecords, drafts),
    [visibleRecords, drafts]
  );
  const expandedRecord = useMemo(
    () => records.find((record) => record.id === expandedRecordId) || null,
    [records, expandedRecordId]
  );

  const setStatus = (record, status) => {
    setDrafts((current) => {
      const next = { ...current };
      if (status === record.status) delete next[record.id];
      else next[record.id] = status;
      return next;
    });
  };

  const acceptEvidence = (record) => {
    setDrafts((current) => {
      const next = { ...current };
      if (record.status === "present") delete next[record.id];
      else next[record.id] = "present";
      return next;
    });
  };

  const markAllEvidence = (list = visibleRecords) => {
    const ids = evidenceBackedPendingIds(list, drafts);
    if (!ids.length) return;
    setDrafts((current) => markEvidenceBackedPresent(list, current));
    toast(
      `${ids.length} evidence-backed row${ids.length === 1 ? "" : "s"} set to Present. Save to apply.`,
      "success"
    );
  };

  const toggleAutoMark = async (enabled) => {
    if (!sessionId || autoMarkSaving) return;
    setAutoMarkSaving(true);
    try {
      const response = await axios.patch(
        `${SERVER_URL}/check-in-sessions/${sessionId}/attendance-settings`,
        { autoMarkPresent: enabled },
        requestConfig
      );
      setData((current) => ({
        ...current,
        session: {
          ...current.session,
          ...(response.data?.session || {}),
          autoMarkPresent: enabled,
        },
      }));
      toast(
        enabled ? "Auto-present enabled for this session." : "Auto-present disabled.",
        "success"
      );
      onChanged?.();
    } catch (requestError) {
      toast(
        messageFor(requestError, "Could not change auto-present for this session."),
        "error"
      );
    } finally {
      setAutoMarkSaving(false);
    }
  };

  const downloadSessionExport = async (format) => {
    if (!sessionId || exporting) return;
    setExporting(format);
    try {
      const response = await fetch(`${SERVER_URL}/exports/sessions/${sessionId}.${format}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bio-attend-session-${sessionId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast(`${format.toUpperCase()} exported.`, "success");
    } catch (requestError) {
      toast(messageFor(requestError, "Export failed."), "error");
    } finally {
      setExporting("");
    }
  };

  const saveChanges = async () => {
    if (!changedIds.length) return;
    const updates = attendanceUpdates(records, drafts, notes);
    setSaving(true);
    try {
      if (isAdmin) {
        await withAdminStepUp(() =>
          Promise.all(
            updates.map(({ recordId, status, note }) =>
              axios.patch(
                `${SERVER_URL}/admin/attendance/${recordId}`,
                {
                  status,
                  note: note || "Super-admin override from the register.",
                },
                requestConfig
              )
            )
          )
        );
        toast(`${changedIds.length} register row${changedIds.length === 1 ? "" : "s"} updated.`, "success");
      } else {
        await axios.patch(
          `${SERVER_URL}/check-in-sessions/${sessionId}/attendance`,
          { records: updates },
          requestConfig
        );
        toast(`${changedIds.length} register row${changedIds.length === 1 ? "" : "s"} saved.`, "success");
      }
      await load({ quiet: true });
      await loadProofs();
      onChanged?.();
    } catch (requestError) {
      toast(describePasskeyError(requestError, "The register could not be saved."), "error");
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const response = await axios.post(
        `${SERVER_URL}/check-in-sessions/${sessionId}/attendance/finalize`,
        null,
        requestConfig
      );
      toast(
        response.data?.autoAbsent
          ? `Attendance finalised. ${response.data.autoAbsent} pending row${response.data.autoAbsent === 1 ? "" : "s"} became absent.`
          : "Attendance finalised.",
        "success"
      );
      setConfirmFinalize(false);
      await load({ quiet: true });
      onChanged?.();
    } catch (requestError) {
      toast(messageFor(requestError, "Attendance could not be finalised."), "error");
    } finally {
      setFinalizing(false);
    }
  };

  const deleteRecord = async () => {
    if (!selectedRecord?.id) return;
    setDeletingRecord(true);
    try {
      // The API requires an explicit confirmation body in addition to the
      // passkey assertion, so a stray DELETE cannot remove a register row.
      await withAdminStepUp(() =>
        axios.delete(`${SERVER_URL}/admin/attendance/${selectedRecord.id}`, {
          ...requestConfig,
          data: { confirm: "DELETE" },
        })
      );
      toast("Attendance row removed from the register.", "success");
      setConfirmDelete(false);
      setSelectedRecordId("");
      await load({ quiet: true });
      onChanged?.();
    } catch (requestError) {
      toast(describePasskeyError(requestError, "The attendance row could not be removed."), "error");
    } finally {
      setDeletingRecord(false);
    }
  };

  const timelineEvents = useMemo(() => {
    const events = [];
    const push = (at, title, detail, tone = "neutral", icon) => {
      if (!at) return;
      events.push({ at, title, detail, tone, icon, id: `${title}-${at}-${events.length}` });
    };
    push(
      sessionInfo.startedAt,
      "Session started",
      sessionInfo.room?.roomNo || sessionInfo.classSnapshot?.roomNo
        ? `Room ${sessionInfo.room?.roomNo || sessionInfo.classSnapshot?.roomNo}.`
        : "Session opened for the class roster.",
      "indigo"
    );
    push(sessionInfo.keyIssuedAt, "Wave key issued", `Wave ${sessionInfo.wave ?? 0} is live for students.`, "info");
    (sessionInfo.waveHistory || []).forEach((entry) => {
      push(entry.keyIssuedAt, `Wave ${entry.wave} key issued`, "A fresh two-minute key was minted.", "indigo");
      push(entry.keyExpiresAt, `Wave ${entry.wave} key expired`, "Proofs for this wave stop being accepted.", "warning");
    });
    proofs.proofs.forEach((proof) => {
      push(
        proof.recordedAt,
        `Wave ${proof.wave} proof received`,
        `${proof.studentEmail} signed the decoded key with a bound device.`,
        "success"
      );
    });
    data.queries.forEach((query) => {
      push(
        query.createdAt,
        `Query raised · ${query.status}`,
        query.reason,
        query.status === "approved" ? "success" : query.status === "rejected" ? "danger" : "warning"
      );
    });
    push(sessionInfo.closedAt, "Session closed", "The acoustic key stopped being accepted.", "neutral");
    push(
      sessionInfo.attendanceFinalizedAt,
      "Attendance finalised",
      "Pending rows were resolved and attendance was published to students.",
      "success"
    );
    return events.sort((left, right) => new Date(left.at) - new Date(right.at));
  }, [data.queries, proofs.proofs, sessionInfo]);

  const hasChanges = changedIds.length > 0;
  const canFinalize =
    !isAdmin && sessionInfo.status === "closed" && !sessionInfo.attendanceFinalized;
  const proofErrorNotice = proofs.error ? (
    <div className="notice notice--danger" role="alert">
      <FiAlertTriangle className="notice__icon" aria-hidden="true" />
      <div>
        <strong>Proof evidence unavailable</strong>
        <p>{proofs.error}</p>
        <Button variant="secondary" size="sm" onClick={loadProofs} loading={proofs.loading}>
          <FiRefreshCw aria-hidden="true" /> Retry
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Session register"
      subtitle={
        sessionInfo.class
          ? `${classLabel(sessionInfo.class)} · ${formatDateTime(sessionInfo.startedAt)}`
          : "Loading session…"
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {hasChanges && (
            <Button onClick={saveChanges} loading={saving}>
              <FiSave aria-hidden="true" /> Save {changedIds.length} change{changedIds.length === 1 ? "" : "s"}
            </Button>
          )}
          {canFinalize && !confirmFinalize && (
            <Button variant="danger" onClick={() => setConfirmFinalize(true)}>
              <FiCheckCircle aria-hidden="true" /> Finalise attendance
            </Button>
          )}
          {confirmFinalize && (
            <Button variant="danger" onClick={finalize} loading={finalizing}>
              Confirm finalise
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="loading-inline"><Spinner /> Loading the register…</div>
      ) : error ? (
        <div className="notice notice--danger" role="alert">
          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
          <div>
            <strong>Register unavailable</strong>
            <p>{error}</p>
            <Button variant="secondary" size="sm" onClick={() => load()}>
              <FiRefreshCw aria-hidden="true" /> Retry
            </Button>
          </div>
        </div>
      ) : (
        <div className="page-stack">
          <div className="metric-strip">
            <div className="metric metric--indigo">
              <div className="metric__label">Attendance</div>
              <div className="metric__value">{percentLabel(summary.percentage)}</div>
              <div className="metric__hint">{summary.present} of {summary.decided} decided</div>
            </div>
            <div className="metric">
              <div className="metric__label">Roster</div>
              <div className="metric__value">{summary.total}</div>
              <div className="metric__hint">{summary.pending} pending</div>
            </div>
            <div className="metric metric--success">
              <div className="metric__label">Present</div>
              <div className="metric__value">{summary.present}</div>
              <div className="metric__hint">{summary.excused} excused</div>
            </div>
            <div className="metric metric--danger">
              <div className="metric__label">Absent</div>
              <div className="metric__value">{summary.absent}</div>
              <div className="metric__hint">Finalising turns pending into absent</div>
            </div>
            <div className="metric">
              <div className="metric__label">Queries</div>
              <div className="metric__value">{data.queries.length}</div>
              <div className="metric__hint">
                {data.queries.filter((query) => query.status === "pending").length} waiting for review
              </div>
            </div>
          </div>

          {confirmFinalize && (
            <div className="notice notice--warning" role="alert">
              <FiAlertTriangle className="notice__icon" aria-hidden="true" />
              <div>
                <strong>Finalise this register?</strong>
                <p>
                  Every still-pending student becomes absent. Students can still correct the
                  register with a query during the review window. This action is written to the
                  audit log.
                </p>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  <span className="chip chip--success">
                    {evidenceBreakdown.pendingWithEvidenceCount} pending with evidence
                  </span>
                  <span className="chip">
                    {evidenceBreakdown.pendingWithoutEvidenceCount} pending without evidence
                  </span>
                </div>
                {evidenceBreakdown.pendingWithEvidenceCount > 0 && (
                  <p style={{ marginTop: 8 }}>
                    <strong>
                      {evidenceBreakdown.pendingWithEvidenceCount} student
                      {evidenceBreakdown.pendingWithEvidenceCount === 1 ? " has" : "s have"}{" "}
                      signed evidence but are still pending.
                    </strong>{" "}
                    Accept them before finalising if the evidence supports it.
                  </p>
                )}
              </div>
            </div>
          )}

          {!isAdmin && sessionInfo.status === "active" && (
            <div className="notice notice--info">
              <FiClock className="notice__icon" aria-hidden="true" />
              <div>
                <strong>The session is still live</strong>
                <p>You can mark rows now. Finalise after closing the check-in so late queries can still correct the register.</p>
              </div>
            </div>
          )}

          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "register", label: "Register", count: records.length },
              { value: "evidence", label: "Evidence" },
              { value: "timeline", label: "Wave timeline", count: proofs.proofs.length || undefined },
            ]}
          />

          {tab === "register" && (
            <>
              {!isAdmin && (
                <div
                  className={`register-policy ${sessionInfo.autoMarkPresent ? "register-policy--on" : ""}`}
                >
                  <div className="register-policy__copy">
                    <strong>Auto-present from signed proofs</strong>
                    <p>
                      Off by default. When on, the first accepted proof marks a still-pending
                      student present with source <em>Evidence</em>. You can always change the
                      row, and every automatic decision is audited.
                    </p>
                    {sessionInfo.autoMarkPresent &&
                      (sessionInfo.autoMarkPresentByEmail || sessionInfo.autoMarkPresentAt) && (
                        <p className="register-policy__meta">
                          Enabled
                          {sessionInfo.autoMarkPresentByEmail
                            ? ` by ${sessionInfo.autoMarkPresentByEmail}`
                            : ""}
                          {sessionInfo.autoMarkPresentAt
                            ? ` · ${formatDateTime(sessionInfo.autoMarkPresentAt)}`
                            : ""}
                        </p>
                      )}
                  </div>
                  {sessionInfo.status === "active" && !sessionInfo.attendanceFinalized ? (
                    <label className="register-policy__switch">
                      <input
                        type="checkbox"
                        checked={Boolean(sessionInfo.autoMarkPresent)}
                        onChange={(event) => toggleAutoMark(event.target.checked)}
                        disabled={autoMarkSaving || loading}
                      />
                      <span>
                        {autoMarkSaving
                          ? "Saving…"
                          : sessionInfo.autoMarkPresent
                          ? "On for this session"
                          : "Off"}
                      </span>
                    </label>
                  ) : (
                    <Badge variant={sessionInfo.autoMarkPresent ? "warning" : "neutral"}>
                      {sessionInfo.autoMarkPresent ? "Was on" : "Off"}
                    </Badge>
                  )}
                </div>
              )}

              <div className="register-toolbar">
                <div className="register-toolbar__group">
                  <label className="register-toolbar__label" htmlFor="register-evidence-filter">
                    Show
                  </label>
                  <select
                    id="register-evidence-filter"
                    className="ui-input register-toolbar__select"
                    value={evidenceFilter}
                    onChange={(event) => setEvidenceFilter(event.target.value)}
                  >
                    <option value="all">All {records.length} rows</option>
                    <option value="pending-evidence">
                      Pending with evidence ({evidenceBreakdown.pendingWithEvidenceCount})
                    </option>
                    <option value="pending-no-evidence">
                      Pending without evidence ({evidenceBreakdown.pendingWithoutEvidenceCount})
                    </option>
                  </select>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => markAllEvidence()}
                    disabled={!visibleEvidenceIds.length}
                  >
                    <FiCheckCircle aria-hidden="true" /> Accept{" "}
                    {visibleEvidenceIds.length
                      ? `${visibleEvidenceIds.length} with evidence`
                      : "evidence-backed"}
                  </Button>
                </div>
                <div className="register-toolbar__group">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadSessionExport("pdf")}
                    loading={exporting === "pdf"}
                    disabled={Boolean(exporting) && exporting !== "pdf"}
                  >
                    <FiDownload aria-hidden="true" /> PDF
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadSessionExport("xlsx")}
                    loading={exporting === "xlsx"}
                    disabled={Boolean(exporting) && exporting !== "xlsx"}
                  >
                    <FiDownload aria-hidden="true" /> XLSX
                  </Button>
                </div>
              </div>

              {records.length === 0 ? (
                <EmptyState
                  icon={<FiUsers />}
                  title="No roster rows"
                  text="The roster was empty when this session started. Add students to the class before the next session."
                />
              ) : visibleRecords.length === 0 ? (
                <p className="empty-inline">
                  No rows match this filter.{" "}
                  <button
                    type="button"
                    className="ui-link-btn"
                    onClick={() => setEvidenceFilter("all")}
                  >
                    Show all {records.length} rows
                  </button>
                </p>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table register-table">
                    <thead>
                      <tr>
                        <th className="register-table__toggle" aria-label="Expand evidence" />
                        <th>Student</th>
                        <th>Status</th>
                        <th>Evidence</th>
                        <th>Location</th>
                        <th>Query</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecords.map((record) => {
                        const expanded = expandedRecordId === record.id;
                        const proofCount = evidenceCount(record);
                        const waves = record.evidence?.waves || [];
                        const studentProofs = proofs.proofs.filter(
                          (proof) => proof.studentEmail === record.studentEmail
                        );
                        return (
                          <React.Fragment key={record.id}>
                            <tr className={expanded ? "register-row--open" : ""}>
                              <td className="register-table__toggle">
                                <button
                                  type="button"
                                  className="ui-link-btn register-table__expand"
                                  aria-expanded={expanded}
                                  aria-label={`${expanded ? "Hide" : "Show"} evidence detail for ${
                                    record.studentName || record.studentEmail
                                  }`}
                                  onClick={() =>
                                    setExpandedRecordId((current) =>
                                      current === record.id ? "" : record.id
                                    )
                                  }
                                >
                                  {expanded ? (
                                    <FiChevronDown aria-hidden="true" />
                                  ) : (
                                    <FiChevronRight aria-hidden="true" />
                                  )}
                                </button>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="ui-link-btn"
                                  onClick={() => {
                                    setSelectedRecordId(record.id);
                                    setTab("evidence");
                                  }}
                                >
                                  {record.studentName || record.studentEmail}
                                </button>
                                <div className="data-table__sub">
                                  {record.rollNumber || "No roll"} · {record.studentEmail}
                                </div>
                              </td>
                              <td>
                                <select
                                  className="ui-input"
                                  aria-label={`Attendance status for ${record.studentEmail}`}
                                  value={chosenStatus(record)}
                                  onChange={(event) => setStatus(record, event.target.value)}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="excused">Excused</option>
                                </select>
                                {drafts[record.id] && (
                                  <div className="data-table__sub">Unsaved change</div>
                                )}
                              </td>
                              <td>
                                <div className="chip-row">
                                  <span
                                    className={`chip ${
                                      proofCount > 0 ? "chip--success" : ""
                                    }`}
                                  >
                                    {proofCount} proof{proofCount === 1 ? "" : "s"}
                                  </span>
                                  <span className="chip">{sourceLabel(record.source)}</span>
                                </div>
                                {proofCount > 0 && (
                                  <div className="data-table__sub">
                                    {waves.length
                                      ? `Wave${waves.length === 1 ? "" : "s"} ${waves.join(", ")}`
                                      : "Signed proof recorded"}
                                    {record.evidence?.lastProofAt
                                      ? ` · last ${formatDateTime(record.evidence.lastProofAt)}`
                                      : ""}
                                  </div>
                                )}
                                {isEvidenceBackedPending(record, drafts) && (
                                  <Button
                                    variant="soft"
                                    size="sm"
                                    className="register-table__accept"
                                    onClick={() => acceptEvidence(record)}
                                  >
                                    <FiCheckCircle aria-hidden="true" /> Accept present
                                  </Button>
                                )}
                              </td>
                              <td>
                                {record.attemptDistanceMeters !== null &&
                                record.attemptDistanceMeters !== undefined ? (
                                  <span className="query-window">
                                    {formatDistance(record.attemptDistanceMeters)}
                                  </span>
                                ) : record.attemptLocation ? (
                                  <span className="query-window">Captured</span>
                                ) : (
                                  <span className="query-window">Not shared</span>
                                )}
                              </td>
                              <td>
                                {record.query ? (
                                  <Badge variant="warning">Query</Badge>
                                ) : (
                                  <span className="query-window">—</span>
                                )}
                              </td>
                              <td>
                                <input
                                  className="ui-input"
                                  value={notes[record.id] ?? record.decisionNote ?? ""}
                                  onChange={(event) =>
                                    setNotes((current) => ({
                                      ...current,
                                      [record.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Decision note"
                                  maxLength={500}
                                  aria-label={`Decision note for ${record.studentEmail}`}
                                />
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="register-detail">
                                <td colSpan={7}>
                                  <div className="register-detail__grid">
                                    <div>
                                      <p className="page-section-title">Signed proof timeline</p>
                                      <p className="page-section-sub">
                                        One proof per student per wave. Signed evidence expires
                                        after about 24 hours; the register keeps the counters.
                                      </p>
                                      <div style={{ marginTop: 10 }}>
                                        {isAdmin ? (
                                          <p className="empty-inline">
                                            The proof timeline is available to the owning teacher.
                                          </p>
                                        ) : proofs.loading ? (
                                          <div className="loading-inline">
                                            <Spinner /> Loading proofs…
                                          </div>
                                        ) : proofs.error ? (
                                          <p className="empty-inline">{proofs.error}</p>
                                        ) : (
                                          <EventTimeline
                                            compact
                                            events={studentProofs.map((proof) => ({
                                              id: proof.id,
                                              at: proof.recordedAt,
                                              title: `Wave ${proof.wave} proof`,
                                              detail:
                                                "The bound device signed the decoded key.",
                                              tone: "success",
                                            }))}
                                            empty="This student did not submit a signed proof."
                                          />
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="page-section-title">Location evidence</p>
                                      <p className="page-section-sub">
                                        GPS distance appears only when both the student attempt
                                        and teacher start were captured.
                                      </p>
                                      <div style={{ marginTop: 10 }}>
                                        <LocationEvidence
                                          teacherLocation={
                                            record.teacherLocation ||
                                            sessionInfo.teacherLocation
                                          }
                                          attemptLocation={record.attemptLocation}
                                          distanceMeters={record.attemptDistanceMeters}
                                          radiusMeters={sessionInfo.geofenceRadiusMeters}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="register-detail__actions">
                                    <Button
                                      variant="soft"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedRecordId(record.id);
                                        setTab("evidence");
                                      }}
                                    >
                                      Open full evidence
                                    </Button>
                                    {isEvidenceBackedPending(record, drafts) && (
                                      <Button
                                        size="sm"
                                        onClick={() => acceptEvidence(record)}
                                      >
                                        <FiCheckCircle aria-hidden="true" /> Accept present
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="checkin__note">
                Attendance is a teacher decision. By default, acoustic proofs are evidence and do
                not mark anyone present. If you enable auto-present for this session, the first
                accepted proof marks a still-pending student present and the change is audited.
                Approved queries count as present.
              </p>
            </>
          )}

          {tab === "evidence" && (
            <div className="page-stack">
              {records.length === 0 ? (
                <p className="empty-inline">No students to show.</p>
              ) : (
                <>
                  <Field label="Student" htmlFor="register-student">
                    <select
                      id="register-student"
                      className="ui-input"
                      value={selectedRecord?.id || ""}
                      onChange={(event) => setSelectedRecordId(event.target.value)}
                    >
                      {records.map((record) => (
                        <option key={record.id} value={record.id}>
                          {record.studentName || record.studentEmail} — {record.status}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {selectedRecord && (
                    <>
                      <div className="metric-strip">
                        <div className="metric">
                          <div className="metric__label">Status</div>
                          <div className="metric__value" style={{ fontSize: 17 }}>{statusBadge(chosenStatus(selectedRecord))}</div>
                          <div className="metric__hint">Source: {selectedRecord.source}</div>
                        </div>
                        <div className="metric">
                          <div className="metric__label">Proofs</div>
                          <div className="metric__value">{selectedRecord.evidence?.proofCount || 0}</div>
                          <div className="metric__hint">
                            Waves {selectedRecord.evidence?.waves?.length ? selectedRecord.evidence.waves.join(", ") : "—"}
                          </div>
                        </div>
                        <div className="metric">
                          <div className="metric__label">Distance</div>
                          <div className="metric__value" style={{ fontSize: 18 }}>
                            {formatDistance(selectedRecord.attemptDistanceMeters)}
                          </div>
                          <div className="metric__hint">Student attempt to teacher start</div>
                        </div>
                        <div className="metric">
                          <div className="metric__label">Decision</div>
                          <div className="metric__value" style={{ fontSize: 13 }}>
                            {selectedRecord.markedAt ? formatDateTime(selectedRecord.markedAt) : "Not decided"}
                          </div>
                          <div className="metric__hint">{selectedRecord.markedByEmail || "—"}</div>
                        </div>
                      </div>

                      <LocationEvidence
                        teacherLocation={selectedRecord.teacherLocation || sessionInfo.teacherLocation}
                        attemptLocation={selectedRecord.attemptLocation}
                        distanceMeters={selectedRecord.attemptDistanceMeters}
                        radiusMeters={sessionInfo.geofenceRadiusMeters}
                      />

                      {selectedRecord.decisionNote && (
                        <div className="notice notice--info">
                          <FiCheckCircle className="notice__icon" aria-hidden="true" />
                          <div><strong>Decision note</strong><p>{selectedRecord.decisionNote}</p></div>
                        </div>
                      )}

                      {isAdmin && (
                        <div className="danger-zone">
                          <h3>Remove this register row</h3>
                          <p>
                            Deletes the attendance record for this teacher and session. The audit
                            log keeps the actor, the previous status and the removal time. The
                            student will no longer see this session in their register.
                          </p>
                          {!confirmDelete ? (
                            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                              <FiTrash2 aria-hidden="true" /> Delete attendance row
                            </Button>
                          ) : (
                            <div className="page-toolbar">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={deleteRecord}
                                loading={deletingRecord}
                              >
                                Confirm delete
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDelete(false)}
                                disabled={deletingRecord}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {!isAdmin && (
                        <div>
                          <p className="page-section-title">Proofs received</p>
                          <p className="page-section-sub">
                            Signed evidence expires after about 24 hours. The register keeps the
                            denormalised counters.
                          </p>
                          <div style={{ marginTop: 10 }}>
                            {proofErrorNotice ? (
                              proofErrorNotice
                            ) : proofs.loading ? (
                              <div className="loading-inline"><Spinner /> Loading proofs…</div>
                            ) : proofs.proofs.length === 0 ? (
                              <p className="empty-inline">No signed proofs were submitted for this session.</p>
                            ) : (
                              <EventTimeline
                                compact
                                events={proofs.proofs
                                  .filter((proof) => proof.studentEmail === selectedRecord.studentEmail)
                                  .map((proof) => ({
                                    id: proof.id,
                                    at: proof.recordedAt,
                                    title: `Wave ${proof.wave} proof`,
                                    detail: "The bound device signed the decoded key.",
                                    tone: "success",
                                  }))}
                                empty="This student did not submit a signed proof."
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "timeline" && (
            <div className="page-stack">
              <div className="chip-row">
                <span className="chip chip--indigo">Wave {sessionInfo.wave ?? 0}</span>
                <span className="chip">{proofs.total} proof{proofs.total === 1 ? "" : "s"}</span>
                {proofs.byWave.map((entry) => (
                  <span className="chip chip--success" key={entry.wave}>
                    Wave {entry.wave} · {entry.count}
                  </span>
                ))}
                {isAdmin && <span className="chip chip--warning">Admin view · proofs unavailable</span>}
              </div>
              {proofErrorNotice}
              <EventTimeline
                events={timelineEvents}
                empty="No session events were recorded."
              />
              <div className="notice notice--info">
                <FiShield className="notice__icon" aria-hidden="true" />
                <div>
                  <strong>What this timeline means</strong>
                  <p>
                    Waves show acoustic transport progress. Proofs show which bound phones heard
                    the current key. Neither is an automatic attendance decision; the register on
                    the previous tab is owned by the teacher.
                  </p>
                </div>
              </div>
            </div>
          )}

          {data.queries.length > 0 && (
            <div>
              <div className="section-head">
                <div>
                  <p className="page-section-title">Queries attached to this session</p>
                  <p className="page-section-sub">Approved queries count as present in the register.</p>
                </div>
                <Button variant="soft" size="sm" onClick={() => { window.location.assign("/queries"); }}>
                  Open query centre
                </Button>
              </div>
              <div className="query-list" style={{ marginTop: 10 }}>
                {data.queries.slice(0, 6).map((query) => (
                  <div className="query-card" key={query.id}>
                    <div className="query-card__head">
                      <div>
                        <h3 className="query-card__title">{query.studentName || query.studentEmail}</h3>
                        <p className="query-card__sub">
                          {formatDateTime(query.createdAt)} · {formatDistance(query.distanceMeters)} from teacher
                        </p>
                      </div>
                      <Badge
                        variant={
                          query.status === "approved"
                            ? "success"
                            : query.status === "rejected"
                            ? "danger"
                            : query.status === "expired"
                            ? "neutral"
                            : "warning"
                        }
                      >
                        {query.status}
                      </Badge>
                    </div>
                    <div className="query-card__body">{query.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="checkin__note" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <FiMapPin aria-hidden="true" /> Location is optional evidence. A missing or inaccurate
            snapshot never blocks a check-in or a query; it is shown so the teacher can judge the
            claim alongside the acoustic evidence.
          </p>
        </div>
      )}
    </Modal>
  );
};

export default SessionAttendanceModal;
