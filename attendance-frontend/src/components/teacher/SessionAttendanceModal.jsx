import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
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
  const [proofs, setProofs] = useState({ loading: false, total: 0, byWave: [], proofs: [] });
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        total: Number(response.data?.total) || 0,
        byWave: Array.isArray(response.data?.byWave) ? response.data.byWave : [],
        proofs: Array.isArray(response.data?.proofs) ? response.data.proofs : [],
      });
    } catch (requestError) {
      setProofs({ loading: false, total: 0, byWave: [], proofs: [] });
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
    setProofs({ loading: false, total: 0, byWave: [], proofs: [] });
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
  const dirtyIds = Object.keys(drafts);
  const sessionInfo = useMemo(() => data.session || session || {}, [data.session, session]);

  const setStatus = (record, status) => {
    setDrafts((current) => {
      const next = { ...current };
      if (status === record.status) delete next[record.id];
      else next[record.id] = status;
      return next;
    });
  };

  const saveChanges = async () => {
    if (!dirtyIds.length) return;
    setSaving(true);
    try {
      if (isAdmin) {
        await withAdminStepUp(() =>
          Promise.all(
            dirtyIds.map((recordId) =>
              axios.patch(
                `${SERVER_URL}/admin/attendance/${recordId}`,
                {
                  status: drafts[recordId],
                  note: notes[recordId] || "Super-admin override from the register.",
                },
                requestConfig
              )
            )
          )
        );
        toast(`${dirtyIds.length} register row${dirtyIds.length === 1 ? "" : "s"} updated.`, "success");
      } else {
        await axios.patch(
          `${SERVER_URL}/check-in-sessions/${sessionId}/attendance`,
          {
            records: dirtyIds.map((recordId) => ({
              recordId,
              status: drafts[recordId],
              note: notes[recordId] || "",
            })),
          },
          requestConfig
        );
        toast(`${dirtyIds.length} register row${dirtyIds.length === 1 ? "" : "s"} saved.`, "success");
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

  const chosenStatus = (record) => drafts[record.id] || record.status;
  const hasChanges = dirtyIds.length > 0;
  const canFinalize =
    !isAdmin && sessionInfo.status === "closed" && !sessionInfo.attendanceFinalized;

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
              <FiSave aria-hidden="true" /> Save {dirtyIds.length} change{dirtyIds.length === 1 ? "" : "s"}
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
              {records.length === 0 ? (
                <EmptyState
                  icon={<FiUsers />}
                  title="No roster rows"
                  text="The roster was empty when this session started. Add students to the class before the next session."
                />
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Evidence</th>
                        <th>Location</th>
                        <th>Query</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id}>
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
                              <span className="chip">
                                {record.evidence?.proofCount || 0} proof{(record.evidence?.proofCount || 0) === 1 ? "" : "s"}
                              </span>
                              <span className="chip">{record.source}</span>
                            </div>
                          </td>
                          <td>
                            {record.attemptDistanceMeters !== null && record.attemptDistanceMeters !== undefined ? (
                              <span className="query-window">{formatDistance(record.attemptDistanceMeters)}</span>
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
                                setNotes((current) => ({ ...current, [record.id]: event.target.value }))
                              }
                              placeholder="Decision note"
                              maxLength={500}
                              aria-label={`Decision note for ${record.studentEmail}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="checkin__note">
                Attendance is a teacher decision. Acoustic proofs show that a phone heard a wave;
                they do not mark anyone present automatically. Approved queries count as present.
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
                            {proofs.loading ? (
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
