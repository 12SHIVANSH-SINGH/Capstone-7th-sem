import React from "react";

export const Spinner = ({ large = false }) => (
  <span className={`ui-spinner ${large ? "ui-spinner--lg" : ""}`} role="status" aria-label="Loading" />
);

export const PageLoader = ({ label = "Loading…" }) => (
  <div className="ui-page-loader">
    <Spinner large />
    <p>{label}</p>
  </div>
);

export default Spinner;
