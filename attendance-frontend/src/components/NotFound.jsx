import React from "react";
import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="ui-notfound">
    <p className="ui-notfound__code">404</p>
    <h1>This page doesn’t exist.</h1>
    <p>The link may be old or mistyped. Everything lives on the home page.</p>
    <div className="ui-notfound__actions">
      <Link to="/" className="ui-btn ui-btn--primary">Back to home</Link>
      <Link to="/login" className="ui-btn ui-btn--secondary">Sign in</Link>
    </div>
  </div>
);

export default NotFound;
