import React from "react";
import { Link } from "react-router-dom";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiCheckCircle,
  FiDownload,
  FiHeadphones,
  FiHelpCircle,
  FiMapPin,
  FiMic,
  FiShield,
  FiSmartphone,
  FiUsers,
} from "react-icons/fi";
import useRoleSession from "../../hooks/useRoleSession";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Card from "../../ui/Card";
import { PageLoader } from "../../ui/Spinner";

const STUDENT_STEPS = [
  {
    icon: <FiSmartphone />,
    title: "Bind this browser",
    text: "Sign in with your college Google account. A teacher approves the first browser and any changed device before you can submit proof.",
  },
  {
    icon: <FiHeadphones />,
    title: "Listen during a live check-in",
    text: "Open Check-in while your teacher's wave is live. Your phone decodes the tones locally and signs the key with its bound device key.",
  },
  {
    icon: <FiCheckCircle />,
    title: "Wait for the teacher's register",
    text: "Evidence shows your phone heard a wave. It does not mark you present. Your teacher reviews evidence and publishes the register.",
  },
  {
    icon: <FiHelpCircle />,
    title: "Raise a query if you were missed",
    text: "After the session closes you have 24 hours to explain what happened. An approved query counts as present and is shown in your attendance.",
  },
];

const TEACHER_STEPS = [
  {
    icon: <FiUsers />,
    title: "Set up a class and roster",
    text: "Create a class with a default room, then paste the roster. The roster is snapshotted when a session starts so later edits do not rewrite history.",
  },
  {
    icon: <FiMic />,
    title: "Start a live check-in",
    text: "One active session per class. Keep the teacher phone at the front and play the current wave key. Advance only after at least one phone records evidence.",
  },
  {
    icon: <FiBarChart2 />,
    title: "Make the attendance decision",
    text: "Open the register to mark present, absent or excused. Closing stops the key; finalising resolves pending rows and publishes attendance.",
  },
  {
    icon: <FiCheckCircle />,
    title: "Review queries and evidence",
    text: "Queries are open for 24 hours after close. Compare the student's reason, check-in attempt and locations, then approve or reject with a note.",
  },
];

const ADMIN_STEPS = [
  {
    icon: <FiUsers />,
    title: "Manage users and classes",
    text: "Create student and teacher accounts, assign class ownership, and disable accounts without deleting their history.",
  },
  {
    icon: <FiShield />,
    title: "Inspect every register",
    text: "Open any session across every teacher. Override a row with a note, remove a bad roster row, and every action is audited.",
  },
  {
    icon: <FiDownload />,
    title: "Export and audit",
    text: "Download the attendance register, queries, session sheet, user directory and audit log. Settings control the query window and geofence.",
  },
  {
    icon: <FiAlertTriangle />,
    title: "Control demo data",
    text: "Demo accounts and sessions are available only outside production. Seeding and resetting never touches the current super-admin account.",
  },
];

const FAQ = [
  {
    q: "Does hearing the key mark me present?",
    a: "No. A signed proof shows that a bound phone heard a wave. The teacher owns the register and decides attendance from the evidence. This is deliberate: a forwarded or replayed key should not create a present row.",
  },
  {
    q: "Why is my attendance pending?",
    a: "Your teacher has not finalised that session's register yet. Pending rows are not counted as absent. When the teacher finalises, remaining pending rows become absent. The query window is 24 hours from session close, not from finalisation.",
  },
  {
    q: "What does the location actually prove?",
    a: "A browser location snapshot is optional evidence. The teacher sees it next to the teacher's location at session start, the distance and whether it falls inside the configured window. A missing permission never blocks a check-in or a query.",
  },
  {
    q: "Can a query be reopened?",
    a: "Yes. A teacher or super admin can reopen an approved or rejected query with a note. Reopening and the new decision are both written to the audit trail.",
  },
  {
    q: "Why did my wave stop listening?",
    a: "Each wave key lives for two minutes. If the teacher advances the wave while you are listening, the old frame is rejected. Tap Join again to listen for the new wave.",
  },
  {
    q: "What happens to raw audio?",
    a: "Audio is decoded on the phone and never uploaded. The server receives the session, wave, decoded key and a device signature. Proof evidence expires after about 24 hours; attendance records persist with proof counters.",
  },
];

const Help = () => {
  const { user, loading, logout } = useRoleSession(["student", "teacher", "superadmin"]);
  if (loading) return <PageLoader label="Loading help…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const role = user.role || "student";
  const steps = role === "superadmin" ? ADMIN_STEPS : role === "teacher" ? TEACHER_STEPS : STUDENT_STEPS;
  const name = user.name || user.email?.split("@")[0] || "You";

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Onboarding &amp; help</h1>
          <p className="ui-page-head__sub">
            A practical guide to check-ins, evidence, queries and the attendance register. The
            acoustic transport is real; attendance is still a teacher decision.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Badge variant="info"><FiBookOpen aria-hidden="true" /> {role} guide</Badge>
        </div>
      </div>

      <div className="metric-strip">
        <div className="metric metric--indigo">
          <div className="metric__label">Evidence</div>
          <div className="metric__value" style={{ fontSize: 17 }}>Acoustic proof</div>
          <div className="metric__hint">Phone hears, signs and reports a wave</div>
        </div>
        <div className="metric metric--success">
          <div className="metric__label">Attendance</div>
          <div className="metric__value" style={{ fontSize: 17 }}>Teacher confirmed</div>
          <div className="metric__hint">Register + finalisation + query corrections</div>
        </div>
        <div className="metric metric--warning">
          <div className="metric__label">Query window</div>
          <div className="metric__value">24h</div>
          <div className="metric__hint">After the session closes</div>
        </div>
        <div className="metric">
          <div className="metric__label">Location</div>
          <div className="metric__value" style={{ fontSize: 17 }}>Optional evidence</div>
          <div className="metric__hint">Never blocks check-in or a query</div>
        </div>
      </div>

      <Card title={`${role === "superadmin" ? "Admin" : role === "teacher" ? "Teacher" : "Student"} workflow`} subtitle="Four steps from setup to a reviewable attendance decision.">
        <div className="help-grid">
          {steps.map((step, index) => (
            <article className="help-step" key={step.title}>
              <span className="help-step__num">{index + 1}</span>
              <span className="help-step__icon" aria-hidden="true">{step.icon}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </Card>

      <div className="page-grid page-grid--2">
        <Card title="Frequently asked" subtitle="The questions that come up during a live class.">
          <div className="help-faq">
            {FAQ.map((entry) => (
              <details key={entry.q}>
                <summary>{entry.q}</summary>
                <p>{entry.a}</p>
              </details>
            ))}
          </div>
        </Card>

        <div className="page-stack">
          <Card title="Audio &amp; device check" subtitle="Run this before the first real class.">
            <div className="page-stack">
              <div className="notice notice--info">
                <FiHeadphones className="notice__icon" aria-hidden="true" />
                <div>
                  <strong>Test both directions</strong>
                  <p>Use two phones: one transmits, one listens. Keep the volume up and browser tab visible. Chrome on Android is the primary target.</p>
                </div>
              </div>
              <div className="page-toolbar">
                <Link className="ui-btn ui-btn--secondary" to="/acoustic-lab">Open phone audio test</Link>
                <Link className="ui-btn ui-btn--soft" to="/acoustic-tx">Transmit a test key</Link>
              </div>
            </div>
          </Card>

          <Card title="Shortcuts">
            <div className="page-stack">
              {role === "student" ? (
                <>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/student/check-in"><FiMic aria-hidden="true" /> Open check-in</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/queries"><FiHelpCircle aria-hidden="true" /> My queries</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/attendance"><FiBarChart2 aria-hidden="true" /> My attendance</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/timetable"><FiBookOpen aria-hidden="true" /> Timetable</Link>
                </>
              ) : role === "teacher" ? (
                <>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/teacher/check-in"><FiMic aria-hidden="true" /> Run check-in</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/teacher/sessions"><FiBookOpen aria-hidden="true" /> Session history</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/queries"><FiHelpCircle aria-hidden="true" /> Query centre</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/exports"><FiDownload aria-hidden="true" /> Export centre</Link>
                </>
              ) : (
                <>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/admin"><FiShield aria-hidden="true" /> Admin panel</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/teacher/sessions"><FiBookOpen aria-hidden="true" /> All sessions</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/queries"><FiHelpCircle aria-hidden="true" /> All queries</Link>
                  <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/exports"><FiDownload aria-hidden="true" /> Export centre</Link>
                </>
              )}
              <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/notifications"><FiBell aria-hidden="true" /> Notifications</Link>
              <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/profile"><FiUsers aria-hidden="true" /> Profile &amp; settings</Link>
            </div>
          </Card>

          <Card title="Privacy in one paragraph">
            <p className="ui-muted" style={{ lineHeight: 1.65, fontSize: 13 }}>
              Microphone audio stays on the student phone. The server receives a signed proof
              containing the session, wave and decoded key, plus an optional one-shot location
              snapshot when the student allows it. Raw audio is never uploaded. Proof documents
              expire after about 24 hours; attendance records and their proof counters remain for
              the term. Audit entries are append-only. <Link to="/profile">Review your profile</Link>.
            </p>
            <div className="chip-row" style={{ marginTop: 10 }}>
              <span className="chip chip--success"><FiShield aria-hidden="true" /> No raw audio</span>
              <span className="chip"><FiMapPin aria-hidden="true" /> Optional GPS</span>
              <span className="chip"><FiCheckCircle aria-hidden="true" /> Audited decisions</span>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};

export default Help;
