import React from "react";
import { Link } from "react-router-dom";

// Gradient brand mark + wordmark, shared by the public navbar and the app shell.
const Brand = ({ to = "/" }) => (
  <Link to={to} className="ui-brand">
    <span className="ui-brand__mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 9.5v5M8 5.5v13M12 8.5v7M16 4.5v15M20 10v4" />
      </svg>
    </span>
    <span className="ui-brand__name">
      Bio<em>Attend</em>
    </span>
  </Link>
);

export default Brand;
