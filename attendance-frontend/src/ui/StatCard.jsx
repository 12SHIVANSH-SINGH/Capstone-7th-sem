import React from "react";

// tones: indigo | emerald | amber | sky
const StatCard = ({ icon, label, value, hint, tone = "indigo" }) => (
  <div className="ui-stat">
    <span className={`ui-stat__icon ui-stat__icon--${tone}`} aria-hidden="true">{icon}</span>
    <div>
      <div className="ui-stat__value">{value}</div>
      <div className="ui-stat__label">{label}</div>
      {hint && <div className="ui-stat__hint">{hint}</div>}
    </div>
  </div>
);

export default StatCard;
