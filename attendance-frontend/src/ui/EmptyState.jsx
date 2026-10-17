import React from "react";

const EmptyState = ({ icon, title, text, action }) => (
  <div className="ui-empty">
    {icon && <span className="ui-empty__icon" aria-hidden="true">{icon}</span>}
    <h3 className="ui-empty__title">{title}</h3>
    {text && <p className="ui-empty__text">{text}</p>}
    {action && <div className="ui-empty__action">{action}</div>}
  </div>
);

export default EmptyState;
