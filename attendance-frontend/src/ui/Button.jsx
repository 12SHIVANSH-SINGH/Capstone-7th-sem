import React from "react";

// variants: primary | secondary | ghost | soft | danger
// sizes: sm | md | lg
const Button = ({ variant = "primary", size = "md", block = false, loading = false, className = "", children, disabled, ...rest }) => (
  <button
    type="button"
    className={`ui-btn ui-btn--${variant} ui-btn--${size} ${block ? "ui-btn--block" : ""} ${className}`}
    disabled={disabled || loading}
    {...rest}
  >
    {loading && <span className="ui-spinner ui-spinner--on-btn" aria-hidden="true" />}
    {children}
  </button>
);

export default Button;
