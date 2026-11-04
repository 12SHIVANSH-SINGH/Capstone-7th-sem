import React from "react";

const Tabs = ({ tabs = [], value, onChange, className = "" }) => (
  <div className={`ui-tabs ${className}`} role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.value}
        type="button"
        role="tab"
        aria-selected={value === tab.value}
        className={`ui-tabs__tab ${value === tab.value ? "is-active" : ""}`}
        onClick={() => onChange?.(tab.value)}
      >
        {tab.label}
        {tab.count !== undefined && tab.count !== null && (
          <span className="ui-tabs__count">{tab.count}</span>
        )}
      </button>
    ))}
  </div>
);

export default Tabs;
