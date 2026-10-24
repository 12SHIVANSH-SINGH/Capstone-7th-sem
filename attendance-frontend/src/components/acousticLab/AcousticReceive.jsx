import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCopy, FiMic, FiSquare } from "react-icons/fi";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import {
  dbToMeterPercent,
  evaluateContextSampleRate,
  evaluateSampleRateGate,
  mapMicError,
} from "../../acoustic/labConfig";
import { createPcmBuffer, extractNextFrame } from "../../acoustic/receiver";
import { digitsToValue } from "../../acoustic/fsk";
import {
  buildRxReportJson,
  decodeRate,
  formatPercent,
  formatRxReport,
  generateRunId,
  normaliseRunId,
  validateRunId,
} from "../../acoustic/transmitPlan";
import LinkShell from "./LinkShell";
import ReportCard from "./ReportCard";
import {
  copyText,
  formatClock,
  initialConditions,
  initialRunId,
  linkFor,
  releaseWakeLock,
  requestWakeLock,
} from "./linkUtils";
import "./fskLink.css";

const CHUNK_SIZE = 4096;
const DECODE_INTERVAL_MS = 900;

const disposeRx = (engine) => {
  if (!engine || engine.disposed) return;
  engine.disposed = true;
  try {
    if (engine.worklet) {
      engine.worklet.port.onmessage = null;
      engine.worklet.port.close?.();
      engine.worklet.disconnect();
    }
  } catch {
    // Already disconnected.
  }
  try {
    engine.source?.disconnect();
  } catch {
    // Already disconnected.
  }
  try {
    engine.silentSink?.disconnect();
  } catch {
    // Already disconnected.
  }
  try {
    engine.stream?.getTracks().forEach((track) => track.stop());
  } catch {
    // Tracks may already be stopped.
  }
  const context = engine.context;
  if (context && context.state !== "closed") context.close().catch(() => {});
};

const AcousticReceive = () => {
  const [linkedRunId] = useState(() => initialRunId());
  const [runId, setRunId] = useState(() => linkedRunId || generateRunId());
  const [planned, setPlanned] = useState(10);
  const [phase, setPhase] = useState("idle");
  const [decoded, setDecoded] = useState(0);
  const [keys, setKeys] = useState([]);
  const [lastFrame, setLastFrame] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levelDb, setLevelDb] = useState(null);
  const [device, setDevice] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [conditions, setConditions] = useState(() => ({
    distance: "1 m",
    room: "",
    notes: "",
    ...initialConditions(),
  }));

  const engineRef = useRef(null);
  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const decodeTimerRef = useRef(null);
  const levelTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const levelRef = useRef(null);
  const decodedRef = useRef(0);
  const keysRef = useRef([]);
  const framesRef = useRef([]);
  const wakeLockRef = useRef(null);

  const clearTimers = () => {
    for (const timer of [decodeTimerRef.current, levelTimerRef.current, elapsedTimerRef.current]) {
      if (timer) window.clearInterval(timer);
    }
    decodeTimerRef.current = null;
    levelTimerRef.current = null;
    elapsedTimerRef.current = null;
  };

  const disposeCurrent = useCallback(() => {
    clearTimers();
    const engine = engineRef.current;
    engineRef.current = null;
    disposeRx(engine);
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    releaseWakeLock(lock);
  }, []);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      runningRef.current = false;
      disposeCurrent();
    },
    [disposeCurrent]
  );

  const decodePass = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.disposed) return;

    const found = [];
    let next = extractNextFrame(engine.buffer, { sampleRate: engine.context.sampleRate });
    while (next) {
      found.push(next);
      next = extractNextFrame(engine.buffer, { sampleRate: engine.context.sampleRate });
    }
    if (found.length === 0) return;

    decodedRef.current += found.length;
    keysRef.current = [...keysRef.current, ...found.map((frame) => digitsToValue(frame.dataDigits))].slice(-200);
    framesRef.current = [
      ...framesRef.current,
      ...found.map((frame) => ({
        // Audio time, not detection time: decode passes may run late and in
        // batches, which made the old wall-clock timestamps non-monotonic
        // relative to the frame's actual position in the captured stream.
        atMs: Math.round((frame.frameStartSample / engine.context.sampleRate) * 1000),
        frameStartSample: frame.frameStartSample,
        key: digitsToValue(frame.dataDigits),
        marginDb: Number(frame.margin.toFixed(1)),
      })),
    ].slice(-200);
    setDecoded(decodedRef.current);
    setKeys(keysRef.current);
    setLastFrame(found[found.length - 1]);
  }, []);

  const startListening = async () => {
    if (runningRef.current) return;
    setError("");
    setNotice("");

    const id = normaliseRunId(runId);
    if (!validateRunId(id)) {
      setError("Run ID must be 4-12 characters using letters and digits (no O, I, 0 or 1).");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access needs HTTPS or localhost. Open this page over a secure connection.");
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setError("This browser does not expose the Web Audio API. Use current Chrome on Android.");
      return;
    }

    runningRef.current = true;
    disposeCurrent();
    sessionRef.current += 1;
    const session = sessionRef.current;
    setPhase("starting");
    setDecoded(0);
    setKeys([]);
    setLastFrame(null);
    setElapsedMs(0);
    setLevelDb(null);
    setDevice(null);
    decodedRef.current = 0;
    keysRef.current = [];
    framesRef.current = [];
    levelRef.current = null;
    setHasRun(true);

    let context = null;
    let stream = null;
    let engine = null;

    try {
      context = new AudioContextClass();
      const contextGate = evaluateContextSampleRate(context.sampleRate);
      if (!contextGate.ok) {
        await context.close().catch(() => {});
        context = null;
        if (session === sessionRef.current) {
          runningRef.current = false;
          setPhase("idle");
          setError(contextGate.message);
        }
        return;
      }

      if (context.state === "suspended") await context.resume();
      if (session !== sessionRef.current) {
        await context.close().catch(() => {});
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const gate = evaluateSampleRateGate({
        contextRate: context.sampleRate,
        trackRate: settings.sampleRate,
      });
      if (!gate.ok) {
        const rateError = new Error(gate.message);
        rateError.name = "SampleRateError";
        throw rateError;
      }

      // One monotonic start clock for both the live counter and per-frame
      // report timestamps, so they cannot drift apart.
      const listeningStart = performance.now();
      engine = {
        context,
        stream,
        source: null,
        worklet: null,
        silentSink: null,
        buffer: createPcmBuffer(),
        disposed: false,
        elapsedMs: () => performance.now() - listeningStart,
      };
      engineRef.current = engine;

      if (session !== sessionRef.current) {
        disposeRx(engine);
        return;
      }

      if (!context.audioWorklet || typeof AudioWorkletNode !== "function") {
        throw new Error("This browser does not support AudioWorklet. Use current Chrome on Android.");
      }

      await context.audioWorklet.addModule(
        `${process.env.PUBLIC_URL}/pcm-capture-worklet.js?v=1`
      );
      if (session !== sessionRef.current) {
        disposeRx(engine);
        return;
      }

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { chunkSize: CHUNK_SIZE },
      });
      const silentSink = context.createGain();
      silentSink.gain.value = 0;
      engine.source = source;
      engine.worklet = worklet;
      engine.silentSink = silentSink;

      worklet.port.onmessage = ({ data }) => {
        if (!data || data.type !== "pcm" || !data.samples) return;
        engine.buffer.append(data.samples);
        levelRef.current = data.rms;
      };

      source.connect(worklet);
      worklet.connect(silentSink);
      silentSink.connect(context.destination);

      setDevice({
        role: "rx",
        contextSampleRate: context.sampleRate,
        trackSampleRate: Number.isFinite(settings.sampleRate) ? settings.sampleRate : null,
        warning: gate.warning || null,
        userAgent: navigator.userAgent,
      });
      setPhase("listening");
      startTimeRef.current = performance.now();
      wakeLockRef.current = await requestWakeLock();
      if (session !== sessionRef.current) return;

      levelTimerRef.current = window.setInterval(() => {
        const rms = levelRef.current;
        setLevelDb(Number.isFinite(rms) && rms > 0 ? 20 * Math.log10(rms) : null);
      }, 100);

      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - startTimeRef.current);
      }, 250);

      decodeTimerRef.current = window.setInterval(decodePass, DECODE_INTERVAL_MS);
    } catch (startError) {
      if (engine) {
        disposeRx(engine);
      } else {
        try {
          stream?.getTracks().forEach((item) => item.stop());
        } catch {
          // Already stopped.
        }
        if (context && context.state !== "closed") await context.close().catch(() => {});
      }
      if (engineRef.current === engine) engineRef.current = null;
      if (session !== sessionRef.current) return;
      runningRef.current = false;
      setPhase("idle");
      setDevice(null);
      setLevelDb(null);
      setError(mapMicError(startError));
    }
  };

  const stopListening = useCallback(() => {
    if (!runningRef.current) return;
    sessionRef.current += 1;
    runningRef.current = false;
    setPhase("stopped");
    setLevelDb(null);
    disposeCurrent();
  }, [disposeCurrent]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (!runningRef.current) return;
      stopListening();
      setError(
        "The tab went to the background, so listening stopped and the microphone was released. Keep this page visible and start again."
      );
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [stopListening]);

  const copySenderLink = async () => {
    const copied = await copyText(linkFor("/acoustic-tx", runId));
    setNotice(copied ? "Transmitter link copied. Open it on the other phone." : "Could not copy the link; type the run ID on the other phone.");
  };

  const ratio = decodeRate(decoded, Number(planned));
  const levelPercent = dbToMeterPercent(levelDb);

  const reportText = useMemo(
    () =>
      formatRxReport({
        generatedAt: new Date(),
        device,
        runId,
        planned: Number(planned),
        decoded,
        elapsedMs,
        lastKey: lastFrame ? digitsToValue(lastFrame.dataDigits) : null,
        lastMargin: lastFrame?.margin ?? null,
        keys,
        distance: conditions.distance,
        room: conditions.room,
        notes: conditions.notes,
      }),
    [conditions, decoded, device, elapsedMs, keys, lastFrame, planned, runId]
  );

  const reportJson = useMemo(
    () =>
      buildRxReportJson({
        device,
        runId,
        planned: Number(planned),
        decoded,
        elapsedMs,
        keys,
        lastKey: lastFrame ? digitsToValue(lastFrame.dataDigits) : null,
        lastMargin: lastFrame?.margin ?? null,
        frames: framesRef.current,
        distance: conditions.distance,
        room: conditions.room,
        notes: conditions.notes,
      }),
    // `decoded` changes in the same pass that appends to framesRef, so it keeps
    // the exported frame list in sync without a second state variable.
    [conditions, decoded, device, elapsedMs, keys, lastFrame, planned, runId]
  );

  const phaseBadge =
    phase === "listening" ? "success" : phase === "starting" ? "info" : phase === "stopped" ? "warning" : "neutral";
  const busy = phase === "starting" || phase === "listening";

  return (
    <LinkShell
      eyebrow="Layer 1 · receiver"
      title="Hear and decode acoustic frames"
      description="This phone listens with its microphone and decodes FSK frames from the other phone. Keep it on the receiver page before the transmitter starts."
      status={<Badge variant={phaseBadge} dot>{phase}</Badge>}
      actions={
        <Button variant="secondary" onClick={copySenderLink}>
          <FiCopy aria-hidden="true" /> Copy transmitter link
        </Button>
      }
    >
      {notice && <div className="fsk-link__alert fsk-link__alert--success" role="status">{notice}</div>}
      {error && <div className="fsk-link__alert fsk-link__alert--error" role="alert">{error}</div>}

      <div className="fsk-link__grid">
        <Card title="Receiver" subtitle="Start listening before the other phone transmits.">
          <div className="fsk-link__form">
            <Field
              label="Run ID"
              htmlFor="rx-run"
              hint="Must match the transmitter. The ID only pairs the reports."
            >
              <div className="fsk-link__inline">
                <input
                  id="rx-run"
                  className="ui-input fsk-link__run-input"
                  value={runId}
                  onChange={(event) => setRunId(normaliseRunId(event.target.value))}
                  maxLength={12}
                  disabled={busy}
                  spellCheck={false}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRunId(generateRunId())}
                  disabled={busy}
                >
                  New
                </Button>
              </div>
            </Field>

            {!linkedRunId && (
              <div className="fsk-link__warning">
                No run ID came with this link, so this page generated its own. Open the
                transmitter's <strong>Copy receiver link</strong> on this phone so both reports
                share the same ID and conditions.
              </div>
            )}

            <Field
              label="Planned frames from the transmitter"
              htmlFor="rx-planned"
              hint="Used only to calculate the decode rate. Enter the TX repeat count."
            >
              <input
                id="rx-planned"
                className="ui-input"
                type="number"
                min={1}
                max={100}
                value={planned}
                onChange={(event) => setPlanned(event.target.value)}
                disabled={busy}
              />
            </Field>

            <div className="fsk-link__actions">
              <Button onClick={startListening} disabled={busy} loading={phase === "starting"}>
                <FiMic aria-hidden="true" />
                {phase === "stopped" || phase === "idle" ? "Start listening" : "Listening…"}
              </Button>
              <Button variant="secondary" onClick={stopListening} disabled={!busy}>
                <FiSquare aria-hidden="true" /> Stop
              </Button>
            </div>

            <div className="fsk-link__level">
              <div className="fsk-link__level-head">
                <span>Microphone level</span>
                <strong>{Number.isFinite(levelDb) ? `${levelDb.toFixed(1)} dBFS` : "—"}</strong>
              </div>
              <div className="fsk-link__level-track" aria-hidden="true">
                <span style={{ width: `${levelPercent ?? 0}%` }} />
              </div>
              <p className="fsk-link__muted">A quiet room is near the bottom. Speech or a tone moves the bar.</p>
            </div>
          </div>
        </Card>

        <Card title="Run conditions" subtitle="Recorded in both reports. Distance and room are free text.">
          <div className="fsk-link__form">
            <Field label="Distance" htmlFor="rx-distance">
              <input
                id="rx-distance"
                className="ui-input"
                value={conditions.distance}
                onChange={(event) => setConditions((current) => ({ ...current, distance: event.target.value }))}
                placeholder="1 m"
              />
            </Field>
            <Field label="Room" htmlFor="rx-room">
              <input
                id="rx-room"
                className="ui-input"
                value={conditions.room}
                onChange={(event) => setConditions((current) => ({ ...current, room: event.target.value }))}
                placeholder="B-204"
              />
            </Field>
            <Field label="Notes" htmlFor="rx-notes">
              <textarea
                id="rx-notes"
                className="ui-textarea"
                rows={3}
                value={conditions.notes}
                onChange={(event) => setConditions((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Phone model, volume, orientation, obstacles…"
              />
            </Field>
          </div>
        </Card>
      </div>

      <Card title="Decode counters" subtitle="Counted after marker, symbol and checksum checks pass.">
        <div className="fsk-link__stats">
          <div><span>Decoded</span><strong>{decoded}</strong></div>
          <div><span>Planned</span><strong>{Number(planned) || "—"}</strong></div>
          <div><span>Decode rate</span><strong>{ratio == null ? "—" : formatPercent(ratio)}</strong></div>
          <div><span>Listening</span><strong>{formatClock(elapsedMs)}</strong></div>
          <div><span>Last margin</span><strong>{Number.isFinite(lastFrame?.margin) ? `${lastFrame.margin.toFixed(1)} dB` : "—"}</strong></div>
        </div>

        {lastFrame && (
          <div className="fsk-link__last-frame">
            <Badge variant="success">Frame decoded</Badge>
            <span>Key value <strong>{digitsToValue(lastFrame.dataDigits)}</strong></span>
            <span>{lastFrame.toneSequence.length} tones</span>
          </div>
        )}

        {keys.length > 0 && (
          <div className="fsk-link__chips" aria-label="Decoded key sequence">
            {keys.slice(-12).map((key, index) => (
              <span key={`${key}-${index}`}>{key}</span>
            ))}
            {keys.length > 12 && <span>+{keys.length - 12} earlier</span>}
          </div>
        )}

        {device && (
          <p className="fsk-link__muted">
            AudioContext {device.contextSampleRate} Hz · microphone{" "}
            {Number.isFinite(device.trackSampleRate) ? `${device.trackSampleRate} Hz` : "rate not reported"} ·
            analysis uses the same 6 ms-faded frames and decoder as the Node tests.
          </p>
        )}
      </Card>

      <Card title="How to run the two-phone test" subtitle="One receiver, one transmitter, same run ID.">
        <ol className="fsk-link__steps">
          <li>Put the phones 1 m apart, facing each other, in a quiet room. Set media volume around 50–70% on the transmitter.</li>
          <li>Tap <strong>Start listening</strong> here and allow microphone access. The microphone badge stays on while listening.</li>
          <li>On the other phone, open the transmitter page with the same run ID and send 10 frames.</li>
          <li>Stop listening, then copy both reports. Record the decoded count and decode rate in the measurements log.</li>
        </ol>
        <p className="fsk-link__warning">
          A decoded frame proves that sound crossed the gap and passed the checksum. It does not prove which
          student was present, and it is not an attendance record. A quiet control run with the transmitter off
          is useful evidence against false decodes.
        </p>
      </Card>

      <ReportCard
        title="Receiver report"
        subtitle="Pair this with the transmitter report using the same run ID."
        text={reportText}
        json={reportJson}
        filename={`rx-${normaliseRunId(runId) || "unset"}.json`}
        disabled={!hasRun}
      />
    </LinkShell>
  );
};

export default AcousticReceive;
