import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCopy, FiPlay, FiRefreshCw, FiSquare } from "react-icons/fi";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import {
  MAX_KEY_VALUE,
  buildTransmissionPlan,
  buildTxReportJson,
  countStartedFrames,
  formatTxReport,
  generateRunId,
  normaliseRunId,
  readTransmitKey,
  validateAmplitude,
  validateGapMs,
  validateKey,
  validateRepeats,
  validateRunId,
} from "../../acoustic/transmitPlan";
import {
  SYMBOL_COUNT,
  SYMBOL_DURATION_MS,
  encodeFrame,
  valueToDigits,
} from "../../acoustic/fsk";
import { evaluateContextSampleRate } from "../../acoustic/labConfig";
import LinkShell from "./LinkShell";
import ReportCard from "./ReportCard";
import {
  copyText,
  formatClock,
  initialRunId,
  linkFor,
  releaseWakeLock,
  requestWakeLock,
} from "./linkUtils";
import "./fskLink.css";

const randomKey = () => Math.floor(Math.random() * (MAX_KEY_VALUE + 1));

const readInitialKey = () => {
  if (typeof window === "undefined") return null;
  return readTransmitKey(window.location.search);
};

const launchedFromCheckIn = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("from") === "checkin";
};

const disposeTx = (engine) => {
  if (!engine || engine.disposed) return;
  engine.disposed = true;

  try {
    const now = engine.context.currentTime;
    const gain = engine.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + 0.006);
    engine.source.stop(now + 0.012);
  } catch {
    // Source may already have ended.
  }

  try {
    engine.source.disconnect();
  } catch {
    // Already disconnected.
  }
  try {
    engine.master.disconnect();
  } catch {
    // Already disconnected.
  }

  const context = engine.context;
  if (!context) return;
  window.setTimeout(() => {
    if (context.state !== "closed") context.close().catch(() => {});
  }, 60);
};

const AcousticTransmit = () => {
  const [runId, setRunId] = useState(() => initialRunId() || generateRunId());
  const [key, setKey] = useState(() => {
    const prefill = readInitialKey();
    return prefill === null ? randomKey() : prefill;
  });
  const [repeats, setRepeats] = useState(10);
  const [gapMs, setGapMs] = useState(450);
  const [amplitude, setAmplitude] = useState(0.5);
  const [phase, setPhase] = useState("idle");
  const [plan, setPlan] = useState(null);
  const [played, setPlayed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [device, setDevice] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() =>
    readInitialKey() !== null && launchedFromCheckIn()
      ? "Session key loaded from the check-in screen. Start the transmitter when students are ready."
      : ""
  );
  const [conditions, setConditions] = useState({ distance: "1 m", room: "", notes: "" });

  const engineRef = useRef(null);
  const sessionRef = useRef(0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const runningRef = useRef(false);
  const wakeLockRef = useRef(null);
  const planRef = useRef(null);

  const previewPlan = useMemo(() => {
    try {
      return buildTransmissionPlan({ key: Number(key), repeats: Number(repeats), gapMs: Number(gapMs) });
    } catch {
      return null;
    }
  }, [key, repeats, gapMs]);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const disposeCurrent = useCallback(() => {
    clearTimer();
    const engine = engineRef.current;
    engineRef.current = null;
    disposeTx(engine);
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

  const finish = useCallback((reason = "complete") => {
    clearTimer();
    runningRef.current = false;
    const activePlan = planRef.current;
    setPhase(reason);
    setPlayed((current) => (reason === "complete" ? activePlan?.repeats ?? current : current));
    setElapsedMs((current) => (reason === "complete" ? activePlan?.totalDurationMs ?? current : current));
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    releaseWakeLock(lock);
  }, []);

  const startTransmission = async () => {
    if (runningRef.current) return;
    setError("");
    setNotice("");

    const keyValue = Number(key);
    const repeatValue = Number(repeats);
    const gapValue = Number(gapMs);
    const amplitudeValue = Number(amplitude);
    const id = normaliseRunId(runId);

    if (!validateRunId(id)) {
      setError("Run ID must be 4-12 characters using letters and digits (no O, I, 0 or 1).");
      return;
    }
    if (!validateKey(keyValue)) {
      setError(`Key must be a whole number from 0 to ${MAX_KEY_VALUE}.`);
      return;
    }
    if (!validateRepeats(repeatValue)) {
      setError("Repeats must be a whole number from 1 to 100.");
      return;
    }
    if (!validateGapMs(gapValue)) {
      setError("Gap must be between 100 and 5000 ms.");
      return;
    }
    if (!validateAmplitude(amplitudeValue)) {
      setError("Amplitude must be between 0.05 and 1.0.");
      return;
    }

    let nextPlan;
    try {
      nextPlan = buildTransmissionPlan({ key: keyValue, repeats: repeatValue, gapMs: gapValue });
    } catch (planError) {
      setError(planError.message);
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
    setPhase("preparing");
    setPlan(null);
    planRef.current = null;
    setPlayed(0);
    setElapsedMs(0);
    setStartedAt(null);

    let context = null;
    let source = null;
    let master = null;

    try {
      context = new AudioContextClass();
      const gate = evaluateContextSampleRate(context.sampleRate);
      if (!gate.ok) {
        await context.close().catch(() => {});
        context = null;
        if (session === sessionRef.current) {
          runningRef.current = false;
          setPhase("idle");
          setError(gate.message);
        }
        return;
      }

      if (context.state === "suspended") await context.resume();
      if (session !== sessionRef.current) {
        await context.close().catch(() => {});
        return;
      }

      const frame = encodeFrame(valueToDigits(keyValue), context.sampleRate, {
        amplitude: amplitudeValue,
      });
      const gapSamples = Math.round((context.sampleRate * gapValue) / 1000);
      const totalSamples =
        frame.samples.length * repeatValue + gapSamples * Math.max(0, repeatValue - 1);
      const audioBuffer = context.createBuffer(1, totalSamples, context.sampleRate);
      for (let index = 0; index < repeatValue; index += 1) {
        audioBuffer.copyToChannel(
          frame.samples,
          0,
          index * (frame.samples.length + gapSamples)
        );
      }

      source = context.createBufferSource();
      source.buffer = audioBuffer;
      master = context.createGain();
      master.gain.value = 1;
      source.connect(master);
      master.connect(context.destination);

      const engine = { context, source, master, disposed: false };
      engineRef.current = engine;
      setDevice({
        role: "tx",
        contextSampleRate: context.sampleRate,
        userAgent: navigator.userAgent,
      });

      const startAt = context.currentTime + 0.15;
      startTimeRef.current = startAt;
      source.onended = () => {
        if (engine.disposed || session !== sessionRef.current) return;
        finish("complete");
        disposeTx(engine);
        if (engineRef.current === engine) engineRef.current = null;
      };
      source.start(startAt);

      setPlan(nextPlan);
      planRef.current = nextPlan;
      setStartedAt(new Date());
      setPhase("playing");
      wakeLockRef.current = await requestWakeLock();
      if (session !== sessionRef.current) return;

      timerRef.current = window.setInterval(() => {
        if (session !== sessionRef.current) return;
        const elapsed = Math.max(0, (context.currentTime - startTimeRef.current) * 1000);
        setElapsedMs(Math.min(nextPlan.totalDurationMs, elapsed));
        setPlayed(countStartedFrames(nextPlan, elapsed));
        if (elapsed >= nextPlan.totalDurationMs + 80) {
          finish("complete");
        }
      }, 100);
    } catch (startError) {
      if (session !== sessionRef.current) return;
      disposeTx({ context, source, master, disposed: false });
      engineRef.current = null;
      runningRef.current = false;
      planRef.current = null;
      setPhase("idle");
      setDevice(null);
      setError(startError.message || "The transmitter could not start.");
    }
  };

  const stopTransmission = () => {
    if (!runningRef.current && phase !== "playing") return;
    sessionRef.current += 1;
    const engine = engineRef.current;
    const activePlan = planRef.current;
    if (engine) {
      const elapsed = Math.max(0, (engine.context.currentTime - startTimeRef.current) * 1000);
      setElapsedMs(Math.min(activePlan?.totalDurationMs ?? elapsed, elapsed));
      setPlayed(activePlan ? countStartedFrames(activePlan, elapsed) : played);
    }
    runningRef.current = false;
    clearTimer();
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    releaseWakeLock(lock);
    engineRef.current = null;
    disposeTx(engine);
    setPhase("stopped");
  };

  const copyReceiverLink = async () => {
    const copied = await copyText(linkFor("/acoustic-rx", runId, conditions));
    setNotice(copied ? "Receiver link copied with the run ID and conditions. Open it on the other phone." : "Could not copy the link; type the run ID and conditions on the other phone.");
  };

  const reportText = useMemo(
    () =>
      formatTxReport({
        generatedAt: new Date(),
        device,
        runId,
        plan,
        played,
        amplitude,
        distance: conditions.distance,
        room: conditions.room,
        notes: conditions.notes,
      }),
    [amplitude, conditions, device, plan, played, runId]
  );

  const reportJson = useMemo(
    () =>
      buildTxReportJson({
        device,
        runId,
        plan,
        played,
        amplitude,
        distance: conditions.distance,
        room: conditions.room,
        notes: conditions.notes,
      }),
    [amplitude, conditions, device, plan, played, runId]
  );

  const phaseBadge =
    phase === "playing" ? "info" : phase === "complete" ? "success" : phase === "stopped" ? "warning" : "neutral";
  const busy = phase === "preparing" || phase === "playing";
  const canStart = !busy && previewPlan && validateRunId(runId);
  const frameDurationSeconds = (SYMBOL_COUNT * SYMBOL_DURATION_MS) / 1000;
  const fromCheckIn = launchedFromCheckIn();

  return (
    <LinkShell
      eyebrow="Layer 1 · transmitter"
      title="Send acoustic frames"
      description="This phone plays repeated FSK frames through its speaker. Keep the receiver phone listening nearby, then compare the two reports by run ID. The transmitter cannot hear or verify the receiver."
      status={<Badge variant={phaseBadge} dot>{phase}</Badge>}
      backLink={fromCheckIn ? { to: "/teacher/check-in", label: "Back to check-in" } : null}
      actions={
        <Button variant="secondary" onClick={copyReceiverLink}>
          <FiCopy aria-hidden="true" /> Copy receiver link
        </Button>
      }
    >
      {notice && <div className="fsk-link__alert fsk-link__alert--success" role="status">{notice}</div>}
      {error && <div className="fsk-link__alert fsk-link__alert--error" role="alert">{error}</div>}

      <div className="fsk-link__grid">
        <Card title="Transmission" subtitle="Start the receiver first, then transmit one run.">
          <div className="fsk-link__form">
            <Field
              label="Run ID"
              htmlFor="tx-run"
              hint="Use the same ID on both phones. It pairs the reports; it is not a secret."
            >
              <div className="fsk-link__inline">
                <input
                  id="tx-run"
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
                  <FiRefreshCw aria-hidden="true" /> New
                </Button>
              </div>
            </Field>

            <div className="fsk-link__form-row">
              <Field label="Frame key" htmlFor="tx-key" hint={`0 to ${MAX_KEY_VALUE}`}>
                <div className="fsk-link__inline">
                  <input
                    id="tx-key"
                    className="ui-input"
                    type="number"
                    min={0}
                    max={MAX_KEY_VALUE}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    disabled={busy}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setKey(randomKey())}
                    disabled={busy}
                  >
                    Random
                  </Button>
                </div>
              </Field>

              <Field label="Frames to send" htmlFor="tx-repeats">
                <input
                  id="tx-repeats"
                  className="ui-input"
                  type="number"
                  min={1}
                  max={100}
                  value={repeats}
                  onChange={(event) => setRepeats(event.target.value)}
                  disabled={busy}
                />
              </Field>
            </div>

            <div className="fsk-link__form-row">
              <Field label="Gap between frames (ms)" htmlFor="tx-gap">
                <input
                  id="tx-gap"
                  className="ui-input"
                  type="number"
                  min={100}
                  max={5000}
                  step={50}
                  value={gapMs}
                  onChange={(event) => setGapMs(event.target.value)}
                  disabled={busy}
                />
              </Field>

              <Field
                label={`Amplitude ${(Number(amplitude) * 100).toFixed(0)}%`}
                htmlFor="tx-amplitude"
                hint="Phone media volume also matters. Start around 50% and adjust."
              >
                <input
                  id="tx-amplitude"
                  className="fsk-link__range"
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={amplitude}
                  onChange={(event) => setAmplitude(event.target.value)}
                  disabled={busy}
                />
              </Field>
            </div>

            <div className="fsk-link__actions">
              <Button onClick={startTransmission} disabled={!canStart} loading={phase === "preparing"}>
                <FiPlay aria-hidden="true" />
                {phase === "complete" || phase === "stopped" ? "Transmit again" : "Start transmitting"}
              </Button>
              <Button variant="secondary" onClick={stopTransmission} disabled={!busy}>
                <FiSquare aria-hidden="true" /> Stop
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Run conditions" subtitle="Recorded in both reports. Distance and room are free text.">
          <div className="fsk-link__form">
            <Field label="Distance" htmlFor="tx-distance">
              <input
                id="tx-distance"
                className="ui-input"
                value={conditions.distance}
                onChange={(event) => setConditions((current) => ({ ...current, distance: event.target.value }))}
                placeholder="1 m"
              />
            </Field>
            <Field label="Room" htmlFor="tx-room">
              <input
                id="tx-room"
                className="ui-input"
                value={conditions.room}
                onChange={(event) => setConditions((current) => ({ ...current, room: event.target.value }))}
                placeholder="B-204"
              />
            </Field>
            <Field label="Notes" htmlFor="tx-notes">
              <textarea
                id="tx-notes"
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

      <Card title="Live counters" subtitle="What this phone has scheduled, not what the other phone heard.">
        <div className="fsk-link__stats">
          <div><span>Planned</span><strong>{plan?.repeats ?? previewPlan?.repeats ?? "—"}</strong></div>
          <div><span>Played</span><strong>{played}</strong></div>
          <div><span>Elapsed</span><strong>{formatClock(elapsedMs)}</strong></div>
          <div><span>Frame length</span><strong>{frameDurationSeconds.toFixed(2)} s</strong></div>
          <div><span>Total plan</span><strong>{plan ? formatClock(plan.totalDurationMs) : previewPlan ? formatClock(previewPlan.totalDurationMs) : "—"}</strong></div>
        </div>
        {device && (
          <p className="fsk-link__muted">
            AudioContext {device.contextSampleRate} Hz · {device.contextSampleRate >= 44100 ? "passes" : "fails"} the 44.1 kHz gate ·
            symbol {SYMBOL_DURATION_MS} ms · {SYMBOL_COUNT} symbols per frame
          </p>
        )}
        {startedAt && <p className="fsk-link__muted">Started {startedAt.toLocaleTimeString()}.</p>}
      </Card>

      <Card title="How to run the two-phone test" subtitle="This is the Layer 1 link test, not attendance.">
        <ol className="fsk-link__steps">
          <li>Open the receiver page on the other phone with the same run ID, then tap <strong>Start listening</strong> and allow the microphone.</li>
          <li>Put the phones 1 m apart, facing each other, in a quiet room. Keep both screens on.</li>
          <li>Tap <strong>Start transmitting</strong> here. Ten frames take about {(10 * frameDurationSeconds + 9 * 0.45).toFixed(1)} s.</li>
          <li>Read the receiver's decoded count, then copy both reports and record the result. A frame is evidence of sound, not presence.</li>
        </ol>
        <p className="fsk-link__warning">
          The 18–19.8 kHz band is near ultrasound: children and some adults may hear it. Keep volume moderate,
          use short runs, and stop if anyone finds it uncomfortable. Do not point the speaker directly into an ear.
        </p>
      </Card>

      <ReportCard
        title="Transmitter report"
        subtitle="Pair this with the receiver report using the same run ID."
        text={reportText}
        json={reportJson}
        filename={`tx-${normaliseRunId(runId) || "unset"}.json`}
        disabled={!plan}
      />
    </LinkShell>
  );
};

export default AcousticTransmit;
