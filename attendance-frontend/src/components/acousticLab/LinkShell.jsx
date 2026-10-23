import React from "react";
import { Link } from "react-router-dom";
import Brand from "../../ui/Brand";

const LinkShell = ({ eyebrow, title, description, status, actions, children }) => (
  <main className="fsk-link">
    <div className="fsk-link__shell">
      <div className="fsk-link__topbar">
        <Brand />
        <div className="fsk-link__topbar-actions">
          <Link to="/acoustic-lab" className="ui-btn ui-btn--secondary ui-btn--sm">
            Acoustic lab
          </Link>
          <Link to="/" className="ui-btn ui-btn--ghost ui-btn--sm">
            Home
          </Link>
        </div>
      </div>

      <header className="fsk-link__hero">
        <div>
          <p className="fsk-link__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {status}
      </header>

      {actions && <div className="fsk-link__hero-actions">{actions}</div>}
      {children}

      <footer className="fsk-link__footer">
        <span>Bio Attend · Layer 1 two-phone link</span>
        <span>No sign-in · no stored audio · no attendance claim</span>
      </footer>
    </div>
  </main>
);

export default LinkShell;
