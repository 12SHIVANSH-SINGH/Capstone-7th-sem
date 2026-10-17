import React from "react";

const Card = ({ title, subtitle, actions, pad = true, className = "", children }) => (
  <section className={`ui-card ${pad ? "ui-card--pad" : ""} ${className}`}>
    {(title || actions) && (
      <header className="ui-card__header">
        <div>
          {title && <h2 className="ui-card__title">{title}</h2>}
          {subtitle && <p className="ui-card__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="ui-card__actions">{actions}</div>}
      </header>
    )}
    {children}
  </section>
);

export default Card;
