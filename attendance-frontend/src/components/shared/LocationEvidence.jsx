import React from "react";
import { FiMapPin } from "react-icons/fi";
import { formatDateTime, formatDistance } from "../../utils/format";

const LocationBlock = ({ title, location, tone = "neutral", note }) => (
  <div className={`location-block location-block--${tone}`}>
    <div className="location-block__head">
      <span className="location-block__icon" aria-hidden="true"><FiMapPin /></span>
      <div>
        <strong>{title}</strong>
        <span>{location?.capturedAt ? formatDateTime(location.capturedAt) : "Not captured"}</span>
      </div>
    </div>
    {location?.latitude !== undefined && location?.latitude !== null ? (
      <dl className="location-block__grid">
        <div><dt>Latitude</dt><dd>{Number(location.latitude).toFixed(6)}</dd></div>
        <div><dt>Longitude</dt><dd>{Number(location.longitude).toFixed(6)}</dd></div>
        <div><dt>Accuracy</dt><dd>{location.accuracy ? `±${Math.round(location.accuracy)} m` : "—"}</dd></div>
        <div><dt>Source</dt><dd>{location.source || "browser"}</dd></div>
      </dl>
    ) : (
      <p className="location-block__missing">No location was shared. The decision still rests on the teacher's evidence.</p>
    )}
    {note && <p className="location-block__note">{note}</p>}
  </div>
);

const LocationEvidence = ({ teacherLocation, attemptLocation, studentLocation, distanceMeters, withinRadius, radiusMeters }) => (
  <div className="location-evidence">
    <div className="location-evidence__grid">
      <LocationBlock title="Teacher at session start" location={teacherLocation} tone="indigo" />
      <LocationBlock title="Student at check-in attempt" location={attemptLocation} tone="teal" />
      <LocationBlock title="Student at query" location={studentLocation} tone="amber" />
    </div>
    <div className="location-evidence__verdict">
      <div>
        <span>Distance to teacher</span>
        <strong>{formatDistance(distanceMeters)}</strong>
      </div>
      <div>
        <span>Class window</span>
        <strong>{radiusMeters ? `${radiusMeters} m` : "—"}</strong>
      </div>
      <div>
        <span>Within window</span>
        <strong className={withinRadius === true ? "text-success" : withinRadius === false ? "text-danger" : ""}>
          {withinRadius === true ? "Yes" : withinRadius === false ? "No" : "Unknown"}
        </strong>
      </div>
    </div>
  </div>
);

export default LocationEvidence;
