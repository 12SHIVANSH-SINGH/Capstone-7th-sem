import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  FiActivity,
  FiAlertTriangle,
  FiBookOpen,
  FiCalendar,
  FiDatabase,
  FiDownload,
  FiEdit3,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiShield,
  FiUserCheck,
  FiUsers,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import {
  classLabel,
  formatDate,
  formatDateTime,
  percentLabel,
} from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import { PageLoader, Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import EventTimeline from "../shared/EventTimeline";
import SessionAttendanceModal from "../teacher/SessionAttendanceModal";

const requestConfig = { withCredentials: true };
const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "users", label: "Users" },
  { value: "classes", label: "Classes" },
  { value: "sessions", label: "Sessions" },
  { value: "audit", label: "Audit" },
  { value: "settings", label: "Settings" },
  { value: "demo", label: "Demo data" },
];

const dateInput = (value) => (value ? String(value).slice(0, 10) : "");

const emptyUserForm = {
  name: "",
  email: "",
  role: "student",
  status: "active",
  rollNumber: "",
  phoneLabel: "",
  demoLabel: "",
  isDemo: false,
};

const emptyClassForm = {
  courseCode: "",
  title: "",
  section: "",
  teacherId: "",
  roomId: "",
  isDemo: false,
};

const AdminPanel = () => {
  const { user, loading, logout } = useRoleSession(["superadmin"]);
  const toast = useToast();

  const [tab, setTab] = useState("overview");
  const [pageLoading, setPageLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [settings, setSettings] = useState(null);
  const [demo, setDemo] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [userFilter, setUserFilter] = useState({ q: "", role: "", demo: "" });
  const [classFilter, setClassFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState({ classId: "", status: "" });
  const [auditSearch, setAuditSearch] = useState("");

  const [userEditor, setUserEditor] = useState(null);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [classEditor, setClassEditor] = useState(null);
  const [classForm, setClassForm] = useState(emptyClassForm);
  const [roomNo, setRoomNo] = useState("");
  const [settingsForm, setSettingsForm] = useState(null);
  const [registerSession, setRegisterSession] = useState(null);
  const [demoConfirm, setDemoConfirm] = useState("");
  const [impersonateTarget, setImpersonateTarget] = useState(null);

  const loadOverview = useCallback(async () => {
    const response = await axios.get(`${SERVER_URL}/admin/overview`, requestConfig);
    setOverview(response.data || null);
  }, []);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams({ limit: "500" });
    if (userFilter.q.trim()) params.set("q", userFilter.q.trim());
    if (userFilter.role) params.set("role", userFilter.role);
    if (userFilter.demo) params.set("demo", userFilter.demo);
    const response = await axios.get(`${SERVER_URL}/admin/users?${params.toString()}`, requestConfig);
    setUsers(Array.isArray(response.data?.users) ? response.data.users : []);
    setTeachers((current) => {
      if (userFilter.role && userFilter.role !== "teacher") return current;
      return current.length
        ? current
        : (Array.isArray(response.data?.users) ? response.data.users : []).filter((entry) => entry.role === "teacher");
    });
  }, [userFilter]);

  const loadClassOptions = useCallback(async () => {
    const [teacherResponse, roomResponse] = await Promise.all([
      axios.get(`${SERVER_URL}/admin/users?role=teacher&limit=500`, requestConfig),
      axios.get(`${SERVER_URL}/rooms`, requestConfig),
    ]);
    setTeachers(Array.isArray(teacherResponse.data?.users) ? teacherResponse.data.users : []);
    setRooms(Array.isArray(roomResponse.data?.rooms) ? roomResponse.data.rooms : []);
  }, []);

  const loadClasses = useCallback(async () => {
    const response = await axios.get(`${SERVER_URL}/admin/classes`, requestConfig);
    setClasses(Array.isArray(response.data?.classes) ? response.data.classes : []);
    await loadClassOptions();
  }, [loadClassOptions]);

  const loadSessions = useCallback(async () => {
    const params = new URLSearchParams();
    if (sessionFilter.classId) params.set("classId", sessionFilter.classId);
    if (sessionFilter.status) params.set("status", sessionFilter.status);
    const response = await axios.get(`${SERVER_URL}/admin/sessions?${params.toString()}`, requestConfig);
    setSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
  }, [sessionFilter]);

  const loadAudit = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (auditSearch.trim()) params.set("q", auditSearch.trim());
    const response = await axios.get(`${SERVER_URL}/admin/audit?${params.toString()}`, requestConfig);
    setAudit(Array.isArray(response.data?.logs) ? response.data.logs : []);
  }, [auditSearch]);

  const loadSettings = useCallback(async () => {
    const response = await axios.get(`${SERVER_URL}/admin/settings`, requestConfig);
    const next = response.data?.settings || null;
    setSettings(next);
    setSettingsForm(next ? { ...next, termStart: dateInput(next.termStart), termEnd: dateInput(next.termEnd) } : null);
  }, []);

  const loadDemo = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/admin/demo/status`, requestConfig);
      setDemo({ ...response.data?.demo, production: response.data?.production });
    } catch (requestError) {
      if (requestError?.response?.status === 404) {
        setDemo({ production: true, disabled: true });
      } else {
        throw requestError;
      }
    }
  }, []);

  const loadTab = useCallback(
    async (nextTab = tab, { quiet = false } = {}) => {
      if (!quiet) setBusy(`load-${nextTab}`);
      setError("");
      try {
        if (nextTab === "overview") await loadOverview();
        if (nextTab === "users") await loadUsers();
        if (nextTab === "classes") await loadClasses();
        if (nextTab === "sessions") {
          await Promise.all([loadSessions(), loadClasses()]);
        }
        if (nextTab === "audit") await loadAudit();
        if (nextTab === "settings") await loadSettings();
        if (nextTab === "demo") {
          await Promise.all([loadDemo(), loadOverview()]);
        }
      } catch (requestError) {
        if (requestError?.response?.status === 401) return;
        setError(messageFor(requestError, "That admin view could not load."));
      } finally {
        setBusy("");
      }
    },
    [loadAudit, loadClasses, loadDemo, loadOverview, loadSessions, loadSettings, loadUsers, tab]
  );

  useEffect(() => {
    if (!user) return;
    const initialise = async () => {
      setPageLoading(true);
      await loadTab("overview");
      setPageLoading(false);
    };
    initialise();
    // The tab loader is intentionally invoked only once on sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || tab === "overview") return;
    loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  // Demo data is a development-only tool. Do not keep a dead tab visible on a
  // production deployment where every /admin/demo endpoint returns 404.
  useEffect(() => {
    if (overview?.production && tab === "demo") setTab("overview");
  }, [overview?.production, tab]);

  const handleLogout = logout;

  const openCreateUser = () => {
    setUserForm({ ...emptyUserForm, isDemo: false });
    setUserEditor({ mode: "create" });
  };

  const openEditUser = (entry) => {
    setUserForm({
      name: entry.name || "",
      email: entry.email || "",
      role: entry.role || "student",
      status: entry.status || "active",
      rollNumber: entry.rollNumber || "",
      phoneLabel: entry.phoneLabel || "",
      demoLabel: entry.demoLabel || "",
      isDemo: Boolean(entry.isDemo),
    });
    setUserEditor({ mode: "edit", entry });
  };

  const saveUser = async (event) => {
    event.preventDefault();
    setBusy("save-user");
    try {
      if (userEditor?.mode === "edit") {
        const payload = {
          name: userForm.name.trim(),
          status: userForm.status,
          rollNumber: userForm.rollNumber.trim(),
          phoneLabel: userForm.phoneLabel.trim(),
          demoLabel: userForm.demoLabel.trim(),
        };
        // Super-admin is an environment grant. Sending it back would make the
        // server reject an otherwise harmless profile edit.
        if (userForm.role === "student" || userForm.role === "teacher") {
          payload.role = userForm.role;
        }
        await axios.patch(
          `${SERVER_URL}/admin/users/${userEditor.entry.id}`,
          payload,
          requestConfig
        );
        toast("User updated.", "success");
      } else {
        await axios.post(
          `${SERVER_URL}/admin/users`,
          {
            name: userForm.name.trim(),
            email: userForm.email.trim(),
            role: userForm.role,
            rollNumber: userForm.rollNumber.trim(),
            phoneLabel: userForm.phoneLabel.trim(),
            demoLabel: userForm.demoLabel.trim(),
            isDemo: userForm.isDemo,
          },
          requestConfig
        );
        toast("User created.", "success");
      }
      setUserEditor(null);
      await loadUsers();
      await loadOverview();
    } catch (requestError) {
      toast(messageFor(requestError, "The user could not be saved."), "error");
    } finally {
      setBusy("");
    }
  };

  const openCreateClass = () => {
    setClassForm({
      ...emptyClassForm,
      teacherId: teachers[0]?.id || "",
      roomId: rooms[0]?._id || "",
    });
    setClassEditor({ mode: "create" });
  };

  const openEditClass = (entry) => {
    setClassForm({
      courseCode: entry.courseCode || "",
      title: entry.title || "",
      section: entry.section || "",
      teacherId: entry.teacher?.id || "",
      roomId: entry.room?.id || "",
      isDemo: Boolean(entry.isDemo),
    });
    setClassEditor({ mode: "edit", entry });
  };

  const saveClass = async (event) => {
    event.preventDefault();
    setBusy("save-class");
    try {
      if (classEditor?.mode === "edit") {
        await axios.patch(
          `${SERVER_URL}/admin/classes/${classEditor.entry.id}`,
          {
            title: classForm.title.trim(),
            section: classForm.section.trim(),
            teacherId: classForm.teacherId,
            roomId: classForm.roomId,
          },
          requestConfig
        );
        toast("Class updated.", "success");
      } else {
        await axios.post(
          `${SERVER_URL}/admin/classes`,
          {
            courseCode: classForm.courseCode.trim(),
            title: classForm.title.trim(),
            section: classForm.section.trim(),
            teacherId: classForm.teacherId,
            roomId: classForm.roomId,
            isDemo: classForm.isDemo,
          },
          requestConfig
        );
        toast("Class created.", "success");
      }
      setClassEditor(null);
      await loadClasses();
      await loadOverview();
    } catch (requestError) {
      toast(messageFor(requestError, "The class could not be saved."), "error");
    } finally {
      setBusy("");
    }
  };

  const addRoom = async () => {
    if (!roomNo.trim()) return;
    setBusy("add-room");
    try {
      const response = await axios.post(`${SERVER_URL}/rooms`, { roomNo: roomNo.trim() }, requestConfig);
      const room = response.data?.room;
      setRoomNo("");
      await loadClassOptions();
      if (room?._id) setClassForm((current) => ({ ...current, roomId: room._id }));
      toast("Room added.", "success");
    } catch (requestError) {
      toast(messageFor(requestError, "The room could not be added."), "error");
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy("save-settings");
    try {
      const payload = {
        ...settingsForm,
        queryWindowHours: Number(settingsForm.queryWindowHours),
        geofenceRadiusMeters: Number(settingsForm.geofenceRadiusMeters),
        lateGraceMinutes: Number(settingsForm.lateGraceMinutes),
        termStart: settingsForm.termStart || null,
        termEnd: settingsForm.termEnd || null,
      };
      const response = await axios.patch(`${SERVER_URL}/admin/settings`, payload, requestConfig);
      const next = response.data?.settings || null;
      setSettings(next);
      setSettingsForm(next ? { ...next, termStart: dateInput(next.termStart), termEnd: dateInput(next.termEnd) } : null);
      toast("System settings saved.", "success");
      await loadOverview();
    } catch (requestError) {
      toast(messageFor(requestError, "Settings could not be saved."), "error");
    } finally {
      setBusy("");
    }
  };

  const runDemo = async (action) => {
    setBusy(`demo-${action}`);
    try {
      const response = await axios.post(`${SERVER_URL}/admin/demo/${action}`, null, requestConfig);
      toast(response.data?.message || (action === "seed" ? "Demo data seeded." : "Demo data cleared."), "success");
      setDemoConfirm("");
      await Promise.all([loadDemo(), loadOverview()]);
    } catch (requestError) {
      toast(messageFor(requestError, "The demo action could not complete."), "error");
    } finally {
      setBusy("");
    }
  };

  const startImpersonation = async () => {
    if (!impersonateTarget) return;
    setBusy("impersonate");
    try {
      await axios.post(`${SERVER_URL}/admin/impersonate/${impersonateTarget.id}`, null, requestConfig);
      window.location.assign(impersonateTarget.role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");
    } catch (requestError) {
      toast(messageFor(requestError, "Impersonation could not start."), "error");
      setBusy("");
    }
  };

  const counts = overview?.counts || null;
  const filteredUsers = useMemo(() => users, [users]);
  const filteredClasses = useMemo(
    () => (classFilter ? classes.filter((entry) => entry.id === classFilter) : classes),
    [classFilter, classes]
  );

  if (loading || pageLoading) return <PageLoader label="Loading the admin panel…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const name = user.name || user.email?.split("@")[0] || "Super admin";
  const visibleTabs = overview?.production
    ? TABS.filter((entry) => entry.value !== "demo")
    : TABS;

  return (
    <AppShell role="superadmin" name={name} email={user.email} onLogout={handleLogout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Super-admin panel</h1>
          <p className="ui-page-head__sub">
            Every user, class, session, register, query, audit entry and system setting. Demo data
            is available only outside production and never replaces your own account.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Badge variant="warning"><FiShield aria-hidden="true" /> Super admin</Badge>
          <Badge variant={overview?.production ? "danger" : "success"}>
            {overview?.production ? "production" : "development"}
          </Badge>
          <Button variant="secondary" size="sm" onClick={() => loadTab(tab)} loading={busy === `load-${tab}`}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: 16 }}>
          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
          <div><strong>Admin view unavailable</strong><p>{error}</p></div>
        </div>
      )}

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Admin sections">
          {visibleTabs.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={`admin-nav__link ${tab === entry.value ? "is-active" : ""}`}
              onClick={() => setTab(entry.value)}
            >
              {entry.label}
              {entry.value === "users" && counts && <span className="admin-nav__badge">{counts.users}</span>}
              {entry.value === "classes" && counts && <span className="admin-nav__badge">{counts.classes}</span>}
              {entry.value === "sessions" && counts && <span className="admin-nav__badge">{counts.sessions}</span>}
              {entry.value === "audit" && counts?.pendingQueries > 0 && <span className="admin-nav__badge">{counts.pendingQueries}</span>}
            </button>
          ))}
        </nav>

        <div className="page-stack">
          {tab === "overview" && (
            <>
              <div className="metric-strip">
                <div className="metric metric--indigo">
                  <div className="metric__label">Users</div>
                  <div className="metric__value">{counts?.users ?? "—"}</div>
                  <div className="metric__hint">{counts?.teachers ?? 0} teachers · {counts?.students ?? 0} students</div>
                </div>
                <div className="metric">
                  <div className="metric__label">Classes</div>
                  <div className="metric__value">{counts?.classes ?? "—"}</div>
                  <div className="metric__hint">{counts?.superadmins ?? 0} super admins</div>
                </div>
                <div className="metric metric--success">
                  <div className="metric__label">Attendance</div>
                  <div className="metric__value">{percentLabel(counts?.attendancePercentage)}</div>
                  <div className="metric__hint">{counts?.attendance?.present ?? 0} present rows</div>
                </div>
                <div className="metric metric--warning">
                  <div className="metric__label">Pending queries</div>
                  <div className="metric__value">{counts?.pendingQueries ?? "—"}</div>
                  <div className="metric__hint">Across every teacher</div>
                </div>
                <div className="metric">
                  <div className="metric__label">Sessions</div>
                  <div className="metric__value">{counts?.sessions ?? "—"}</div>
                  <div className="metric__hint">{counts?.finalizedSessions ?? 0} finalised</div>
                </div>
                {!overview?.production && (
                  <div className="metric">
                    <div className="metric__label">Demo accounts</div>
                    <div className="metric__value">{counts?.demoUsers ?? "—"}</div>
                    <div className="metric__hint">{overview?.demoEnabled ? "Demo mode available" : "Disabled"}</div>
                  </div>
                )}
              </div>

              <div className="page-grid page-grid--2">
                <Card title="Operational shortcuts" subtitle="The views a super admin uses most often.">
                  <div className="page-stack">
                    <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/teacher/sessions"><FiCalendar aria-hidden="true" /> All sessions &amp; registers</Link>
                    <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/queries"><FiSearch aria-hidden="true" /> Query centre</Link>
                    <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/attendance"><FiActivity aria-hidden="true" /> Attendance analytics</Link>
                    <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/exports"><FiDownload aria-hidden="true" /> Export centre</Link>
                    <Button variant="soft" block onClick={() => setTab("settings")}><FiSettings aria-hidden="true" /> Review system settings</Button>
                  </div>
                </Card>

                <Card title="Recent audit" subtitle="The last few changes across the system." actions={<Button variant="ghost" size="sm" onClick={() => setTab("audit")}>Open audit</Button>}>
                  {overview?.recentAudit?.length ? (
                    <EventTimeline
                      compact
                      events={overview.recentAudit.map((entry) => ({
                        id: entry.id,
                        at: entry.createdAt,
                        title: entry.action,
                        detail: entry.summary,
                        tone: entry.action.includes("deleted") || entry.action.includes("rejected") ? "danger" : entry.action.includes("approved") ? "success" : "info",
                        meta: <span className="chip">{entry.actorEmail || "system"}</span>,
                      }))}
                    />
                  ) : (
                    <p className="empty-inline">No audit entries yet.</p>
                  )}
                </Card>
              </div>

              {!overview?.production && (
                <div className="notice notice--info">
                  <FiDatabase className="notice__icon" aria-hidden="true" />
                  <div>
                    <strong>Development instance</strong>
                    <p>Demo seeding and reset are available in the Demo data tab. Demo accounts are marked and can be removed without touching real users.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "users" && (
            <>
              <Card>
                <div className="filters">
                  <Field label="Search" htmlFor="admin-user-search" hint="Name, email or roll number.">
                    <input
                      id="admin-user-search"
                      className="ui-input"
                      value={userFilter.q}
                      onChange={(event) => setUserFilter((current) => ({ ...current, q: event.target.value }))}
                      placeholder="student@…"
                    />
                  </Field>
                  <Field label="Role" htmlFor="admin-user-role">
                    <select id="admin-user-role" className="ui-input" value={userFilter.role} onChange={(event) => setUserFilter((current) => ({ ...current, role: event.target.value }))}>
                      <option value="">All roles</option>
                      <option value="student">Students</option>
                      <option value="teacher">Teachers</option>
                      <option value="superadmin">Super admins</option>
                    </select>
                  </Field>
                  <Field label="Data type" htmlFor="admin-user-demo">
                    <select id="admin-user-demo" className="ui-input" value={userFilter.demo} onChange={(event) => setUserFilter((current) => ({ ...current, demo: event.target.value }))}>
                      <option value="">Real + demo</option>
                      <option value="false">Real only</option>
                      <option value="true">Demo only</option>
                    </select>
                  </Field>
                  <Button onClick={loadUsers} loading={busy === "load-users"}>Apply</Button>
                  <Button variant="soft" onClick={openCreateUser}><FiPlus aria-hidden="true" /> New user</Button>
                </div>
              </Card>

              <Card title="Users" subtitle={`${filteredUsers.length} account${filteredUsers.length === 1 ? "" : "s"}. Super-admin is an environment grant and cannot be created here.`}>
                {busy === "load-users" ? (
                  <div className="loading-inline"><Spinner /> Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                  <EmptyState icon={<FiUsers />} title="No users match" text="Change the filters or create a student or teacher account." action={<Button variant="soft" onClick={openCreateUser}>Create user</Button>} />
                ) : (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Roll / phone</th><th>Created</th><th /></tr></thead>
                      <tbody>
                        {filteredUsers.map((entry) => (
                          <tr key={entry.id}>
                            <td>
                              <div className="data-table__main">{entry.name}</div>
                              <div className="data-table__sub">{entry.email}</div>
                              {entry.isDemo && <Badge variant="warning">demo</Badge>}
                            </td>
                            <td><Badge variant={entry.role === "superadmin" ? "warning" : entry.role === "teacher" ? "primary" : "neutral"}>{entry.role}</Badge></td>
                            <td><Badge variant={entry.status === "disabled" ? "danger" : "success"} dot>{entry.status}</Badge></td>
                            <td>
                              <div className="data-table__main">{entry.rollNumber || "—"}</div>
                              <div className="data-table__sub">{entry.phoneLabel || "No phone label"}</div>
                            </td>
                            <td>{formatDate(entry.createdAt)}</td>
                            <td>
                              <div className="data-table__actions">
                                <Button variant="ghost" size="sm" onClick={() => openEditUser(entry)}><FiEdit3 aria-hidden="true" /> Edit</Button>
                                {entry.role !== "superadmin" && entry.status !== "disabled" && entry.id !== (user._id || user.id) && (
                                  <Button variant="soft" size="sm" onClick={() => setImpersonateTarget(entry)}><FiUserCheck aria-hidden="true" /> View as</Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === "classes" && (
            <>
              <Card>
                <div className="filters">
                  <Field label="Class" htmlFor="admin-class-filter">
                    <select id="admin-class-filter" className="ui-input" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                      <option value="">All classes</option>
                      {classes.map((entry) => (
                        <option key={entry.id} value={entry.id}>{classLabel(entry)} — {entry.title}</option>
                      ))}
                    </select>
                  </Field>
                  <Button variant="soft" onClick={openCreateClass} disabled={!teachers.length || !rooms.length}><FiPlus aria-hidden="true" /> New class</Button>
                  <Button variant="ghost" onClick={loadClasses} loading={busy === "load-classes"}><FiRefreshCw aria-hidden="true" /> Refresh</Button>
                </div>
                {teachers.length === 0 && (
                  <p className="query-window" style={{ marginTop: 10 }}>Create a teacher account before adding a class.</p>
                )}
                {rooms.length === 0 && (
                  <p className="query-window" style={{ marginTop: 10 }}>Add a room in the class editor before creating a class.</p>
                )}
              </Card>

              <div className="export-grid">
                {filteredClasses.length === 0 ? (
                  <Card><EmptyState icon={<FiBookOpen />} title="No classes yet" text="Create a class, assign a teacher and choose a default room." action={<Button variant="soft" onClick={openCreateClass} disabled={!teachers.length}>Create class</Button>} /></Card>
                ) : (
                  filteredClasses.map((entry) => (
                    <article className="export-card" key={entry.id}>
                      <div className="section-head">
                        <div>
                          <div className="class-card__code">{classLabel(entry)}</div>
                          <h3>{entry.title}</h3>
                          <p className="class-card__meta">Room {entry.room?.roomNo || "—"} · {entry.activeStudentCount || 0} active students</p>
                        </div>
                        <Badge variant={entry.isDemo ? "warning" : "neutral"}>{entry.isDemo ? "demo" : "real"}</Badge>
                      </div>
                      <p>{entry.teacher?.name || "No teacher"} · {entry.teacher?.email || ""}</p>
                      <div className="export-card__actions">
                        <Button variant="secondary" size="sm" onClick={() => openEditClass(entry)}><FiEdit3 aria-hidden="true" /> Edit</Button>
                        <Link className="ui-btn ui-btn--ghost ui-btn--sm" to="/teacher/sessions">Sessions</Link>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          )}

          {tab === "sessions" && (
            <>
              <Card>
                <div className="filters">
                  <Field label="Class" htmlFor="admin-session-class">
                    <select id="admin-session-class" className="ui-input" value={sessionFilter.classId} onChange={(event) => setSessionFilter((current) => ({ ...current, classId: event.target.value }))}>
                      <option value="">All classes</option>
                      {classes.map((entry) => (
                        <option key={entry.id} value={entry.id}>{classLabel(entry)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status" htmlFor="admin-session-status">
                    <select id="admin-session-status" className="ui-input" value={sessionFilter.status} onChange={(event) => setSessionFilter((current) => ({ ...current, status: event.target.value }))}>
                      <option value="">All statuses</option>
                      <option value="active">Active</option>
                      <option value="closed">Closed</option>
                    </select>
                  </Field>
                  <Button onClick={loadSessions} loading={busy === "load-sessions"}>Apply</Button>
                  <Link className="ui-btn ui-btn--ghost ui-btn--sm" to="/teacher/sessions">Full history</Link>
                </div>
              </Card>

              <Card title="Recent sessions" subtitle="Open any register to inspect evidence, override a row or remove it.">
                {busy === "load-sessions" ? (
                  <div className="loading-inline"><Spinner /> Loading sessions…</div>
                ) : sessions.length === 0 ? (
                  <EmptyState icon={<FiCalendar />} title="No sessions" text="Sessions appear here after a teacher starts a check-in." />
                ) : (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Started</th><th>Class</th><th>Teacher</th><th>Status</th><th>Register</th><th /></tr></thead>
                      <tbody>
                        {sessions.map((entry) => (
                          <tr key={entry.id}>
                            <td><div className="data-table__main">{formatDate(entry.startedAt)}</div><div className="data-table__sub">{formatDateTime(entry.startedAt)}</div></td>
                            <td><div className="data-table__main">{classLabel(entry.class)}</div><div className="data-table__sub">Room {entry.room?.roomNo || "—"}</div></td>
                            <td><div className="data-table__main">{entry.teacher?.name || "—"}</div><div className="data-table__sub">{entry.teacher?.email || ""}</div></td>
                            <td>
                              <div className="chip-row">
                                <Badge variant={entry.status === "active" ? "success" : "neutral"} dot>{entry.status}</Badge>
                                {entry.attendanceFinalized ? <Badge variant="success">Finalised</Badge> : <Badge variant="warning">Pending</Badge>}
                              </div>
                            </td>
                            <td>
                              <div className="progress-row">
                                <div className="progress"><span className={`progress__bar progress__bar--${entry.attendanceSummary?.percentage >= 85 ? "success" : entry.attendanceSummary?.percentage >= 70 ? "warning" : "danger"}`} style={{ width: `${entry.attendanceSummary?.percentage || 0}%` }} /></div>
                                <span>{percentLabel(entry.attendanceSummary?.percentage)}</span>
                              </div>
                            </td>
                            <td><Button variant="soft" size="sm" onClick={() => setRegisterSession(entry)}><FiUsers aria-hidden="true" /> Register</Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {tab === "audit" && (
            <Card
              title="Audit log"
              subtitle="Append-only. Includes impersonation and both identities when applicable."
              actions={<Button variant="ghost" size="sm" onClick={loadAudit} loading={busy === "load-audit"}><FiRefreshCw aria-hidden="true" /> Refresh</Button>}
            >
              <div className="filters" style={{ marginBottom: 14 }}>
                <Field label="Search" htmlFor="admin-audit-search" hint="Action, summary, email or entity id.">
                  <input id="admin-audit-search" className="ui-input" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="attendance.override" />
                </Field>
                <Button variant="secondary" onClick={loadAudit}>Search</Button>
              </div>
              {busy === "load-audit" ? (
                <div className="loading-inline"><Spinner /> Loading audit…</div>
              ) : audit.length === 0 ? (
                <EmptyState icon={<FiShield />} title="No audit entries" text="Actions across users, classes, sessions, queries and settings appear here." />
              ) : (
                <EventTimeline
                  events={audit.map((entry) => ({
                    id: entry.id,
                    at: entry.createdAt,
                    title: entry.action,
                    detail: entry.summary,
                    tone: entry.action.includes("deleted") || entry.action.includes("rejected") ? "danger" : entry.action.includes("approved") || entry.action.includes("finalized") ? "success" : "info",
                    meta: (
                      <>
                        <span className="chip">{entry.actorEmail || "system"}</span>
                        <span className="chip">{entry.actorRole || "—"}</span>
                        {entry.impersonatorEmail && <span className="chip chip--warning">via {entry.impersonatorEmail}</span>}
                        {entry.isDemo && <span className="chip chip--warning">demo</span>}
                      </>
                    ),
                  }))}
                />
              )}
            </Card>
          )}

          {tab === "settings" && settingsForm && (
            <>
              <form className="page-stack" onSubmit={saveSettings}>
                <Card title="Attendance policy" subtitle="These values apply to every class and every new query.">
                  <div className="form-grid">
                    <Field label="Query window (hours)" htmlFor="settings-window" hint="Starts when the check-in session closes.">
                      <input id="settings-window" type="number" min="1" max="168" className="ui-input" value={settingsForm.queryWindowHours} onChange={(event) => setSettingsForm((current) => ({ ...current, queryWindowHours: event.target.value }))} />
                    </Field>
                    <Field label="Location window (metres)" htmlFor="settings-radius" hint="Teacher judgement remains final; this is evidence context.">
                      <input id="settings-radius" type="number" min="0" max="5000" className="ui-input" value={settingsForm.geofenceRadiusMeters} onChange={(event) => setSettingsForm((current) => ({ ...current, geofenceRadiusMeters: event.target.value }))} />
                    </Field>
                    <Field label="Late grace (minutes)" htmlFor="settings-grace" hint="Reserved for late-arrival policy in later slices.">
                      <input id="settings-grace" type="number" min="0" max="120" className="ui-input" value={settingsForm.lateGraceMinutes} onChange={(event) => setSettingsForm((current) => ({ ...current, lateGraceMinutes: event.target.value }))} />
                    </Field>
                    <Field label="Term name" htmlFor="settings-term">
                      <input id="settings-term" className="ui-input" value={settingsForm.termName || ""} onChange={(event) => setSettingsForm((current) => ({ ...current, termName: event.target.value }))} maxLength={80} />
                    </Field>
                    <Field label="Term starts" htmlFor="settings-term-start">
                      <input id="settings-term-start" type="date" className="ui-input" value={settingsForm.termStart || ""} onChange={(event) => setSettingsForm((current) => ({ ...current, termStart: event.target.value }))} />
                    </Field>
                    <Field label="Term ends" htmlFor="settings-term-end">
                      <input id="settings-term-end" type="date" className="ui-input" value={settingsForm.termEnd || ""} onChange={(event) => setSettingsForm((current) => ({ ...current, termEnd: event.target.value }))} />
                    </Field>
                  </div>
                </Card>

                <Card title="Student options">
                  <div className="page-stack">
                    <label className="inline-check">
                      <input type="checkbox" checked={Boolean(settingsForm.allowStudentQueries)} onChange={(event) => setSettingsForm((current) => ({ ...current, allowStudentQueries: event.target.checked }))} />
                      <span><strong>Allow students to raise attendance queries.</strong><br />When off, the query endpoint rejects new submissions. Existing queries remain reviewable.</span>
                    </label>
                    <label className="inline-check">
                      <input type="checkbox" checked={Boolean(settingsForm.requireQueryLocation)} onChange={(event) => setSettingsForm((current) => ({ ...current, requireQueryLocation: event.target.checked }))} />
                      <span><strong>Require a location snapshot for a query.</strong><br />Only enable this if every student phone has GPS. Otherwise a denied permission blocks a legitimate claim.</span>
                    </label>
                    <label className="inline-check">
                      <input type="checkbox" checked={Boolean(settingsForm.demoModeEnabled)} disabled={overview?.production} onChange={(event) => setSettingsForm((current) => ({ ...current, demoModeEnabled: event.target.checked }))} />
                      <span><strong>Demo mode.</strong><br />Allows seeding and resetting demo accounts outside production. A production process always disables this.</span>
                    </label>
                  </div>
                </Card>

                <div className="page-toolbar">
                  <Button type="submit" loading={busy === "save-settings"}><FiSettings aria-hidden="true" /> Save settings</Button>
                  <span className="query-window">
                    {settings?.updatedAt ? `Last updated ${formatDateTime(settings.updatedAt)}` : "Not updated yet"}
                  </span>
                </div>
              </form>

              <div className="notice notice--warning">
                <FiAlertTriangle className="notice__icon" aria-hidden="true" />
                <div>
                  <strong>Location is evidence, not a gate</strong>
                  <p>Requiring location can exclude students whose browser denies permission. The default is off; the teacher still sees distance and window status when a snapshot exists.</p>
                </div>
              </div>
            </>
          )}

          {tab === "demo" && (
            <>
              {demo?.disabled || overview?.production ? (
                <Card title="Demo data" subtitle="Demo mode is disabled in production.">
                  <div className="notice notice--danger">
                    <FiAlertTriangle className="notice__icon" aria-hidden="true" />
                    <div>
                      <strong>Production instance</strong>
                      <p>Demo seeding and reset are not available here. Real users, classes, sessions and audit entries are never mixed with demo data.</p>
                    </div>
                  </div>
                </Card>
              ) : (
                <>
                  <div className="metric-strip">
                    <div className="metric metric--indigo"><div className="metric__label">Demo users</div><div className="metric__value">{demo?.users ?? "—"}</div><div className="metric__hint">Teacher + eight students</div></div>
                    <div className="metric"><div className="metric__label">Demo classes</div><div className="metric__value">{demo?.classes ?? "—"}</div></div>
                    <div className="metric"><div className="metric__label">Demo sessions</div><div className="metric__value">{demo?.sessions ?? "—"}</div></div>
                    <div className="metric"><div className="metric__label">Demo queries</div><div className="metric__value">{demo?.queries ?? "—"}</div></div>
                    <div className="metric"><div className="metric__label">Demo records</div><div className="metric__value">{demo?.records ?? "—"}</div></div>
                  </div>

                  <Card title="Demo controls" subtitle="Seed creates a demo teacher, eight students, a class, timetable, sessions, attendance, queries and notifications.">
                    <div className="page-stack">
                      <div className="notice notice--info">
                        <FiDatabase className="notice__icon" aria-hidden="true" />
                        <div>
                          <strong>Your account is always preserved</strong>
                          <p>Reset removes demo users and demo-owned data but excludes the signed-in super admin. Demo accounts use the <span className="code-chip">@demo.invalid</span> domain.</p>
                        </div>
                      </div>
                      <div className="page-toolbar">
                        <Button onClick={() => setDemoConfirm("seed")} loading={busy === "demo-seed"}><FiRefreshCw aria-hidden="true" /> Seed demo data</Button>
                        <Button variant="danger" onClick={() => setDemoConfirm("reset")} loading={busy === "demo-reset"}>Reset demo data</Button>
                      </div>
                      {demoConfirm && (
                        <div className={`notice ${demoConfirm === "reset" ? "notice--danger" : "notice--warning"}`} role="alert">
                          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
                          <div>
                            <strong>{demoConfirm === "reset" ? "Remove all demo data?" : "Seed demo data?"}</strong>
                            <p>{demoConfirm === "reset" ? "Demo classes, sessions, attendance, queries, timetables and demo accounts are deleted. Your account and all real data stay." : "Existing demo data is cleared first, then a fresh demo class and sessions are created. Real data is not touched."}</p>
                            <div className="page-toolbar" style={{ marginTop: 10 }}>
                              <Button variant={demoConfirm === "reset" ? "danger" : "primary"} onClick={() => runDemo(demoConfirm)} loading={busy === `demo-${demoConfirm}`}>Confirm {demoConfirm}</Button>
                              <Button variant="ghost" onClick={() => setDemoConfirm("")} disabled={Boolean(busy)}>Cancel</Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>

                  <div className="danger-zone">
                    <h3>Demo data is never production data</h3>
                    <p>Demo accounts are flagged in the database, excluded from real exports when you filter them out, and removed by reset. The production process refuses demo seeding entirely.</p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(userEditor)}
        onClose={() => setUserEditor(null)}
        title={userEditor?.mode === "edit" ? "Edit user" : "Create user"}
        subtitle="Super-admin is granted by environment configuration, not this form."
        footer={
          <>
            <Button variant="secondary" onClick={() => setUserEditor(null)}>Cancel</Button>
            <Button onClick={saveUser} loading={busy === "save-user"} disabled={!userForm.name.trim() || (userEditor?.mode === "create" && !userForm.email.trim())}>
              {userEditor?.mode === "edit" ? "Save user" : "Create user"}
            </Button>
          </>
        }
      >
        <form className="page-stack" onSubmit={saveUser}>
          <div className="form-grid">
            <Field label="Name" htmlFor="admin-user-name">
              <input id="admin-user-name" className="ui-input" value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} maxLength={80} required />
            </Field>
            <Field label="Email" htmlFor="admin-user-email" hint={userEditor?.mode === "edit" ? "Sign-in email cannot be changed here." : "The account is created for Google sign-in."}>
              <input id="admin-user-email" type="email" className="ui-input" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} disabled={userEditor?.mode === "edit"} required />
            </Field>
            <Field label="Role" htmlFor="admin-user-role-input">
              <select id="admin-user-role-input" className="ui-input" value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))} disabled={userEditor?.mode === "edit" && userEditor.entry.role === "superadmin"}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </Field>
            {userEditor?.mode === "edit" && (
              <Field label="Status" htmlFor="admin-user-status">
                <select id="admin-user-status" className="ui-input" value={userForm.status} onChange={(event) => setUserForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
            )}
            <Field label="Roll number" htmlFor="admin-user-roll">
              <input id="admin-user-roll" className="ui-input" value={userForm.rollNumber} onChange={(event) => setUserForm((current) => ({ ...current, rollNumber: event.target.value }))} maxLength={40} />
            </Field>
            <Field label="Phone label" htmlFor="admin-user-phone">
              <input id="admin-user-phone" className="ui-input" value={userForm.phoneLabel} onChange={(event) => setUserForm((current) => ({ ...current, phoneLabel: event.target.value }))} maxLength={80} />
            </Field>
          </div>
          {userEditor?.mode === "create" && !overview?.production && (
            <label className="inline-check">
              <input type="checkbox" checked={Boolean(userForm.isDemo)} onChange={(event) => setUserForm((current) => ({ ...current, isDemo: event.target.checked }))} />
              <span><strong>Mark as demo account.</strong><br />Demo accounts are removed by demo reset and never created in production.</span>
            </label>
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(classEditor)}
        onClose={() => setClassEditor(null)}
        title={classEditor?.mode === "edit" ? "Edit class" : "Create class"}
        subtitle="A class needs a teacher and a default room. Rosters are managed from the teacher's class page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setClassEditor(null)}>Cancel</Button>
            <Button onClick={saveClass} loading={busy === "save-class"} disabled={!classForm.title.trim() || !classForm.teacherId || !classForm.roomId || (classEditor?.mode === "create" && !classForm.courseCode.trim())}>
              {classEditor?.mode === "edit" ? "Save class" : "Create class"}
            </Button>
          </>
        }
      >
        <form className="page-stack" onSubmit={saveClass}>
          <div className="form-grid">
            <Field label="Course code" htmlFor="admin-class-code">
              <input id="admin-class-code" className="ui-input" value={classForm.courseCode} onChange={(event) => setClassForm((current) => ({ ...current, courseCode: event.target.value }))} disabled={classEditor?.mode === "edit"} maxLength={30} required />
            </Field>
            <Field label="Section" htmlFor="admin-class-section">
              <input id="admin-class-section" className="ui-input" value={classForm.section} onChange={(event) => setClassForm((current) => ({ ...current, section: event.target.value }))} maxLength={20} />
            </Field>
            <Field label="Title" htmlFor="admin-class-title" className="ui-field--full">
              <input id="admin-class-title" className="ui-input" value={classForm.title} onChange={(event) => setClassForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} required />
            </Field>
            <Field label="Teacher" htmlFor="admin-class-teacher">
              <select id="admin-class-teacher" className="ui-input" value={classForm.teacherId} onChange={(event) => setClassForm((current) => ({ ...current, teacherId: event.target.value }))} required>
                <option value="">Choose a teacher</option>
                {teachers.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name} — {entry.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Default room" htmlFor="admin-class-room">
              <select id="admin-class-room" className="ui-input" value={classForm.roomId} onChange={(event) => setClassForm((current) => ({ ...current, roomId: event.target.value }))} required>
                <option value="">Choose a room</option>
                {rooms.map((room) => (
                  <option key={room._id} value={room._id}>{room.roomNo}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="page-toolbar">
            <input className="ui-input" value={roomNo} onChange={(event) => setRoomNo(event.target.value)} placeholder="New room number" aria-label="New room number" />
            <Button type="button" variant="secondary" onClick={addRoom} loading={busy === "add-room"} disabled={!roomNo.trim()}><FiPlus aria-hidden="true" /> Add room</Button>
          </div>
          {classEditor?.mode === "create" && !overview?.production && (
            <label className="inline-check">
              <input type="checkbox" checked={Boolean(classForm.isDemo)} onChange={(event) => setClassForm((current) => ({ ...current, isDemo: event.target.checked }))} />
              <span>Mark this class as demo data.</span>
            </label>
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(impersonateTarget)}
        onClose={() => setImpersonateTarget(null)}
        title="View as another user"
        subtitle="A 15-minute, audited session."
        footer={
          <>
            <Button variant="secondary" onClick={() => setImpersonateTarget(null)}>Cancel</Button>
            <Button onClick={startImpersonation} loading={busy === "impersonate"}><FiUserCheck aria-hidden="true" /> Start impersonation</Button>
          </>
        }
      >
        {impersonateTarget && (
          <div className="page-stack">
            <div className="notice notice--warning">
              <FiAlertTriangle className="notice__icon" aria-hidden="true" />
              <div>
                <strong>You will act as {impersonateTarget.name}</strong>
                <p>
                  The banner at the top returns you to the admin panel. Every action is recorded
                  with both your super-admin identity and the impersonated account.
                </p>
              </div>
            </div>
            <div className="profile-facts">
              <div className="profile-fact"><dt>Email</dt><dd>{impersonateTarget.email}</dd></div>
              <div className="profile-fact"><dt>Role</dt><dd>{impersonateTarget.role}</dd></div>
              <div className="profile-fact"><dt>Status</dt><dd>{impersonateTarget.status}</dd></div>
              <div className="profile-fact"><dt>Demo</dt><dd>{impersonateTarget.isDemo ? "Yes" : "No"}</dd></div>
            </div>
          </div>
        )}
      </Modal>

      <SessionAttendanceModal
        open={Boolean(registerSession)}
        session={registerSession}
        mode="admin"
        onClose={() => setRegisterSession(null)}
        onChanged={() => { loadSessions(); loadOverview(); }}
      />
    </AppShell>
  );
};

export default AdminPanel;
