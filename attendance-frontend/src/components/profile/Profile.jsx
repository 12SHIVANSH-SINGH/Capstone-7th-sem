import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiEdit3,
  FiLogOut,
  FiSave,
  FiShield,
  FiUser,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import { formatDate, initials } from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import { PageLoader } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";

const requestConfig = { withCredentials: true };
const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const roleVariant = (role) =>
  role === "superadmin" ? "warning" : role === "teacher" ? "primary" : "neutral";

const Profile = () => {
  const { user: sessionUser, loading, logout } = useRoleSession(["student", "teacher", "superadmin"]);
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonator, setImpersonator] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phoneLabel, setPhoneLabel] = useState("");
  const [rollNumber, setRollNumber] = useState("");

  const applyProfile = (next) => {
    setProfile(next);
    setName(next?.name || "");
    setPhoneLabel(next?.phoneLabel || "");
    setRollNumber(next?.rollNumber || "");
  };

  const load = useCallback(async () => {
    setPageLoading(true);
    setError("");
    try {
      const response = await axios.get(`${SERVER_URL}/profile`, requestConfig);
      applyProfile(response.data?.user || null);
      setImpersonating(Boolean(response.data?.impersonating));
      setImpersonator(response.data?.impersonator || null);
    } catch (requestError) {
      if (requestError?.response?.status === 401) return;
      setError(messageFor(requestError, "Could not load your profile."));
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionUser) load();
  }, [sessionUser, load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await axios.patch(
        `${SERVER_URL}/profile`,
        { name: name.trim(), phoneLabel: phoneLabel.trim(), rollNumber: rollNumber.trim() },
        requestConfig
      );
      applyProfile(response.data?.user || profile);
      toast("Profile updated.", "success");
    } catch (requestError) {
      toast(messageFor(requestError, "Could not update your profile."), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading || pageLoading) return <PageLoader label="Loading your profile…" />;
  if (!sessionUser) return <PageLoader label="Opening sign in…" />;

  const role = profile?.role || sessionUser.role;
  const nameValue = profile?.name || sessionUser.name || sessionUser.email?.split("@")[0] || "You";
  const dirty =
    name.trim() !== (profile?.name || "") ||
    phoneLabel.trim() !== (profile?.phoneLabel || "") ||
    rollNumber.trim() !== (profile?.rollNumber || "");

  return (
    <AppShell role={role} name={nameValue} email={profile?.email || sessionUser.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Profile &amp; settings</h1>
          <p className="ui-page-head__sub">
            Your account identity, role and phone label. The role is granted by the server; it
            cannot be changed from this screen.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Badge variant={roleVariant(role)}>{role}</Badge>
          {profile?.isDemo && <Badge variant="warning">demo account</Badge>}
        </div>
      </div>

      {error && (
        <div className="notice notice--danger" role="alert" style={{ marginBottom: 16 }}>
          <FiAlertTriangle className="notice__icon" aria-hidden="true" />
          <div><strong>Profile unavailable</strong><p>{error}</p></div>
        </div>
      )}

      <div className="profile-grid">
        <div className="page-stack">
          <Card title="Identity" subtitle="Your sign-in identity is owned by Google; the phone label helps you tell devices apart.">
            <div className="profile-identity">
              <span className="profile-avatar" aria-hidden="true">{initials(nameValue, profile?.email)}</span>
              <div>
                <div className="profile-identity__name">{nameValue}</div>
                <div className="profile-identity__email">{profile?.email || sessionUser.email}</div>
                <div className="chip-row" style={{ marginTop: 7 }}>
                  <Badge variant={roleVariant(role)}>{role}</Badge>
                  <Badge variant={profile?.status === "disabled" ? "danger" : "success"}>
                    {profile?.status || "active"}
                  </Badge>
                  <Badge variant="neutral">{profile?.authProvider || "google"}</Badge>
                </div>
              </div>
            </div>

            <dl className="profile-facts">
              <div className="profile-fact">
                <dt>Account created</dt>
                <dd>{formatDate(profile?.createdAt)}</dd>
              </div>
              <div className="profile-fact">
                <dt>Last seen</dt>
                <dd>{profile?.deviceBinding?.lastSeenAt ? formatDate(profile.deviceBinding.lastSeenAt) : "—"}</dd>
              </div>
              <div className="profile-fact">
                <dt>Roll number</dt>
                <dd>{profile?.rollNumber || "Not set"}</dd>
              </div>
              <div className="profile-fact">
                <dt>Phone label</dt>
                <dd>{profile?.phoneLabel || "Not set"}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Edit profile" subtitle="This does not change your sign-in email or role.">
            <form className="page-stack" onSubmit={save}>
              <div className="form-grid">
                <Field label="Full name" htmlFor="profile-name" className="ui-field--full">
                  <input
                    id="profile-name"
                    className="ui-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    required
                  />
                </Field>
                <Field label="Phone label" htmlFor="profile-phone" hint="For example: Student phone (Android).">
                  <input
                    id="profile-phone"
                    className="ui-input"
                    value={phoneLabel}
                    onChange={(event) => setPhoneLabel(event.target.value)}
                    maxLength={80}
                    placeholder="My phone"
                  />
                </Field>
                <Field label="Roll number" htmlFor="profile-roll" hint="Students can add or correct their roll number.">
                  <input
                    id="profile-roll"
                    className="ui-input"
                    value={rollNumber}
                    onChange={(event) => setRollNumber(event.target.value)}
                    maxLength={40}
                    placeholder="2023UGCS059"
                  />
                </Field>
              </div>
              <div className="page-toolbar">
                <Button type="submit" loading={saving} disabled={!dirty}>
                  <FiSave aria-hidden="true" /> Save profile
                </Button>
                {dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setName(profile?.name || "");
                      setPhoneLabel(profile?.phoneLabel || "");
                      setRollNumber(profile?.rollNumber || "");
                    }}
                  >
                    Reset changes
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </div>

        <div className="page-stack">
          <Card title="Account controls">
            <div className="page-stack">
              <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/notifications">
                <FiShield aria-hidden="true" /> Notification centre
              </Link>
              <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/help">
                <FiUser aria-hidden="true" /> Onboarding &amp; help
              </Link>
              <Button variant="danger" block onClick={logout}>
                <FiLogOut aria-hidden="true" /> Sign out
              </Button>
            </div>
          </Card>

          {impersonating && (
            <Card title="Impersonation session">
              <div className="notice notice--warning">
                <FiAlertTriangle className="notice__icon" aria-hidden="true" />
                <div>
                  <strong>You are signed in as another account</strong>
                  <p>
                    {impersonator?.email || impersonator?.name} started this session. Every action
                    is audited with both identities. Use the banner at the top to return to admin.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card title="Roles and data">
            <div className="page-stack">
              <div className="notice notice--info">
                <FiCheckCircle className="notice__icon" aria-hidden="true" />
                <div>
                  <strong>Attendance is teacher-confirmed</strong>
                  <p>Acoustic evidence shows a phone heard a wave. A teacher owns the register and every correction is audited.</p>
                </div>
              </div>
              <div className="notice notice--info">
                <FiEdit3 className="notice__icon" aria-hidden="true" />
                <div>
                  <strong>What you can change</strong>
                  <p>{role === "student" ? "Raise a query after a session closes and update your phone label." : role === "teacher" ? "Set up classes, run check-ins, review queries and finalise registers." : "Manage users, classes, sessions, settings, audits and demo data."}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};

export default Profile;
