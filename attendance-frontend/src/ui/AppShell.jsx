import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import { FiBell, FiCheck, FiChevronDown, FiCloudOff, FiDownload, FiMenu, FiMoon, FiSun, FiX } from "react-icons/fi";
import Badge from "./Badge";
import Brand from "./Brand";
import { dashboardPath, roleLabel } from "../utils/auth";
import { isLinkActive, mergeLinks } from "./navigation";
import SERVER_URL from "../config/api";

const requestConfig = { withCredentials: true };
const iconButton = "ui-icon-btn";

const AppShell = ({ role, name, email, onLogout, links = [], children }) => {
  const location = useLocation();
  const initial = String(name || email || "?").trim().charAt(0).toUpperCase();
  const resolvedLinks = mergeLinks(role, links);
  // Six links fit comfortably beside the brand and account controls. Anything
  // beyond that lives in a "More" menu so no role's navigation gets clipped.
  const primaryLinks = resolvedLinks.slice(0, 6);
  const overflowLinks = resolvedLinks.slice(6);
  const moreActive = overflowLinks.some((link) => isLinkActive(location.pathname, link.to));
  const hasProfileLink = resolvedLinks.some((link) => link.to === "/profile");
  const hasNotificationsLink = resolvedLinks.some((link) => link.to === "/notifications");

  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("bioattend.theme") || "light";
  });
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [impersonator, setImpersonator] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("bioattend.installDismissed") === "1";
  });
  const bellRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handlePrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallDismissed(true);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismissInstall = () => {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem("bioattend.installDismissed", "1");
    } catch (error) {
      // Private browsing can reject storage; just hide the banner.
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
    } finally {
      setInstallPrompt(null);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("bioattend.theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b1120" : "#4F46E5");
  }, [theme]);

  useEffect(() => {
    setMobileOpen(false);
    setBellOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  const loadNotifications = useCallback(async () => {
    if (!role) return;
    try {
      const response = await axios.get(`${SERVER_URL}/notifications?limit=6`, requestConfig);
      setNotifications(Array.isArray(response.data?.notifications) ? response.data.notifications : []);
      setUnread(Number(response.data?.unread) || 0);
    } catch (error) {
      // A notification preview must never make a working page fail.
      if (error?.response?.status === 401) return;
    }
  }, [role]);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const response = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
        if (!cancelled && response.data?.impersonating) {
          setImpersonator(response.data.impersonator || { name: "Super admin" });
        }
      } catch (error) {
        // The page itself will surface a session failure.
      }
    };
    if (role) loadSession();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    const handleClick = (event) => {
      if (bellRef.current && !bellRef.current.contains(event.target)) setBellOpen(false);
      if (moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const stopImpersonation = async () => {
    setStopping(true);
    try {
      await axios.post(`${SERVER_URL}/admin/stop-impersonation`, null, requestConfig);
      window.location.assign("/admin");
    } catch (error) {
      setStopping(false);
      window.location.assign("/login");
    }
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${SERVER_URL}/notifications/read-all`, null, requestConfig);
      setUnread(0);
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    } catch (error) {
      // Leave the badge as-is; the full page can retry.
    }
  };

  return (
    <div className="ui-shell">
      <header className="ui-shell__bar">
        <div className="ui-shell__inner">
          <Brand to={dashboardPath(role)} />

          <nav className="ui-shell__nav" aria-label="Primary">
            {primaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`ui-shell__link ${
                  link.active || isLinkActive(location.pathname, link.to) ? "is-active" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}

            {overflowLinks.length > 0 && (
              <div className="ui-more" ref={moreRef}>
                <button
                  type="button"
                  className={`ui-shell__link ui-more__button ${moreActive ? "is-active" : ""}`}
                  onClick={() => setMoreOpen((current) => !current)}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                >
                  More <FiChevronDown aria-hidden="true" />
                </button>
                {moreOpen && (
                  <div className="ui-more__menu" role="menu">
                    {overflowLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        role="menuitem"
                        className={`ui-more__item ${isLinkActive(location.pathname, link.to) ? "is-active" : ""}`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="ui-shell__user">
            <Badge variant={role === "superadmin" ? "warning" : role === "teacher" ? "primary" : "neutral"}>
              {roleLabel(role)}
            </Badge>

            <div className="ui-bell" ref={bellRef}>
              <button
                type="button"
                className={`${iconButton} ui-bell__button`}
                onClick={() => setBellOpen((current) => !current)}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                aria-expanded={bellOpen}
              >
                <FiBell aria-hidden="true" />
                {unread > 0 && <span className="ui-bell__count">{unread > 9 ? "9+" : unread}</span>}
              </button>
              {bellOpen && (
                <div className="ui-bell__panel" role="menu">
                  <div className="ui-bell__head">
                    <strong>Notifications</strong>
                    {unread > 0 && (
                      <button type="button" className="ui-link-btn" onClick={markAllRead}>
                        <FiCheck aria-hidden="true" /> Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="ui-bell__empty">Nothing new yet.</p>
                  ) : (
                    <ul className="ui-bell__list">
                      {notifications.map((notification) => (
                        <li key={notification.id}>
                          <Link
                            to={notification.link || "/notifications"}
                            className={`ui-bell__item ${notification.readAt ? "" : "is-unread"}`}
                            onClick={() => setBellOpen(false)}
                          >
                            <strong>{notification.title}</strong>
                            {notification.message && <span>{notification.message}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="ui-bell__footer" to="/notifications" onClick={() => setBellOpen(false)}>
                    Open notification centre
                  </Link>
                </div>
              )}
            </div>

            <button
              type="button"
              className={iconButton}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "Use light theme" : "Use dark theme"}
              aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
            >
              {theme === "dark" ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
            </button>

            <div className="ui-user-info">
              <span className="ui-user-info__name">{name}</span>
              <span className="ui-user-info__email">{email}</span>
            </div>
            <Link to="/profile" className="ui-avatar" aria-label="Open your profile" title="Profile">
              {initial}
            </Link>
            <button type="button" className={iconButton} onClick={onLogout} title="Log out" aria-label="Log out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className={`${iconButton} ui-shell__menu`}
              onClick={() => setMobileOpen((current) => !current)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="ui-shell__mobile" aria-label="Mobile navigation">
            {resolvedLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`ui-shell__mobile-link ${
                  link.active || isLinkActive(location.pathname, link.to) ? "is-active" : ""
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {!hasProfileLink && (
              <Link to="/profile" className="ui-shell__mobile-link" onClick={() => setMobileOpen(false)}>
                Profile &amp; settings
              </Link>
            )}
            {!hasNotificationsLink && (
              <Link to="/notifications" className="ui-shell__mobile-link" onClick={() => setMobileOpen(false)}>
                Notifications {unread > 0 ? `(${unread})` : ""}
              </Link>
            )}
          </nav>
        )}
      </header>

      {!online && (
        <div className="ui-connectivity" role="status">
          <FiCloudOff aria-hidden="true" />
          <span>
            You are offline. The app shell is still available, but attendance, queries and
            exports need a connection.
          </span>
        </div>
      )}

      {installPrompt && !installDismissed && (
        <div className="ui-install" role="status">
          <FiDownload aria-hidden="true" />
          <span>
            <strong>Install Bio Attend</strong> on this device for a full-screen check-in
            shortcut.
          </span>
          <button type="button" className="ui-btn ui-btn--soft ui-btn--sm" onClick={installApp}>
            Install app
          </button>
          <button
            type="button"
            className="ui-icon-btn"
            onClick={dismissInstall}
            aria-label="Dismiss install prompt"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
      )}

      {impersonator && (
        <div className="ui-impersonation" role="status">
          <span>
            You are viewing as <strong>{name || email}</strong>. Actions are recorded under this account with{" "}
            <strong>{impersonator.email || impersonator.name}</strong> as the impersonator.
          </span>
          <button type="button" className="ui-btn ui-btn--soft ui-btn--sm" onClick={stopImpersonation} disabled={stopping}>
            {stopping ? "Returning…" : "Return to admin"}
          </button>
        </div>
      )}

      <main className="ui-shell__main">{children}</main>
    </div>
  );
};

export default AppShell;
