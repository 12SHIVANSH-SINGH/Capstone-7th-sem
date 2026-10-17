import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import SERVER_URL from "../../config/api";
import "./classManagement.css";

const blankClass = { courseCode: "", title: "", section: "", roomId: "" };
const requestConfig = { withCredentials: true };

const ClassManagement = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [formData, setFormData] = useState(blankClass);
  const [selectedClass, setSelectedClass] = useState(null);
  const [rosterText, setRosterText] = useState("");
  const [preview, setPreview] = useState(null);
  const [roster, setRoster] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [classesResponse, roomsResponse, reviewsResponse] = await Promise.all([
      axios.get(`${SERVER_URL}/classes`, requestConfig),
      axios.get(`${SERVER_URL}/rooms`, requestConfig),
      axios.get(`${SERVER_URL}/device-reviews`, requestConfig),
    ]);
    setClasses(classesResponse.data.classes);
    setRooms(roomsResponse.data.rooms);
    setReviews(reviewsResponse.data.reviews);
  }, []);

  useEffect(() => {
    const initialise = async () => {
      try {
        const userResponse = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
        if (userResponse.data.user.role !== "teacher") {
          navigate("/student-dashboard");
          return;
        }
        await loadData();
      } catch (requestError) {
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    initialise();
  }, [navigate, loadData]);

  const showRequestError = (requestError, fallback) => {
    setError(requestError.response?.data?.message || fallback);
  };

  const handleCreateClass = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await axios.post(`${SERVER_URL}/classes`, formData, requestConfig);
      setFormData(blankClass);
      setSelectedClass(response.data.courseClass);
      setRosterText("");
      setPreview(null);
      setRoster([]);
      setMessage("Class created. Paste or upload its roster below.");
      await loadData();
    } catch (requestError) {
      showRequestError(requestError, "Could not create the class.");
    } finally {
      setSaving(false);
    }
  };

  const selectClass = async (courseClass) => {
    setSelectedClass(courseClass);
    setPreview(null);
    setError("");
    setMessage("");

    try {
      const response = await axios.get(`${SERVER_URL}/classes/${courseClass._id}/roster`, requestConfig);
      setRoster(response.data.enrollments);
      setRosterText(response.data.enrollments.map((entry) => `${entry.email}${entry.name ? `,${entry.name}` : ""}`).join("\n"));
    } catch (requestError) {
      showRequestError(requestError, "Could not load this roster.");
    }
  };

  const previewRoster = async () => {
    if (!selectedClass) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await axios.post(
        `${SERVER_URL}/classes/${selectedClass._id}/roster/preview`,
        { rosterText },
        requestConfig
      );
      setPreview(response.data.preview);
      setMessage("Preview is ready. Save only after resolving any errors.");
    } catch (requestError) {
      showRequestError(requestError, "Could not preview the roster.");
    } finally {
      setSaving(false);
    }
  };

  const saveRoster = async () => {
    if (!selectedClass || !preview || preview.errors.length > 0) return;
    setSaving(true);
    setError("");

    try {
      const response = await axios.put(
        `${SERVER_URL}/classes/${selectedClass._id}/roster`,
        { rosterText },
        requestConfig
      );
      const savedCount = response.data.activeStudentCount;
      setPreview(null);
      await selectClass(selectedClass);
      await loadData();
      setMessage(`Roster saved: ${savedCount} active students.`);
    } catch (requestError) {
      showRequestError(requestError, "Could not save the roster.");
    } finally {
      setSaving(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setRosterText(String(reader.result || ""));
      setPreview(null);
    };
    reader.readAsText(file);
  };

  const decideReview = async (reviewId, decision) => {
    setSaving(true);
    setError("");
    try {
      await axios.post(`${SERVER_URL}/device-reviews/${reviewId}`, { decision }, requestConfig);
      setMessage(`Device ${decision}.`);
      await loadData();
    } catch (requestError) {
      showRequestError(requestError, "Could not update this device review.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="class-page-loading">Loading class management…</div>;

  return (
    <main className="class-management">
      <header className="class-management__header">
        <div>
          <p className="class-management__eyebrow">Teacher workspace</p>
          <h1>Classes & rosters</h1>
          <p>Create a class once, then reuse its verified student roster for every attendance session.</p>
        </div>
        <button className="class-management__back" onClick={() => navigate("/teacher-dashboard")}>Back to dashboard</button>
      </header>

      {error && <div className="class-management__alert class-management__alert--error">{error}</div>}
      {message && <div className="class-management__alert class-management__alert--success">{message}</div>}

      <section className="class-management__grid">
        <form className="class-management__card" onSubmit={handleCreateClass}>
          <h2>Create a class</h2>
          <label>Course code<input required value={formData.courseCode} onChange={(event) => setFormData({ ...formData, courseCode: event.target.value })} placeholder="CS101" /></label>
          <label>Class title<input required value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} placeholder="Data Structures" /></label>
          <label>Section <input value={formData.section} onChange={(event) => setFormData({ ...formData, section: event.target.value })} placeholder="A" /></label>
          <label>Default room
            <select required value={formData.roomId} onChange={(event) => setFormData({ ...formData, roomId: event.target.value })}>
              <option value="">Select a room</option>
              {rooms.map((room) => <option key={room._id} value={room._id}>{room.roomNo}</option>)}
            </select>
          </label>
          {rooms.length === 0 && <p className="class-management__hint">Create a room before creating a class.</p>}
          <button type="submit" disabled={saving || rooms.length === 0}>Create class</button>
        </form>

        <section className="class-management__card">
          <h2>Your classes</h2>
          {classes.length === 0 ? <p className="class-management__empty">No classes yet.</p> : (
            <div className="class-management__list">
              {classes.map((courseClass) => (
                <button key={courseClass._id} className={`class-management__class ${selectedClass?._id === courseClass._id ? "is-selected" : ""}`} onClick={() => selectClass(courseClass)}>
                  <strong>{courseClass.courseCode}{courseClass.section ? ` · ${courseClass.section}` : ""}</strong>
                  <span>{courseClass.title}</span>
                  <small>{courseClass.defaultRoom?.roomNo || "No room"} · {courseClass.activeStudentCount} active students</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>

      {selectedClass && (
        <section className="class-management__card class-management__roster">
          <div className="class-management__roster-heading">
            <div><p className="class-management__eyebrow">{selectedClass.courseCode}</p><h2>{selectedClass.title} roster</h2></div>
            <span>{roster.length} saved students</span>
          </div>
          <p>Paste one college email per line, or use <code>email,name</code> CSV. Only <code>@nitjsr.ac.in</code> addresses can be saved.</p>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} />
          <textarea value={rosterText} onChange={(event) => { setRosterText(event.target.value); setPreview(null); }} placeholder={"email,name\n2023ugcs059@nitjsr.ac.in,Student Name"} rows="11" />
          <div className="class-management__actions">
            <button onClick={previewRoster} disabled={saving || !rosterText.trim()}>Preview roster</button>
            <button className="class-management__save" onClick={saveRoster} disabled={saving || !preview || preview.errors.length > 0}>Save roster</button>
          </div>

          {preview && (
            <div className="class-management__preview">
              <h3>{preview.entries.length} valid students</h3>
              {preview.errors.length > 0 && <ul className="class-management__errors">{preview.errors.map((entry, index) => <li key={`${entry.row}-${index}`}>{entry.row ? `Row ${entry.row}: ` : ""}{entry.message}</li>)}</ul>}
              {preview.entries.length > 0 && <div className="class-management__chips">{preview.entries.slice(0, 12).map((entry) => <span key={entry.email}>{entry.email}</span>)}{preview.entries.length > 12 && <span>+{preview.entries.length - 12} more</span>}</div>}
            </div>
          )}
        </section>
      )}

      <section className="class-management__card class-management__reviews">
        <div className="class-management__roster-heading">
          <div><p className="class-management__eyebrow">Attendance safety</p><h2>New-device review queue</h2></div>
          <span>{reviews.length} pending</span>
        </div>
        {reviews.length === 0 ? <p className="class-management__empty">No students are waiting for a device change review.</p> : (
          <div className="class-management__review-list">
            {reviews.map((review) => (
              <article key={review._id} className="class-management__review">
                <div><strong>{review.student?.name || "Student"}</strong><span>{review.student?.email}</span></div>
                <div className="class-management__review-actions">
                  <button onClick={() => decideReview(review._id, "approved")} disabled={saving}>Approve device</button>
                  <button className="class-management__reject" onClick={() => decideReview(review._id, "rejected")} disabled={saving}>Reject</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

export default ClassManagement;
