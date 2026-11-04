import React from "react";

/**
 * Lightweight SVG charts. No chart dependency, no canvas, and the series can
 * be read by assistive technology through the generated text summary.
 */
export const LineChart = ({ points = [], height = 160, label = "Attendance trend", formatValue = (value) => `${value}%` }) => {
  const valid = points.filter((point) => point.value !== null && point.value !== undefined);
  if (valid.length === 0) {
    return <p className="chart-empty">No closed sessions to chart yet.</p>;
  }

  const width = 620;
  const padX = 28;
  const padY = 18;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const values = valid.map((point) => Number(point.value));
  const min = Math.max(0, Math.min(...values) - 8);
  const max = Math.min(100, Math.max(...values) + 8);
  const span = max - min || 1;
  const step = valid.length > 1 ? innerWidth / (valid.length - 1) : 0;

  const coords = valid.map((point, index) => {
    const x = padX + index * step;
    const y = padY + innerHeight - ((Number(point.value) - min) / span) * innerHeight;
    return { ...point, x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `M ${coords[0].x} ${padY + innerHeight} L ${coords
    .map((point) => `${point.x} ${point.y}`)
    .join(" L ")} L ${coords[coords.length - 1].x} ${padY + innerHeight} Z`;

  return (
    <div className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}: ${valid.map((point) => `${point.label} ${formatValue(point.value)}`).join(", ")}`}
      >
        <line x1={padX} y1={padY + innerHeight} x2={width - padX} y2={padY + innerHeight} className="chart__axis" />
        <line x1={padX} y1={padY} x2={padX} y2={padY + innerHeight} className="chart__axis" />
        <path d={area} className="chart__area" />
        <polyline points={line} className="chart__line" fill="none" />
        {coords.map((point) => (
          <g key={`${point.label}-${point.sessionId || point.x}`}>
            <circle cx={point.x} cy={point.y} r="4" className="chart__dot" />
            <title>{`${point.label}: ${formatValue(point.value)}`}</title>
          </g>
        ))}
      </svg>
      <div className="chart__labels">
        {valid.map((point) => (
          <span key={`${point.label}-${point.sessionId || point.label}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
};

export const BarChart = ({ items = [], empty = "No data yet." }) => {
  if (!items.length) return <p className="chart-empty">{empty}</p>;
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  return (
    <div className="bar-chart">
      {items.map((item) => (
        <div className="bar-chart__row" key={item.label}>
          <span className="bar-chart__label">{item.label}</span>
          <span className="bar-chart__track">
            <span
              className={`bar-chart__bar ${item.tone ? `bar-chart__bar--${item.tone}` : ""}`}
              style={{ width: `${Math.max((Number(item.value) / max) * 100, 2)}%` }}
            />
          </span>
          <span className="bar-chart__value">{item.display || item.value}</span>
        </div>
      ))}
    </div>
  );
};

export const Donut = ({ value, label, tone = "indigo" }) => {
  const numeric = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
  const circumference = 2 * Math.PI * 34;
  const offset = circumference - (numeric / 100) * circumference;
  return (
    <div className={`donut donut--${tone}`}>
      <svg viewBox="0 0 84 84" role="img" aria-label={`${label}: ${numeric}%`}>
        <circle cx="42" cy="42" r="34" className="donut__track" />
        <circle
          cx="42"
          cy="42"
          r="34"
          className="donut__value"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <div className="donut__text">
        <strong>{value === null || value === undefined ? "—" : `${numeric}%`}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
};
