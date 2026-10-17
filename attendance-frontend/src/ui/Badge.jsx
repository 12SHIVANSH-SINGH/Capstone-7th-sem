import React from "react";

// variants: primary | neutral | success | warning | danger | info
const Badge = ({ variant = "neutral", dot = false, className = "", children }) => (
  <span className={`ui-badge ui-badge--${variant} ${className}`}>
    {dot && <span className="ui-badge__dot" aria-hidden="true" />}
    {children}
  </span>
);

export default Badge;
