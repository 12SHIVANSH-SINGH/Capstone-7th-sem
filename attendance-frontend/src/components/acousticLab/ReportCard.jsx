import React, { useRef, useState } from "react";
import { FiClipboard, FiDownload } from "react-icons/fi";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import { copyText, downloadJson } from "./linkUtils";

const ReportCard = ({ title, subtitle, text, json, filename, disabled = false }) => {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const areaRef = useRef(null);

  const handleCopy = async () => {
    setFallback(false);
    const ok = await copyText(text);
    setCopied(ok);
    if (!ok) {
      setFallback(true);
      window.setTimeout(() => {
        areaRef.current?.focus();
        areaRef.current?.select();
      }, 0);
    }
  };

  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={handleCopy} disabled={disabled}>
            <FiClipboard aria-hidden="true" />
            {copied ? "Copied" : "Copy report"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => downloadJson(filename, json)}
            disabled={disabled}
          >
            <FiDownload aria-hidden="true" />
            JSON
          </Button>
        </>
      }
    >
      {copied && <p className="fsk-link__copy-status" role="status">Report copied to the clipboard.</p>}
      {fallback && (
        <div className="fsk-link__report-fallback">
          <p>Clipboard access was blocked. Select the report and copy it manually.</p>
          <textarea ref={areaRef} readOnly value={text} aria-label="Test report" />
        </div>
      )}
      {!fallback && !copied && (
        <p className="fsk-link__muted">
          The report includes the run ID, device details, counters and test conditions. Pair it
          with the other phone's report using the same run ID.
        </p>
      )}
    </Card>
  );
};

export default ReportCard;
