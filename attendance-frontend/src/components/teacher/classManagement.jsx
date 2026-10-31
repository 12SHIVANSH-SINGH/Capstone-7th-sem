import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronRight,
  FiPlus,
  FiRefreshCw,
  FiShield,
  FiUpload,
  FiUsers,
  FiX,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import { PageLoader } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import "./classManagement.css";

const blankClass = { courseCode: "", title: "", section: "", roomId: "" };
const requestConfig = { withCredentials: true };
const SAMPLE_ROSTER = [
  "email,name",
  "2023ugcs001@nitjsr.ac.in,Aarav Kumar",
  "2023ugcs002@nitjsr.ac.in,Diya Sharma",
  "2023ugcs003@nitjsr.ac.in,Kabir Singh",
].join("\n");

const isUnauthorised = (error) => error?.response?.status === 401;

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const shortDate = (value) => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const rosterEmails = (entries) =>
  new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.email));

const ClassManagement = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [formData, setFormData] = useState(blankClass);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomDraft, setRoomDraft] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);

  const [selectedClass, setSelectedClass] = useState(null);
  const [roster, setRoster] = useState([]);
  const [rosterText, setRosterText] = useState("");
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState("");
  const [preview, setPreview] = useState(null);
  const [pendingSave, setPendingSave] = useState(false);

  const [sectionErrors, setSectionErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [creatingClass, setCreatingClass] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [savingRoster, setSavingRoster] = useState(false);
  const [reviewing, setReviewing] = useState(null);

  const rosterRequestRef = useRef(0);
  const previewRequestRef = useRef(0);

  const loadClasses = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/classes`, requestConfig);
      setClasses(Array.isArray(response.data.classes) ? response.data.classes : []);
      setSectionErrors((current) => ({ ...current, classes: "" }));
      return true;
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return false;
      }
      setSectionErrors((current) => ({
        ...current,
        classes: messageFor(requestError, "Could not load your classes."),
      }));
      return false;
    }
  }, [navigate]);

  const loadRooms = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/rooms`, requestConfig);
      setRooms(Array.isArray(response.data.rooms) ? response.data.rooms : []);
      setSectionErrors((current) => ({ ...current, rooms: "" }));
      return true;
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return false;
      }
      setSectionErrors((current) => ({
        ...current,
        rooms: messageFor(requestError, "Could not load rooms."),
      }));
      return false;
    }
  }, [navigate]);

  const loadReviews = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/device-reviews`, requestConfig);
      setReviews(Array.isArray(response.data.reviews) ? response.data.reviews : []);
      setSectionErrors((current) => ({ ...current, reviews: "" }));
      return true;
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return false;
      }
      setSectionErrors((current) => ({
        ...current,
        reviews: messageFor(requestError, "Could not load the device review queue."),
      }));
      return false;
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      try {
        const userResponse = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
        if (cancelled) return;
        if (userResponse.data?.user?.role !== "teacher") {
          navigate("/student-dashboard");
          return;
        }
        setUser(userResponse.data.user);
      } catch (requestError) {
        if (cancelled) return;
        if (isUnauthorised(requestError)) {
          navigate("/login");
        } else {
          setSectionErrors((current) => ({
            ...current,
            session: messageFor(requestError, "Could not confirm your session. Try signing in again."),
          }));
        }
        setLoading(false);
        return;
      }

      // A data request failing is not a sign-out. Only /islogin decides that.
      await Promise.allSettled([loadClasses(), loadRooms(), loadReviews()]);
      if (!cancelled) setLoading(false);
    };

    initialise();
    return () => {
      cancelled = true;
    };
  }, [loadClasses, loadReviews, loadRooms, navigate]);

  const resetRosterState = useCallback(() => {
    rosterRequestRef.current += 1;
    previewRequestRef.current += 1;
    setRoster([]);
    setRosterText("");
    setRosterLoading(false);
    setRosterError("");
    setPreview(null);
    setPendingSave(false);
  }, []);

  const selectClass = useCallback(
    async (courseClass) => {
      if (!courseClass?._id) return;

      setSelectedClass(courseClass);
      resetRosterState();
      setRosterLoading(true);
      const requestId = rosterRequestRef.current;

      try {
        const response = await axios.get(
          `${SERVER_URL}/classes/${courseClass._id}/roster`,
          requestConfig
        );
        // A slower response for a previous class must never land in this one.
        if (requestId !== rosterRequestRef.current) return;
        const enrollments = Array.isArray(response.data.enrollments)
          ? response.data.enrollments
          : [];
        setRoster(enrollments);
        setRosterText(
          enrollments
            .map((entry) => `${entry.email}${entry.name ? `,${entry.name}` : ""}`)
            .join("\n")
        );
        setRosterError("");
      } catch (requestError) {
        if (requestId !== rosterRequestRef.current) return;
        if (isUnauthorised(requestError)) {
          navigate("/login");
          return;
        }
        setRosterError(messageFor(requestError, "Could not load this roster."));
      } finally {
        if (requestId === rosterRequestRef.current) setRosterLoading(false);
      }
    },
    [navigate, resetRosterState]
  );

  const handleCreateClass = async (event) => {
    event.preventDefault();
    if (creatingClass) return;
    setCreatingClass(true);

    try {
      const response = await axios.post(`${SERVER_URL}/classes`, formData, requestConfig);
      setFormData(blankClass);
      toast("Class created. Add its roster below.", "success");
      await loadClasses();
      if (response.data?.courseClass) {
        await selectClass(response.data.courseClass);
      }
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(messageFor(requestError, "Could not create the class."), "error");
    } finally {
      setCreatingClass(false);
    }
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();
    const roomNo = roomDraft.trim();
    if (!roomNo || creatingRoom) return;

    setCreatingRoom(true);
    try {
      const response = await axios.post(`${SERVER_URL}/rooms`, { roomNo }, requestConfig);
      const room = response.data?.room;
      setRoomDraft("");
      setShowRoomForm(false);
      await loadRooms();
      if (room?._id) {
        setFormData((current) => ({ ...current, roomId: room._id }));
      }
      toast(`Room ${roomNo} added and selected.`, "success");
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(messageFor(requestError, "Could not add the room."), "error");
    } finally {
      setCreatingRoom(false);
    }
  };

  const previewRoster = async () => {
    if (!selectedClass?._id || previewing) return;
    if (!rosterText.trim()) {
      toast("Paste at least one student email first.", "error");
      return;
    }

    const classId = selectedClass._id;
    previewRequestRef.current += 1;
    const requestId = previewRequestRef.current;
    setPreviewing(true);
    setPreview(null);
    setPendingSave(false);

    try {
      const response = await axios.post(
        `${SERVER_URL}/classes/${classId}/roster/preview`,
        { rosterText },
        requestConfig
      );
      if (requestId !== previewRequestRef.current) return;
      setPreview({ ...response.data.preview, classId });
      if (response.data.preview?.errors?.length) {
        toast("Preview found rows that need fixing.", "error");
      } else {
        toast(`${response.data.preview.entries.length} students are ready to save.`, "success");
      }
    } catch (requestError) {
      if (requestId !== previewRequestRef.current) return;
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(messageFor(requestError, "Could not preview the roster."), "error");
    } finally {
      if (requestId === previewRequestRef.current) setPreviewing(false);
    }
  };

  const requestSaveRoster = () => {
    if (!preview || preview.classId !== selectedClass?._id) return;
    if (preview.errors.length > 0 || preview.entries.length === 0) return;
    setPendingSave(true);
  };

  const saveRoster = async () => {
    if (!selectedClass?._id || !preview || preview.classId !== selectedClass._id) return;
    if (preview.errors.length > 0 || preview.entries.length === 0) return;

    const classId = selectedClass._id;
    const savedClass = selectedClass;
    setSavingRoster(true);

    try {
      const response = await axios.put(
        `${SERVER_URL}/classes/${classId}/roster`,
        { rosterText },
        requestConfig
      );
      setPendingSave(false);
      setPreview(null);
      toast(`Roster saved: ${response.data.activeStudentCount} active students.`, "success");
      await selectClass(savedClass);
      await loadClasses();
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(messageFor(requestError, "Could not save the roster."), "error");
    } finally {
      setSavingRoster(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setRosterText(String(reader.result || ""));
      setPreview(null);
      setPendingSave(false);
    };
    reader.onerror = () => toast("Could not read that file. Paste its contents instead.", "error");
    reader.readAsText(file);
    event.target.value = "";
  };

  const decideReview = async (reviewId, decision) => {
    if (reviewing) return;
    setReviewing({ id: reviewId, decision });

    try {
      await axios.post(`${SERVER_URL}/device-reviews/${reviewId}`, { decision }, requestConfig);
      toast(decision === "approved" ? "Device approved." : "Device rejected.", "success");
      await loadReviews();
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(messageFor(requestError, "Could not update this device review."), "error");
    } finally {
      setReviewing(null);
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await axios.post(`${SERVER_URL}/logout`, null, requestConfig);
    } catch (error) {
      // Sign-out is best-effort; the local session ends either way.
    }
    navigate("/");
  }, [navigate]);

  const activeNow = roster.length;
  const nextEmails = useMemo(() => rosterEmails(preview?.entries), [preview]);
  const removedCount = useMemo(
    () => roster.filter((entry) => !nextEmails.has(entry.email)).length,
    [nextEmails, roster]
  );
  const addedCount = useMemo(
    () => (preview?.entries || []).filter((entry) => !rosterEmails(roster).has(entry.email)).length,
    [preview, roster]
  );
  const previewMatchesClass = Boolean(preview && preview.classId === selectedClass?._id);
  const canPreview = Boolean(selectedClass && rosterText.trim() && !rosterLoading && !previewing);
  const canSave = Boolean(
    previewMatchesClass &&
      preview.errors.length === 0 &&
      preview.entries.length > 0 &&
      !savingRoster
  );

  if (loading) return <PageLoader label="Loading class management…" />;
  if (!user) {
    return (
      <main className="class-page-fallback">
        <Card title="Could not open class management">
          <p className="class-mgmt__muted">
            {sectionErrors.session || "Your session could not be confirmed."}
          </p>
          <Button onClick={() => navigate("/login")}>Go to sign in</Button>
        </Card>
      </main>
    );
  }

  const name = user.name || user.email?.split("@")[0] || "Teacher";

  return (
    <AppShell
      role="teacher"
      name={name}
      email={user.email}
      onLogout={handleLogout}
      links={[
        { to: "/teacher-dashboard", label: "Dashboard" },
        { to: "/teacher/classes", label: "Classes & rosters", active: true },
        { to: "/teacher/check-in", label: "Check-in" },
        { to: "/acoustic-lab", label: "Phone audio test" },
      ]}
    >
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Classes &amp; rosters</h1>
          <p className="ui-page-head__sub">
            Create a class once, keep its verified roster current, and approve student devices
            before check-ins begin.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" onClick={() => navigate("/teacher-dashboard")}>
            Back to dashboard
          </Button>
          <Button onClick={() => setShowRoomForm((visible) => !visible)}>
            <FiPlus aria-hidden="true" />
            Add room
          </Button>
        </div>
      </div>

      <section className="class-mgmt__grid">
        <Card
          title="Create a class"
          subtitle="A class needs a course code, title and default room."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRoomForm((visible) => !visible)}
            >
              <FiPlus aria-hidden="true" /> New room
            </Button>
          }
        >
          {showRoomForm && (
            <form className="class-mgmt__room-form" onSubmit={handleCreateRoom}>
              <Field
                label="Room number"
                htmlFor="new-room"
                hint="Shown in the class list. Adding a room does not change any existing class."
              >
                <input
                  id="new-room"
                  className="ui-input"
                  value={roomDraft}
                  onChange={(event) => setRoomDraft(event.target.value)}
                  placeholder="e.g. CS-204"
                  maxLength={40}
                />
              </Field>
              <div className="class-mgmt__inline-actions">
                <Button type="submit" size="sm" loading={creatingRoom} disabled={!roomDraft.trim()}>
                  Add room
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowRoomForm(false);
                    setRoomDraft("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {sectionErrors.rooms && (
            <p className="class-mgmt__inline-error" role="alert">
              {sectionErrors.rooms}{" "}
              <button type="button" className="class-mgmt__link" onClick={loadRooms}>
                Retry
              </button>
            </p>
          )}

          <form className="class-mgmt__form" onSubmit={handleCreateClass}>
            <div className="class-mgmt__form-row">
              <Field label="Course code" htmlFor="course-code">
                <input
                  id="course-code"
                  className="ui-input"
                  required
                  value={formData.courseCode}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, courseCode: event.target.value }))
                  }
                  placeholder="CS101"
                  maxLength={24}
                />
              </Field>
              <Field label="Section" htmlFor="section">
                <input
                  id="section"
                  className="ui-input"
                  value={formData.section}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, section: event.target.value }))
                  }
                  placeholder="A"
                  maxLength={16}
                />
              </Field>
            </div>

            <Field label="Class title" htmlFor="title">
              <input
                id="title"
                className="ui-input"
                required
                value={formData.title}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Data Structures"
                maxLength={120}
              />
            </Field>

            <Field
              label="Default room"
              htmlFor="room"
              hint={
                rooms.length === 0
                  ? "No rooms exist yet. Add one above before creating the class."
                  : "All rooms are shared by teachers; only your classes are listed here."
              }
            >
              <select
                id="room"
                className="ui-input"
                required
                value={formData.roomId}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, roomId: event.target.value }))
                }
              >
                <option value="">Select a room</option>
                {rooms.map((room) => (
                  <option key={room._id} value={room._id}>
                    {room.roomNo}
                  </option>
                ))}
              </select>
            </Field>

            <Button
              type="submit"
              loading={creatingClass}
              disabled={rooms.length === 0}
              block
            >
              Create class
            </Button>
          </form>
        </Card>

        <Card
          title="Your classes"
          subtitle="Select a class to edit its roster."
          actions={
            <Button variant="ghost" size="sm" onClick={loadClasses}>
              <FiRefreshCw aria-hidden="true" /> Refresh
            </Button>
          }
        >
          {sectionErrors.classes ? (
            <div className="class-mgmt__section-error" role="alert">
              <p>{sectionErrors.classes}</p>
              <Button variant="secondary" size="sm" onClick={loadClasses}>
                Retry
              </Button>
            </div>
          ) : classes.length === 0 ? (
            <EmptyState
              icon={<FiUsers />}
              title="No classes yet"
              text="Create your first class, then paste its roster. Students only appear after their email is on an active roster."
            />
          ) : (
            <div className="class-mgmt__class-list">
              {classes.map((courseClass) => {
                const selected = selectedClass?._id === courseClass._id;
                return (
                  <button
                    key={courseClass._id}
                    type="button"
                    className={`class-mgmt__class ${selected ? "is-selected" : ""}`}
                    onClick={() => selectClass(courseClass)}
                    aria-pressed={selected}
                  >
                    <span className="class-mgmt__class-main">
                      <strong>
                        {courseClass.courseCode}
                        {courseClass.section ? ` · ${courseClass.section}` : ""}
                      </strong>
                      <span>{courseClass.title}</span>
                      <small>
                        {courseClass.defaultRoom?.roomNo || "No room"} ·{" "}
                        {courseClass.activeStudentCount || 0} active students
                      </small>
                    </span>
                    <FiChevronRight aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {selectedClass && (
        <Card
          className="class-mgmt__roster"
          title={`${selectedClass.courseCode}${selectedClass.section ? ` · ${selectedClass.section}` : ""} roster`}
          subtitle={`${selectedClass.title} · ${activeNow} active student${activeNow === 1 ? "" : "s"} saved`}
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selectClass(selectedClass)}
              loading={rosterLoading}
            >
              <FiRefreshCw aria-hidden="true" /> Reload
            </Button>
          }
        >
          <p className="class-mgmt__muted">
            Paste one <code>@nitjsr.ac.in</code> email per line, or use <code>email,name</code> CSV.
            Rehearsal builds may also accept an allowlisted test account. Saving replaces the
            active roster: students missing from the new list are marked inactive, not deleted.
          </p>

          {rosterError && (
            <div className="class-mgmt__section-error" role="alert">
              <p>{rosterError}</p>
              <Button variant="secondary" size="sm" onClick={() => selectClass(selectedClass)}>
                Retry roster
              </Button>
            </div>
          )}

          <div className="class-mgmt__roster-tools">
            <label className="ui-btn ui-btn--secondary ui-btn--sm class-mgmt__file">
              <FiUpload aria-hidden="true" />
              Upload CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} />
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRosterText(SAMPLE_ROSTER);
                setPreview(null);
                setPendingSave(false);
              }}
            >
              Load sample
            </Button>
            <span className="class-mgmt__muted class-mgmt__roster-count">
              {rosterLoading ? "Loading roster…" : `${activeNow} currently active`}
            </span>
          </div>

          <Field
            label="Roster CSV"
            htmlFor="roster-text"
            hint="A header row named email is optional. Duplicate and non-institutional rows are rejected in the preview unless the server has rehearsal enrollment enabled."
          >
            <textarea
              id="roster-text"
              className="ui-textarea class-mgmt__textarea"
              value={rosterText}
              onChange={(event) => {
                setRosterText(event.target.value);
                setPreview(null);
                setPendingSave(false);
              }}
              placeholder={"email,name\n2023ugcs001@nitjsr.ac.in,Aarav Kumar"}
              rows={12}
              spellCheck={false}
              disabled={rosterLoading}
            />
          </Field>

          <div className="class-mgmt__actions">
            <Button variant="secondary" onClick={previewRoster} loading={previewing} disabled={!canPreview}>
              Preview roster
            </Button>
            <Button onClick={requestSaveRoster} disabled={!canSave}>
              Save roster
            </Button>
          </div>

          {previewMatchesClass && (
            <div className="class-mgmt__preview">
              <div className="class-mgmt__preview-head">
                <div>
                  <h3>
                    {preview.errors.length > 0
                      ? "Fix these rows before saving"
                      : `${preview.entries.length} valid student${preview.entries.length === 1 ? "" : "s"}`}
                  </h3>
                  <p className="class-mgmt__muted">
                    {preview.errors.length > 0
                      ? "No changes can be saved until every listed error is fixed."
                      : `Compared with the saved roster: ${addedCount} added, ${removedCount} removed.`}
                  </p>
                </div>
                <Badge variant={preview.errors.length > 0 ? "danger" : "success"}>
                  {preview.errors.length > 0 ? `${preview.errors.length} error${preview.errors.length === 1 ? "" : "s"}` : "Ready"}
                </Badge>
              </div>

              {preview.errors.length > 0 && (
                <ul className="class-mgmt__errors">
                  {preview.errors.map((entry, index) => (
                    <li key={`${entry.row || "general"}-${index}`}>
                      <FiX aria-hidden="true" />
                      <span>
                        {entry.row ? `Row ${entry.row}: ` : ""}
                        {entry.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {preview.entries.length === 0 && preview.errors.length === 0 && (
                <p className="class-mgmt__inline-error" role="alert">
                  No usable student rows were found. Add at least one college email.
                </p>
              )}

              {preview.entries.length > 0 && (
                <div className="class-mgmt__chips">
                  {preview.entries.slice(0, 12).map((entry) => (
                    <span key={entry.email}>{entry.email}</span>
                  ))}
                  {preview.entries.length > 12 && (
                    <span>+{preview.entries.length - 12} more</span>
                  )}
                </div>
              )}
            </div>
          )}

          {pendingSave && previewMatchesClass && (
            <div className="class-mgmt__confirm" role="alert" aria-labelledby="confirm-save-title">
              <div className="class-mgmt__confirm-icon" aria-hidden="true">
                <FiAlertTriangle />
              </div>
              <div className="class-mgmt__confirm-body">
                <h3 id="confirm-save-title">Replace this class roster?</h3>
                <p>
                  {preview.entries.length} students will be active. {addedCount} will be added and{" "}
                  {removedCount} currently active student{removedCount === 1 ? "" : "s"} will become
                  inactive. Existing enrollment history is kept.
                </p>
                <div className="class-mgmt__confirm-actions">
                  <Button variant="danger" onClick={saveRoster} loading={savingRoster}>
                    <FiCheck aria-hidden="true" /> Confirm save
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingSave(false)} disabled={savingRoster}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card
        className="class-mgmt__reviews"
        title="New-device review queue"
        subtitle="A student on a new browser must be approved before check-in."
        actions={<Badge variant={reviews.length > 0 ? "warning" : "success"}>{reviews.length} pending</Badge>}
      >
        {sectionErrors.reviews ? (
          <div className="class-mgmt__section-error" role="alert">
            <p>{sectionErrors.reviews}</p>
            <Button variant="secondary" size="sm" onClick={loadReviews}>
              Retry
            </Button>
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={<FiShield />}
            title="No device reviews waiting"
            text="When a student signs in from a new browser, their request appears here for approval."
          />
        ) : (
          <div className="class-mgmt__review-list">
            {reviews.map((review) => {
              const busy = reviewing?.id === review._id;
              return (
                <article key={review._id} className="class-mgmt__review">
                  <div className="class-mgmt__review-student">
                    <strong>{review.student?.name || "Student"}</strong>
                    <span>{review.student?.email || "Email unavailable"}</span>
                    <small>Requested {shortDate(review.createdAt)}</small>
                  </div>
                  <div className="class-mgmt__review-actions">
                    <Button
                      size="sm"
                      loading={busy && reviewing.decision === "approved"}
                      disabled={Boolean(reviewing)}
                      onClick={() => decideReview(review._id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy && reviewing.decision === "rejected"}
                      disabled={Boolean(reviewing)}
                      onClick={() => decideReview(review._id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <p className="class-mgmt__footer">
        Rosters are used for attendance attribution only. A student still needs an approved device
        before a check-in can be accepted.
      </p>
    </AppShell>
  );
};

export default ClassManagement;
