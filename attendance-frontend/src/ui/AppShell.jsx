import React from "react";
import { Link } from "react-router-dom";
import Badge from "./Badge";
import Brand from "./Brand";

// Sticky top bar + centered content column shared by every signed-in page.
// `links` is an array of { to, label, active }.
const AppShell = ({ role, name, email, onLogout, links = [], children }) => {
  const initial = String(name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="ui-shell">
      <header className="ui-shell__bar">
        <div className="ui-shell__inner">
          <Brand />

          {links.length > 0 && (
            <nav className="ui-shell__nav" aria-label="Primary">
              {links.map((link) => (
                <Link key={link.to} to={link.to} className={`ui-shell__link ${link.active ? "is-active" : ""}`}>
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="ui-shell__user">
            <Badge variant={role === "teacher" ? "primary" : "neutral"}>
              {role === "teacher" ? "Teacher" : "Student"}
            </Badge>
            <div className="ui-user-info">
              <span className="ui-user-info__name">{name}</span>
              <span className="ui-user-info__email">{email}</span>
            </div>
            <span className="ui-avatar" aria-hidden="true">{initial}</span>
            <button type="button" className="ui-icon-btn" onClick={onLogout} title="Log out" aria-label="Log out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>
      <main className="ui-shell__main">{children}</main>
    </div>
  );
};

export default AppShell;
