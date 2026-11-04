import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiRefreshCw,
  FiTrash2,
  FiUserCheck,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import useRoleSession from "../../hooks/useRoleSession";
import { formatDateTime, relativeTime } from "../../utils/format";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Tabs from "../../ui/Tabs";
import { PageLoader, Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";

const requestConfig = { withCredentials: true };

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const iconFor = (type) => {
  if (type?.startsWith("query")) return <FiBell />;
  if (type?.startsWith("attendance")) return <FiCheckCircle />;
  if (type?.startsWith("device")) return <FiUserCheck />;
  if (type?.startsWith("session")) return <FiClock />;
  return <FiBell />;
};

const toneFor = (type) => {
  if (type === "query.approved" || type === "attendance.finalized" || type === "device.approved") return "success";
  if (type === "query.rejected" || type === "device.rejected") return "danger";
  if (type === "query.created" || type === "query.reopened" || type === "query.expired") return "warning";
  return "info";
};

const Notifications = () => {
  const { user, loading, logout } = useRoleSession(["student", "teacher", "superadmin"]);
  const toast = useToast();
  const role = user?.role || "student";
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState("all");
  const [pageLoading, setPageLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setPageLoading(true);
    setError("");
    try {
      const response = await axios.get(`${SERVER_URL}/notifications?limit=100`, requestConfig);
      setNotifications(Array.isArray(response.data?.notifications) ? response.data.notifications : []);
      setUnread(Number(response.data?.unread) || 0);
    } catch (requestError) {
      if (requestError?.response?.status === 401) return;
      setError(messageFor(requestError, "Could not load notifications."));
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const filtered = useMemo(
    () => (tab === "unread" ? notifications.filter((item) => !item.readAt) : notifications),
    [notifications, tab]
  );

  const markRead = async (notification) => {
    if (notification.readAt) return;
    setBusy(notification.id);
    try {
      await axios.post(`${SERVER_URL}/notifications/${notification.id}/read`, null, requestConfig);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item
        )
      );
      setUnread((current) => Math.max(0, current - 1));
    } catch (requestError) {
      toast(messageFor(requestError, "Could not mark this notification read."), "error");
    } finally {
      setBusy("");
    }
  };

  const markAll = async () => {
    setBusy("all");
    try {
      await axios.post(`${SERVER_URL}/notifications/read-all`, null, requestConfig);
      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
      setUnread(0);
      toast("All notifications marked read.", "success");
    } catch (requestError) {
      toast(messageFor(requestError, "Could not mark everything read."), "error");
    } finally {
      setBusy("");
    }
  };

  const clearRead = async () => {
    setBusy("clear");
    try {
      const response = await axios.delete(`${SERVER_URL}/notifications/read`, requestConfig);
      setNotifications((current) => current.filter((item) => !item.readAt));
      toast(`${response.data?.deleted || 0} read notification${response.data?.deleted === 1 ? "" : "s"} cleared.`, "success");
    } catch (requestError) {
      toast(messageFor(requestError, "Could not clear read notifications."), "error");
    } finally {
      setBusy("");
    }
  };

  if (loading || pageLoading) return <PageLoader label="Loading notifications…" />;
  if (!user) return <PageLoader label="Opening sign in…" />;

  const name = user.name || user.email?.split("@")[0] || "You";

  return (
    <AppShell role={role} name={name} email={user.email} onLogout={logout}>
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Notifications</h1>
          <p className="ui-page-head__sub">
            Session starts, published attendance, query decisions and device approvals. Everything
            here is tied to your account.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" size="sm" onClick={() => load()}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </Button>
          {unread > 0 && (
            <Button size="sm" onClick={markAll} loading={busy === "all"}>
              <FiCheck aria-hidden="true" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="metric-strip">
        <div className="metric metric--indigo">
          <div className="metric__label">Unread</div>
          <div className="metric__value">{unread}</div>
          <div className="metric__hint">Waiting for you</div>
        </div>
        <div className="metric">
          <div className="metric__label">Total</div>
          <div className="metric__value">{notifications.length}</div>
          <div className="metric__hint">Latest 100</div>
        </div>
        <div className="metric metric--success">
          <div className="metric__label">Read</div>
          <div className="metric__value">{notifications.length - unread}</div>
          <div className="metric__hint">Archive can be cleared</div>
        </div>
      </div>

      <Card>
        <div className="page-toolbar" style={{ marginBottom: 14 }}>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "all", label: "All", count: notifications.length },
              { value: "unread", label: "Unread", count: unread },
            ]}
          />
          <Button variant="ghost" size="sm" onClick={clearRead} loading={busy === "clear"} disabled={notifications.length === unread}>
            <FiTrash2 aria-hidden="true" /> Clear read
          </Button>
        </div>

        {error ? (
          <div className="notice notice--danger" role="alert">
            <FiAlertTriangle className="notice__icon" aria-hidden="true" />
            <div><strong>Notifications unavailable</strong><p>{error}</p></div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FiBell />}
            title={tab === "unread" ? "Nothing unread" : "No notifications yet"}
            text="When a session starts or a query is decided, it will appear here."
          />
        ) : (
          <div className="notification-list">
            {filtered.map((notification) => (
              <article
                className={`notification-item ${notification.readAt ? "" : "is-unread"}`}
                key={notification.id}
              >
                <span className="notification-item__icon" aria-hidden="true">
                  {iconFor(notification.type)}
                </span>
                <div className="notification-item__body">
                  <div className="notification-item__head">
                    <strong>{notification.title}</strong>
                    <time dateTime={notification.createdAt || undefined}>
                      {relativeTime(notification.createdAt)}
                    </time>
                  </div>
                  {notification.message && (
                    <p className="notification-item__message">{notification.message}</p>
                  )}
                  <div className="notification-item__actions">
                    <Badge variant={toneFor(notification.type)}>{notification.type}</Badge>
                    {notification.isDemo && <Badge variant="warning">demo</Badge>}
                    {notification.link && (
                      <Link className="ui-btn ui-btn--soft ui-btn--sm" to={notification.link} onClick={() => markRead(notification)}>
                        Open
                      </Link>
                    )}
                    {!notification.readAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markRead(notification)}
                        loading={busy === notification.id}
                      >
                        <FiCheck aria-hidden="true" /> Mark read
                      </Button>
                    )}
                    <span className="query-window">{formatDateTime(notification.createdAt)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {busy && busy !== "all" && busy !== "clear" && (
        <div className="loading-inline"><Spinner /> Updating…</div>
      )}
    </AppShell>
  );
};

export default Notifications;
