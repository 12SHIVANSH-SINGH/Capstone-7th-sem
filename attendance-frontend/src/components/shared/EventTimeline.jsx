import React from "react";
import { formatDateTime } from "../../utils/format";

/**
 * Chronological event feed used by wave diagnostics and query/audit detail.
 * Each event is intentionally small: timestamp, status tone, title, detail.
 */
const EventTimeline = ({ events = [], empty = "No events yet.", compact = false }) => {
  if (!events.length) {
    return <p className="timeline-empty">{empty}</p>;
  }

  return (
    <ol className={`timeline ${compact ? "timeline--compact" : ""}`}>
      {events.map((event, index) => (
        <li className={`timeline__item timeline__item--${event.tone || "neutral"}`} key={event.id || `${event.at}-${index}`}>
          <span className="timeline__dot" aria-hidden="true">
            {event.icon || (event.tone === "success" ? "✓" : event.tone === "warning" ? "!" : "•")}
          </span>
          <div className="timeline__body">
            <div className="timeline__head">
              <strong>{event.title}</strong>
              <time dateTime={event.at || undefined}>{formatDateTime(event.at)}</time>
            </div>
            {event.detail && <p className="timeline__detail">{event.detail}</p>}
            {event.meta && <div className="timeline__meta">{event.meta}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
};

export default EventTimeline;
