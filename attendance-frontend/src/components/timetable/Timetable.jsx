import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCalendar,
  FiClock,
  FiEdit3,
  FiFileText,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import { classLabel, formatDate } from "../../utils/format";
import {
  extractionSummary,
  importErrorMessage,
  isPdfFile,
} from "../../utils/timetableImport";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import { PageLoader } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import "./timetable.css";

const requestConfig = { withCredentials: true };
const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

const Timetable = () => {
  const { user, loading, logout } = useRoleSession(["student", "teacher", "superadmin"]);
  const navigate = useNavigate();
  const toast = useToast();
  const role = user?.role || "student";
  const canEdit = role === "teacher" || role === "superadmin";

  const [entries, setEntries] = useState([]);
  const [days, setDays] = useState(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  const [term, setTerm] = useState("");
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [classFilter, setClassFilter] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [importingPdf, setImportingPdf] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const pdfInputRef = useRef(null);
  const [form, setForm] = useState({
    classId: "",
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    roomId: "",
    term: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const params = classFilter ? `?classId=${encodeURIComponent(classFilter)}` : "";
      const response = await axios.get(`${SERVER_URL}/timetable${params}`, requestConfig);
      setEntries(Array.isArray(response.data?.entries) ? response.data.entries : []);
      setDays(Array.isArray(response.data?.days) ? response.data.days : days);
      setTerm(response.data?.term || "");
    } catch (requestError) {
      if (requestError?.response?.status === 401) return;
      setError(messageFor(requestError, "Could not load the timetable."));
    }
  }, [classFilter, days]);

  const loadOptions = useCallback(async () => {
    if (!canEdit) return;
    try {
      const classUrl = role === "superadmin" ? `${SERVER_URL}/admin/classes` : `${SERVER_URL}/classes`;
      const [classResponse, roomResponse] = await Promise.all([
        axios.get(classUrl, requestConfig),
        axios.get(`${SERVER_URL}/rooms`, requestConfig),
      ]);
      const list = Array.isArray(classResponse.data?.classes) ? classResponse.data.classes : [];
      setClasses(
        list
          .filter((entry) => (role === "superadmin" ? true : entry.teacher === undefined || entry.teacher === null || String(entry.teacher?._id || entry.teacher) === String(user?._id) || !entry.teacher))
          .map((entry) => ({
            id: entry.id || entry._id,
            courseCode: entry.courseCode,
            title: entry.title,
            section: entry.section || "",
            teacher: entry.teacher,
            roomId: entry.room?.id || entry.defaultRoom?._id || "",
          }))
      );
      setRooms(Array.isArray(roomResponse.data?.rooms) ? roomResponse.data.rooms : []);
    } catch (requestError) {
      setError(messageFor(requestError, "Could not load classes and rooms."));
    }
  }, [canEdit, role, user?._id]);

  useEffect(() => {
    if (!user) return;
    const initialise = async () => {
      setPageLoading(true);
      await Promise.all([load(), loadOptions()]);
      setPageLoading(false);
    };
    initialise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, classFilter]);

  const grouped = useMemo(() => {
    const map = new Map(weekdayOrder.map((day) => [day, []]));
    entries.forEach((entry) => {
      if (!map.has(entry.dayOfWeek)) map.set(entry.dayOfWeek, []);
      map.get(entry.dayOfWeek).push(entry);
    });
    for (const list of map.values()) {
      list.sort((left, right) => left.startTime.localeCompare(right.startTime));
    }
    return map;
  }, [entries]);

  const openCreate = () => {
    const firstClass = classes[0];
    setEditor({ mode: "create" });
    setForm({
      classId: firstClass?.id || "",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      roomId: firstClass?.roomId || rooms[0]?._id || "",
      term,
    });
  };

  const openEdit = (entry) => {
    setEditor({ mode: "edit", entry });
    setForm({
      classId: entry.class?.id || "",
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.startTime,
      endTime: entry.endTime,
      roomId: entry.room?.id || "",
      term: entry.term || term,
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        classId: form.classId,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        roomId: form.roomId || undefined,
        term: form.term.trim(),
      };
      if (editor?.mode === "edit") {
        await axios.patch(`${SERVER_URL}/timetable/${editor.entry.id}`, body, requestConfig);
        toast("Timetable slot updated.", "success");
      } else {
        await axios.post(`${SERVER_URL}/timetable`, body, requestConfig);
        toast("Timetable slot added.", "success");
      }
      setEditor(null);
      await load();
    } catch (requestError) {
      toast(messageFor(requestError, "The timetable slot could not be saved."), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry) => {
    setDeleting(entry.id);
    try {
      await axios.delete(`${SERVER_URL}/timetable/${entry.id}`, requestConfig);
      toast("Timetable slot removed.", "success");
      setEditor(null);
      await load();
    } catch (requestError) {
      toast(messageFor(requestError, "The timetable slot could not be removed."), "error");
    } finally {
      setDeleting("");
    }
  };

  const importPdf = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || importingPdf) return;

    if (!isPdfFile(file)) {
      toast("Choose a PDF file to preview its text.", "error");
      return;
    }

    setImportingPdf(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await axios.post(
        `${SERVER_URL}/timetable/pdf/preview`,
        body,
        requestConfig
      );
      const extraction = response.data?.extraction || {};
      setImportText(String(extraction.text || ""));
      setImportFileName(String(extraction.fileName || file.name || ""));
      setImportNotice(extractionSummary(extraction));
      setImportOpen(true);
    } catch (requestError) {
      if (requestError?.response?.status === 401) {
        navigate("/login");
        return;
      }
      toast(importErrorMessage(requestError), "error");
    } finally {
      setImportingPdf(false);
    }
  };

  if (loading || pageLoading) return <PageLoader label="Loading timetable…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const name = user.name || user.email?.split("@")[0] || "You";
  const today = new Date().getDay();

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Timetable</h1>
          <p className="ui-page-head__sub">
            {canEdit
              ? "Plan the week so every class knows when its next check-in starts."
              : "Your weekly classes. Your teacher runs the check-in; this page is read-only for students."}
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" size="sm" onClick={load}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </Button>
          {canEdit && (
            <>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={importPdf}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => pdfInputRef.current?.click()}
                loading={importingPdf}
                disabled={importingPdf}
              >
                <FiUpload aria-hidden="true" /> Import PDF text
              </Button>
              <Button size="sm" onClick={openCreate} disabled={classes.length === 0}>
                <FiPlus aria-hidden="true" /> Add slot
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: 16 }}>
          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
          <div><strong>Timetable unavailable</strong><p>{error}</p></div>
        </div>
      )}

      <Card
        title={term ? `${term} timetable` : "Weekly timetable"}
        subtitle={`${entries.length} active slot${entries.length === 1 ? "" : "s"} · ${formatDate(new Date())}`}
        actions={
          <div className="page-toolbar__group">
            {canEdit && classes.length > 0 && (
              <Field label="Filter class" htmlFor="timetable-filter">
                <select id="timetable-filter" className="ui-input" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((entry) => (
                    <option key={entry.id} value={entry.id}>{classLabel(entry)}</option>
                  ))}
                </select>
              </Field>
            )}
            <Badge variant="info">Week view</Badge>
          </div>
        }
      >
        {entries.length === 0 ? (
          <EmptyState
            icon={<FiCalendar />}
            title="No timetable slots yet"
            text={canEdit ? "Add the first weekly slot so students can plan around it." : "Your teacher has not published a timetable for this term yet."}
            action={canEdit ? <Button variant="soft" onClick={openCreate} disabled={classes.length === 0}>Add a slot</Button> : null}
          />
        ) : (
          <div className="week-grid">
            {weekdayOrder.map((dayIndex) => (
              <div className="week-day" key={dayIndex}>
                <div className="week-day__head">
                  {days[dayIndex] || `Day ${dayIndex}`}
                  {today === dayIndex && <span className="chip chip--indigo" style={{ marginLeft: 6 }}>Today</span>}
                </div>
                <div className="week-day__slots">
                  {(grouped.get(dayIndex) || []).length === 0 ? (
                    <div className="timetable-empty">No classes</div>
                  ) : (
                    grouped.get(dayIndex).map((entry) => (
                      <article className="timetable-slot" key={entry.id}>
                        <div className="timetable-slot__time">{entry.startTime} – {entry.endTime}</div>
                        <div className="timetable-slot__code">{classLabel(entry.class)}</div>
                        <div className="timetable-slot__title">{entry.class?.title || ""}</div>
                        <div className="timetable-slot__title">
                          Room {entry.room?.roomNo || entry.class?.roomNo || "—"}
                          {role === "superadmin" && entry.class?.teacher?.name ? ` · ${entry.class.teacher.name}` : ""}
                        </div>
                        {canEdit && (
                          <div className="timetable-slot__actions">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}>
                              <FiEdit3 aria-hidden="true" /> Edit
                            </Button>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canEdit && (
        <div className="notice notice--info">
          <FiFileText className="notice__icon" aria-hidden="true" />
          <div>
            <strong>Timetable PDF import is text-only</strong>
            <p>
              Uploading extracts the selectable text for review. No slot or class is created:
              add each slot with <strong>Add slot</strong>. Scanned PDFs need local OCR, which
              is not built yet.
            </p>
          </div>
        </div>
      )}

      <div className="notice notice--info">
        <FiClock className="notice__icon" aria-hidden="true" />
        <div>
          <strong>Timetable is a plan, not a session</strong>
          <p>Starting a check-in is always an explicit teacher action. A timetable slot never starts a session or marks attendance on its own.</p>
        </div>
      </div>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === "edit" ? "Edit timetable slot" : "Add timetable slot"}
        subtitle="Times use a 24-hour clock. End time must be after start time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
            {editor?.mode === "edit" && (
              <Button
                variant="danger"
                onClick={() => remove(editor.entry)}
                loading={deleting === editor.entry.id}
              >
                <FiTrash2 aria-hidden="true" /> Delete
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!form.classId}>
              <FiPlus aria-hidden="true" /> {editor?.mode === "edit" ? "Save slot" : "Add slot"}
            </Button>
          </>
        }
      >
        <form className="page-stack" onSubmit={save}>
          <div className="form-grid">
            <Field label="Class" htmlFor="slot-class" className="ui-field--full">
              <select
                id="slot-class"
                className="ui-input"
                value={form.classId}
                onChange={(event) => {
                  const nextClass = classes.find((entry) => entry.id === event.target.value);
                  setForm((current) => ({
                    ...current,
                    classId: event.target.value,
                    roomId: nextClass?.roomId || current.roomId,
                  }));
                }}
                required
              >
                <option value="">Choose a class</option>
                {classes.map((entry) => (
                  <option key={entry.id} value={entry.id}>{classLabel(entry)} — {entry.title}</option>
                ))}
              </select>
            </Field>
            <Field label="Day" htmlFor="slot-day">
              <select
                id="slot-day"
                className="ui-input"
                value={form.dayOfWeek}
                onChange={(event) => setForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))}
              >
                {weekdayOrder.map((dayIndex) => (
                  <option key={dayIndex} value={dayIndex}>{days[dayIndex]}</option>
                ))}
              </select>
            </Field>
            <Field label="Room" htmlFor="slot-room">
              <select
                id="slot-room"
                className="ui-input"
                value={form.roomId}
                onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))}
              >
                <option value="">Use the class default</option>
                {rooms.map((room) => (
                  <option key={room._id} value={room._id}>{room.roomNo}</option>
                ))}
              </select>
            </Field>
            <Field label="Start time" htmlFor="slot-start">
              <input
                id="slot-start"
                type="time"
                className="ui-input"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                required
              />
            </Field>
            <Field label="End time" htmlFor="slot-end">
              <input
                id="slot-end"
                type="time"
                className="ui-input"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                required
              />
            </Field>
            <Field label="Term" htmlFor="slot-term" className="ui-field--full">
              <input
                id="slot-term"
                className="ui-input"
                value={form.term}
                onChange={(event) => setForm((current) => ({ ...current, term: event.target.value }))}
                maxLength={80}
                placeholder={term || "Autumn 2026"}
              />
            </Field>
          </div>
          {!classes.length && (
            <div className="notice notice--warning">
              <FiAlertTriangle className="notice__icon" aria-hidden="true" />
              <div>
                <strong>No classes available</strong>
                <p>{role === "superadmin" ? "Create a class and assign a teacher in the admin panel first." : "Create a class and roster before adding timetable slots."}</p>
              </div>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Timetable PDF text preview"
        subtitle={
          importFileName
            ? `${importFileName} · ${importNotice}`
            : importNotice
        }
        wide
        footer={<Button variant="secondary" onClick={() => setImportOpen(false)}>Close preview</Button>}
      >
        <div className="page-stack">
          <div className="notice notice--warning">
            <FiAlertTriangle className="notice__icon" aria-hidden="true" />
            <div>
              <strong>Nothing has been scheduled</strong>
              <p>
                This is the PDF's embedded text, not a parsed timetable. No class was matched,
                no slot was created and no attendance was changed. Use <strong>Add slot</strong>{" "}
                for each row you want to keep.
              </p>
            </div>
          </div>
          <Field
            label="Extracted text"
            htmlFor="timetable-import-text"
            hint="Read-only preview. Structured row parsing is not built until representative timetable samples are supplied."
          >
            <textarea
              id="timetable-import-text"
              className="ui-textarea timetable-import__text"
              value={importText}
              readOnly
              rows={16}
              spellCheck={false}
            />
          </Field>
        </div>
      </Modal>
    </AppShell>
  );
};

export default Timetable;
