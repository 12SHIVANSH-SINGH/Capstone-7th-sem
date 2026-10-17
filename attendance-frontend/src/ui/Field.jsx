import React from "react";

// Label + control wrapper. Pass a native input/textarea as children.
const Field = ({ label, htmlFor, error, hint, className = "", children }) => (
  <div className={`ui-field ${className}`}>
    {label && <label className="ui-field__label" htmlFor={htmlFor}>{label}</label>}
    {children}
    {error ? (
      <p className="ui-field__error">{error}</p>
    ) : hint ? (
      <p className="ui-field__hint">{hint}</p>
    ) : null}
  </div>
);

export default Field;
