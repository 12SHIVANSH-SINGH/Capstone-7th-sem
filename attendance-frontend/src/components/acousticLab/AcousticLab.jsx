import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiClipboard, FiInfo, FiMic } from "react-icons/fi";
import Brand from "../../ui/Brand";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import {
  BASELINE_DURATION_MS,
  BASELINE_SETTLE_MS,
  DEFAULT_WINDOW_SIZE,
  PROBES,
  PROBE_FREQUENCIES,
  TONE_DURATION_MS,
  TONE_FADE_MS,
  TONE_GAP_MS,
  TONE_LEVEL,
  buildTonePlan,
  computeBaseline,
  computeTonePeak,
  dbToMeterPercent,
  evaluateContextSampleRate,
  evaluateSampleRateGate,
  formatLabReport,
  getVerdict,
  hasCompleteBaseline,
  mapMicError,
  summarizeSweep,
  toneEnvelopePoints,
  updatePeakHold,
} from "../../acoustic/labConfig";
import "./acousticLab.css";

const STATUS_TEXT = {
  idle: "No microphone connected.",
  "setting-up": "Opening the microphone and checking sample rates…",
  ready: "Baseline ready. Run the sweep; it recalibrates first.",
  calibrating: `Measuring the ambient baseline for about ${Math.round(BASELINE_DURATION_MS / 100) / 10} s…`,
  testing: "Playing seven faded tones and measuring them. Keep this page visible.",
  complete: "Sweep complete. Run again to recalibrate before the next sweep.",
};

const emptyLevels = () => Object.fromEntries(PROBES.map(({ frequency }) => [frequency, null]));

const emptyBars = () => ({ levels: emptyLevels(), peaks: emptyLevels() });

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const formatFrequency = (frequency) => `${Number((frequency / 1000).toFixed(2))} kHz`;

const formatDb = (value) => (Number.isFinite(value) ? `${value.toFixed(1)} dB` : "—");

const formatProcessing = (value) => {
  if (value === false) return "Off (requested)";
  if (value === true) return "On (browser kept control)";
  return "Not reported";
};

const fadeToneNodes = (engine) => {
  if (!engine?.context || engine.context.state === "closed") return;
  const now = engine.context.currentTime;

  for (const node of engine.nodes) {
    try {
      const gainParam = node.gain.gain;
      if (typeof gainParam.cancelAndHoldAtTime === "function") {
        gainParam.cancelAndHoldAtTime(now);
      } else {
        gainParam.cancelScheduledValues(now);
        gainParam.setValueAtTime(Math.max(0, gainParam.value), now);
      }
      gainParam.linearRampToValueAtTime(0, now + TONE_FADE_MS / 1000);
      node.oscillator.stop(now + TONE_FADE_MS / 1000 + 0.006);
    } catch {
      // The node may already have ended or been stopped.
    }
  }
};

// Engine teardown never touches React state: stopLab/unmount/visibility decide
// what the UI should show, while this function only releases audio resources.
const disposeEngine = (engine) => {
  if (!engine || engine.disposed) return;
  engine.disposed = true;
  engine.active = false;

  fadeToneNodes(engine);

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
    // The browser may already have stopped the tracks.
  }

  const context = engine.context;
  const closeContext = () => {
    if (!context || context.state === "closed") return;
    Promise.resolve(context.close()).catch(() => {});
  };

  if (engine.nodes.size > 0) {
    // Let the 6 ms cancellation fade reach the output. Output latency is
    // usually tens of milliseconds, so keep the context alive a little longer.
    const latencyMs = Number.isFinite(context?.outputLatency)
      ? Math.min(250, context.outputLatency * 1000)
      : 0;
    window.setTimeout(closeContext, Math.max(40, TONE_FADE_MS + 24 + latencyMs));
  } else {
    closeContext();
  }
};

const scheduleTone = (engine, entry) => {
  const context = engine.context;
  const points = toneEnvelopePoints(entry);
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(entry.frequency, points[0].time);
  gain.gain.setValueAtTime(points[0].value, points[0].time);
  gain.gain.linearRampToValueAtTime(points[1].value, points[1].time);
  gain.gain.setValueAtTime(points[2].value, points[2].time);
  gain.gain.linearRampToValueAtTime(points[3].value, points[3].time);

  oscillator.connect(gain);
  gain.connect(context.destination);

  const node = { oscillator, gain };
  engine.nodes.add(node);
  oscillator.onended = () => {
    engine.nodes.delete(node);
    try {
      oscillator.disconnect();
    } catch {
      // Already disconnected.
    }
    try {
      gain.disconnect();
    } catch {
      // Already disconnected.
    }
  };

  oscillator.start(points[0].time);
  oscillator.stop(entry.stopTime);
};

const AcousticLab = () => {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [bars, setBars] = useState(emptyBars);
  const [copyState, setCopyState] = useState("idle");
  const [showCopyFallback, setShowCopyFallback] = useState(false);

  const audioRef = useRef(null);
  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const setupInFlightRef = useRef(false);
  const activeSweepRef = useRef(null);
  const baselineCollectorRef = useRef(null);
  const liveRef = useRef({ ...emptyBars(), active: false });
  const phaseRef = useRef("idle");
  const deviceWarningRef = useRef("");
  const copyTimerRef = useRef(null);
  const copyFallbackRef = useRef(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const resetLive = useCallback(() => {
    liveRef.current = { ...emptyBars(), active: false };
    setBars(emptyBars());
  }, []);

  // The worklet may post ~12 messages per second. The refs absorb every
  // message and only this 10 Hz timer touches React state for the bars.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const live = liveRef.current;
      if (!live.active) return;
      setBars({ levels: { ...live.levels }, peaks: { ...live.peaks } });
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      runningRef.current = false;
      setupInFlightRef.current = false;
      activeSweepRef.current = null;
      baselineCollectorRef.current = null;
      const engine = audioRef.current;
      audioRef.current = null;
      disposeEngine(engine);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const active =
        runningRef.current ||
        setupInFlightRef.current ||
        phaseRef.current === "setting-up" ||
        phaseRef.current === "calibrating" ||
        phaseRef.current === "testing";
      if (!active) return;

      sessionRef.current += 1;
      runningRef.current = false;
      setupInFlightRef.current = false;
      activeSweepRef.current = null;
      baselineCollectorRef.current = null;
      deviceWarningRef.current = "";
      const engine = audioRef.current;
      audioRef.current = null;
      disposeEngine(engine);

      liveRef.current = { ...emptyBars(), active: false };
      setBars(emptyBars());
      phaseRef.current = "idle";
      setPhase("idle");
      setDeviceInfo(null);
      setBaseline(null);
      setResults([]);
      setSummary(null);
      setWarning("");
      setShowCopyFallback(false);
      setCopyState("idle");
      setError(
        "The tab went to the background, so the sweep stopped and the microphone was released. Keep this page visible, then run the test again."
      );
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const collectBaseline = useCallback(async (session) => {
    await wait(BASELINE_SETTLE_MS);
    if (session !== sessionRef.current) return null;

    const values = Object.fromEntries(PROBE_FREQUENCIES.map((frequency) => [frequency, []]));
    baselineCollectorRef.current = { values };

    await wait(BASELINE_DURATION_MS);
    if (session !== sessionRef.current) {
      baselineCollectorRef.current = null;
      return null;
    }

    const collector = baselineCollectorRef.current;
    baselineCollectorRef.current = null;
    if (!collector) return null;

    const nextBaseline = {};
    for (const frequency of PROBE_FREQUENCIES) {
      nextBaseline[frequency] = computeBaseline(collector.values[frequency]);
    }
    return nextBaseline;
  }, []);

  const setupLab = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone testing requires localhost or HTTPS and a browser with microphone access.");
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setError("This browser does not expose the Web Audio API. Use a current Android Chrome build.");
      return;
    }
    if (runningRef.current || setupInFlightRef.current) return;

    const previous = audioRef.current;
    audioRef.current = null;
    disposeEngine(previous);

    setupInFlightRef.current = true;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    runningRef.current = false;
    activeSweepRef.current = null;
    baselineCollectorRef.current = null;
    deviceWarningRef.current = "";
    resetLive();
    setPhase("idle");
    setError("");
    setWarning("");
    setDeviceInfo(null);
    setBaseline(null);
    setResults([]);
    setSummary(null);
    setShowCopyFallback(false);
    setCopyState("idle");

    let context = null;
    let engine = null;

    try {
      // Create the context synchronously inside the click gesture, before
      // asking for the microphone, so the sample-rate gate is honest.
      context = new AudioContextClass();
      const contextGate = evaluateContextSampleRate(context.sampleRate);
      if (!contextGate.ok) {
        const message = contextGate.message;
        try {
          await context.close();
        } catch {
          // The context may already be closed.
        }
        context = null;
        if (session === sessionRef.current) {
          setPhase("idle");
          setError(message);
        }
        return;
      }

      setPhase("setting-up");

      if (context.state === "suspended") {
        await context.resume();
        if (session !== sessionRef.current) {
          try {
            await context.close();
          } catch {
            // The context may already be closed.
          }
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      engine = {
        context,
        stream,
        source: null,
        worklet: null,
        silentSink: null,
        nodes: new Set(),
        disposed: false,
      };

      if (session !== sessionRef.current) {
        disposeEngine(engine);
        return;
      }

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

      if (!context.audioWorklet || typeof AudioWorkletNode !== "function") {
        throw new Error("This browser does not support AudioWorklet. Use a current Android Chrome build.");
      }

      await context.audioWorklet.addModule(
        `${process.env.PUBLIC_URL}/tone-detector-worklet.js?v=2`
      );
      if (session !== sessionRef.current) {
        disposeEngine(engine);
        return;
      }

      engine.source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "tone-detector", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          frequencies: PROBE_FREQUENCIES,
          windowSize: DEFAULT_WINDOW_SIZE,
        },
      });
      const silentSink = context.createGain();
      silentSink.gain.value = 0;
      engine.worklet = worklet;
      engine.silentSink = silentSink;

      worklet.port.onmessage = ({ data }) => {
        if (!data || data.type !== "measurement") return;

        const live = liveRef.current;
        for (const { frequency } of PROBES) {
          const db = data.bins ? data.bins[frequency] : null;
          if (Number.isFinite(db)) {
            live.levels[frequency] = db;
            live.peaks[frequency] = updatePeakHold(live.peaks[frequency], db);
          } else {
            live.levels[frequency] = null;
          }
        }

        const collector = baselineCollectorRef.current;
        if (collector) {
          for (const frequency of PROBE_FREQUENCIES) {
            const db = data.bins ? data.bins[frequency] : null;
            if (Number.isFinite(db)) collector.values[frequency].push(db);
          }
        }

        const sweep = activeSweepRef.current;
        if (!sweep) return;
        if (
          !Number.isFinite(data.time) ||
          !Number.isFinite(data.windowSize) ||
          !Number.isFinite(data.sampleRate)
        ) {
          return;
        }

        // Attribute a window only when it sits fully inside the steady part of
        // a tone, so fades and gaps never leak into the tone peak.
        const windowStart = data.time - data.windowSize / data.sampleRate;
        for (const entry of sweep.plan) {
          const db = data.bins ? data.bins[entry.frequency] : null;
          if (!Number.isFinite(db)) continue;
          if (
            windowStart >= entry.startTime + entry.fadeMs / 1000 &&
            data.time <= entry.endTime - entry.fadeMs / 1000
          ) {
            sweep.windows[entry.frequency].push(db);
          }
        }
      };

      // processorOptions already configured the first window; the message
      // keeps the old configure path working too.
      worklet.port.postMessage({
        type: "configure",
        frequencies: PROBE_FREQUENCIES,
        windowSize: DEFAULT_WINDOW_SIZE,
      });

      engine.source.connect(worklet);
      worklet.connect(silentSink);
      silentSink.connect(context.destination);
      audioRef.current = engine;
      liveRef.current.active = true;

      const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
      const nextDeviceInfo = {
        contextSampleRate: context.sampleRate,
        trackSampleRate: Number.isFinite(settings.sampleRate) ? settings.sampleRate : null,
        trackRateReported: Number.isFinite(settings.sampleRate),
        processing: {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
        },
        channelCount: Number.isFinite(settings.channelCount) ? settings.channelCount : null,
        worklet: true,
        windowSize: DEFAULT_WINDOW_SIZE,
        constraintSupport: {
          echoCancellation: Boolean(supported.echoCancellation),
          noiseSuppression: Boolean(supported.noiseSuppression),
          autoGainControl: Boolean(supported.autoGainControl),
        },
        warning: gate.warning || null,
        userAgent: navigator.userAgent,
      };

      setDeviceInfo(nextDeviceInfo);
      deviceWarningRef.current = gate.warning || "";
      if (gate.warning) setWarning(gate.warning);

      setPhase("calibrating");
      const nextBaseline = await collectBaseline(session);
      if (session !== sessionRef.current) return;

      if (!nextBaseline) {
        setPhase("ready");
        setError("The ambient baseline did not finish. Keep this page visible and try again.");
        return;
      }

      setBaseline(nextBaseline);
      if (!hasCompleteBaseline(nextBaseline)) {
        setPhase("ready");
        setError(
          "At least one probe produced no usable baseline, so Run stays disabled. Keep the page visible, check the microphone route, and start again."
        );
        return;
      }

      setPhase("ready");
    } catch (setupError) {
      disposeEngine(engine);
      if (audioRef.current === engine) audioRef.current = null;
      if (!engine && context) {
        try {
          await context.close();
        } catch {
          // The context may already be closed.
        }
      }
      if (session !== sessionRef.current) return;

      liveRef.current = { ...emptyBars(), active: false };
      setBars(emptyBars());
      phaseRef.current = "idle";
      setPhase("idle");
      setDeviceInfo(null);
      setBaseline(null);
      setWarning("");
      setError(mapMicError(setupError));
    } finally {
      if (session === sessionRef.current) setupInFlightRef.current = false;
    }
  }, [collectBaseline, resetLive]);

  const runSweep = useCallback(async () => {
    const engine = audioRef.current;
    if (!engine || engine.disposed || runningRef.current) return;

    const session = sessionRef.current;
    runningRef.current = true;
    setError("");
    setWarning(deviceWarningRef.current);
    setResults([]);
    setSummary(null);
    setShowCopyFallback(false);
    setCopyState("idle");
    liveRef.current.peaks = emptyLevels();

    try {
      // Recalibrate before every sweep; the baseline is never reused from a
      // previous run.
      setPhase("calibrating");
      const nextBaseline = await collectBaseline(session);
      if (session !== sessionRef.current) return;

      if (!nextBaseline) {
        setPhase("ready");
        setError("The ambient baseline did not finish. Keep this page visible and try again.");
        return;
      }

      setBaseline(nextBaseline);
      if (!hasCompleteBaseline(nextBaseline)) {
        setPhase("ready");
        setError(
          "At least one probe produced no usable baseline, so the sweep was not started. Check the microphone route and run again."
        );
        return;
      }

      if (engine.context.state === "suspended") {
        await engine.context.resume();
        if (session !== sessionRef.current) return;
      }

      const plan = buildTonePlan(PROBE_FREQUENCIES, {
        startTime: engine.context.currentTime + 0.15,
        toneDurationMs: TONE_DURATION_MS,
        gapMs: TONE_GAP_MS,
        fadeMs: TONE_FADE_MS,
        level: TONE_LEVEL,
      });
      const windows = Object.fromEntries(
        PROBE_FREQUENCIES.map((frequency) => [frequency, []])
      );
      activeSweepRef.current = { plan, windows, session };

      for (const entry of plan) scheduleTone(engine, entry);
      setPhase("testing");

      const lastEntry = plan[plan.length - 1];
      const remainingMs = Math.max(
        0,
        (lastEntry.stopTime - engine.context.currentTime) * 1000
      ) + 80;
      await wait(remainingMs);
      if (session !== sessionRef.current) return;

      const sweep = activeSweepRef.current;
      activeSweepRef.current = null;
      const measurements = plan.map((entry) => {
        const probe = PROBES.find(({ frequency }) => frequency === entry.frequency);
        const peakDb = computeTonePeak(sweep?.windows[entry.frequency] || []);
        const baselineDb = nextBaseline[entry.frequency];
        const margin =
          Number.isFinite(peakDb) && Number.isFinite(baselineDb) ? peakDb - baselineDb : null;
        return {
          frequency: entry.frequency,
          band: probe?.band || "unknown",
          baseline: baselineDb,
          peakDb,
          margin,
          verdict: getVerdict(margin),
        };
      });

      const nextSummary = summarizeSweep(measurements);
      setResults(measurements);
      setSummary(nextSummary);
      if (measurements.some((result) => !Number.isFinite(result.peakDb))) {
        setWarning(
          "Some probes returned no usable measurement. Check that the page stayed in the foreground and the microphone was not in use."
        );
      }
      setPhase("complete");
    } catch (sweepError) {
      if (session !== sessionRef.current) return;
      activeSweepRef.current = null;
      fadeToneNodes(engine);
      setPhase("ready");
      setError(sweepError.message || "The tone sweep stopped unexpectedly.");
    } finally {
      runningRef.current = false;
    }
  }, [collectBaseline]);

  const stopLab = useCallback(() => {
    sessionRef.current += 1;
    runningRef.current = false;
    setupInFlightRef.current = false;
    activeSweepRef.current = null;
    baselineCollectorRef.current = null;
    deviceWarningRef.current = "";
    const engine = audioRef.current;
    audioRef.current = null;
    disposeEngine(engine);

    resetLive();
    phaseRef.current = "idle";
    setPhase("idle");
    setError("");
    setWarning("");
    setDeviceInfo(null);
    setBaseline(null);
    setResults([]);
    setSummary(null);
    setShowCopyFallback(false);
    setCopyState("idle");
  }, [resetLive]);

  const reportText = useMemo(
    () =>
      formatLabReport({
        generatedAt: new Date(),
        device: deviceInfo,
        baseline,
        results,
        summary,
      }),
    [deviceInfo, baseline, results, summary]
  );

  const copyReport = useCallback(async () => {
    setShowCopyFallback(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available.");
      await navigator.clipboard.writeText(reportText);
      setCopyState("copied");
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("fallback");
      setShowCopyFallback(true);
      window.setTimeout(() => {
        if (copyFallbackRef.current) {
          copyFallbackRef.current.focus();
          copyFallbackRef.current.select();
        }
      }, 0);
    }
  }, [reportText]);

  const baselineReady = hasCompleteBaseline(baseline);
  const sweepReady = phase === "ready" || phase === "complete";
  const sweepDisabled = !baselineReady || !sweepReady;
  const busy = phase === "setting-up" || phase === "calibrating" || phase === "testing";
  const phaseBadgeVariant =
    phase === "complete"
      ? "success"
      : phase === "testing" || phase === "calibrating"
        ? "info"
        : deviceInfo
          ? "primary"
          : "neutral";
  const sweepLabel =
    phase === "calibrating"
      ? "Calibrating baseline…"
      : phase === "testing"
        ? "Testing tones…"
        : phase === "complete"
          ? "Run again (recalibrates)"
          : "Run local tone sweep";

  return (
    <main className="acoustic-lab">
      <div className="acoustic-lab__shell">
        <div className="acoustic-lab__topbar">
          <Brand />
          <Link to="/" className="ui-btn ui-btn--secondary ui-btn--sm">
            Back to home
          </Link>
        </div>

        <header className="acoustic-lab__hero">
          <div>
            <p className="acoustic-lab__eyebrow">Prototype · Layer 1</p>
            <h1>Acoustic capability check</h1>
            <p>
              A local speaker-to-microphone self-test. It measures which high-frequency probes
              this phone can emit and hear at close range. It does not test classroom distance,
              replay resistance or attendance.
            </p>
          </div>
          <Badge variant={phaseBadgeVariant} dot>{phase === "idle" ? "Mic off" : phase.replace("-", " ")}</Badge>
        </header>

        <Card className="acoustic-lab__notice">
          <span className="acoustic-lab__notice-icon" aria-hidden="true"><FiInfo /></span>
          <div>
            <h2>Before you test</h2>
            <p>
              Use current Chrome on Android, set media volume around 50%, keep the phone flat in a
              quiet room, and allow microphone access. The lab refuses to start below 44.1 kHz so
              the high-band probes cannot silently alias. It plays seven brief, low-volume tones
              from 15.5 to 19.76 kHz; stop if any tone is uncomfortable. The tab must stay in the
              foreground, and nothing is uploaded or saved.
            </p>
          </div>
        </Card>

        <Card
          title="Two-phone link test"
          subtitle="The next slice: one phone transmits FSK frames, the other listens and decodes them."
        >
          <div className="acoustic-lab__actions">
            <Link to="/acoustic-tx" className="ui-btn ui-btn--primary">
              Open transmitter (TX)
            </Link>
            <Link to="/acoustic-rx" className="ui-btn ui-btn--secondary">
              Open receiver (RX)
            </Link>
          </div>
          <p className="acoustic-lab__bars-note">
            Both pages work without an account, share a run ID, and produce a report you can copy.
            They measure the acoustic link only; they never mark attendance.
          </p>
        </Card>

        {error && (
          <div className="acoustic-lab__alert acoustic-lab__alert--error" role="alert">
            <FiInfo aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}
        {warning && (
          <div className="acoustic-lab__alert acoustic-lab__alert--warning" role="status">
            <FiInfo aria-hidden="true" />
            <p>{warning}</p>
          </div>
        )}

        <Card
          title="Test controls"
          subtitle="The sweep recalibrates the ambient baseline before every run."
          actions={<Badge variant={phaseBadgeVariant}>{STATUS_TEXT[phase] ? phase.replace("-", " ") : "idle"}</Badge>}
        >
          <div className="acoustic-lab__actions">
            {!deviceInfo && (
              <Button
                onClick={setupLab}
                loading={phase === "setting-up"}
                disabled={phase === "setting-up"}
              >
                Allow microphone &amp; inspect device
              </Button>
            )}
            {deviceInfo && (
              <Button
                onClick={runSweep}
                loading={phase === "calibrating" || phase === "testing"}
                disabled={sweepDisabled}
              >
                {sweepLabel}
              </Button>
            )}
            {(deviceInfo || phase === "setting-up" || busy) && (
              <Button variant="secondary" onClick={stopLab} disabled={false}>
                {phase === "setting-up" ? "Cancel setup" : "Stop microphone"}
              </Button>
            )}
          </div>
          <p className="acoustic-lab__status" aria-live="polite">{STATUS_TEXT[phase]}</p>
          {deviceInfo && phase === "ready" && !baselineReady && (
            <p className="acoustic-lab__inline-warning" role="status">
              Run stays disabled until all seven probes have a valid baseline.
            </p>
          )}
        </Card>

        {!deviceInfo && (
          <Card>
            <EmptyState
              icon={<FiMic />}
              title="Waiting for microphone access"
              text="The lab opens audio only after you tap the button above. It checks the sample rate first, then measures a quiet baseline before any tone is played."
            />
          </Card>
        )}

        {deviceInfo && (
          <Card
            title="Device report"
            subtitle="Settings the browser reported for this run. Applied processing can differ from what was requested."
          >
            <dl className="acoustic-lab__device-grid">
              <div>
                <dt>AudioContext rate</dt>
                <dd>{deviceInfo.contextSampleRate} Hz</dd>
              </div>
              <div>
                <dt>Microphone rate</dt>
                <dd>
                  {deviceInfo.trackRateReported
                    ? `${deviceInfo.trackSampleRate} Hz`
                    : "Not reported (see warning)"}
                </dd>
              </div>
              <div>
                <dt>Echo cancellation</dt>
                <dd>{formatProcessing(deviceInfo.processing.echoCancellation)}</dd>
              </div>
              <div>
                <dt>Noise suppression</dt>
                <dd>{formatProcessing(deviceInfo.processing.noiseSuppression)}</dd>
              </div>
              <div>
                <dt>Auto gain control</dt>
                <dd>{formatProcessing(deviceInfo.processing.autoGainControl)}</dd>
              </div>
              <div>
                <dt>Microphone channels</dt>
                <dd>{deviceInfo.channelCount ?? "Not reported"}</dd>
              </div>
              <div>
                <dt>AudioWorklet</dt>
                <dd>{deviceInfo.worklet ? "Available" : "Unavailable"}</dd>
              </div>
              <div>
                <dt>Analysis window</dt>
                <dd>{deviceInfo.windowSize} samples</dd>
              </div>
            </dl>
          </Card>
        )}

        {deviceInfo && (
          <Card
            title="Live probe levels"
            subtitle="Current level, ambient baseline tick and peak hold. Bars refresh about 10 times per second."
            actions={<Badge variant={phaseBadgeVariant}>{phase.replace("-", " ")}</Badge>}
          >
            <div className="acoustic-lab__bars">
              {PROBES.map((probe) => {
                const level = bars.levels[probe.frequency];
                const peak = bars.peaks[probe.frequency];
                const baselineDb = baseline?.[probe.frequency];
                const levelPercent = dbToMeterPercent(level);
                const peakPercent = dbToMeterPercent(peak);
                const baselinePercent = dbToMeterPercent(baselineDb);
                return (
                  <div className="acoustic-lab__bar" key={probe.frequency}>
                    <div className="acoustic-lab__bar-head">
                      <strong>{formatFrequency(probe.frequency)}</strong>
                      <span className={`acoustic-lab__band acoustic-lab__band--${probe.band}`}>
                        {probe.band === "codec-edge" ? "codec edge" : "coarse"}
                      </span>
                    </div>
                    <div className="acoustic-lab__track" aria-hidden="true">
                      {levelPercent != null && (
                        <span
                          className="acoustic-lab__fill"
                          style={{ width: `${levelPercent}%` }}
                        />
                      )}
                      {baselinePercent != null && (
                        <span
                          className="acoustic-lab__tick acoustic-lab__tick--baseline"
                          style={{ left: `${baselinePercent}%` }}
                        />
                      )}
                      {peakPercent != null && (
                        <span
                          className="acoustic-lab__tick acoustic-lab__tick--peak"
                          style={{ left: `${peakPercent}%` }}
                        />
                      )}
                    </div>
                    <div className="acoustic-lab__bar-values">
                      <span>Now {formatDb(level)}</span>
                      <span>Base {formatDb(baselineDb)}</span>
                      <span>Peak {formatDb(peak)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="acoustic-lab__bars-note">
              Missing data is shown as “—” rather than a fake −120 dB. The baseline tick is the
              median ambient level; the peak tick holds the loudest window seen.
            </p>
          </Card>
        )}

        {baselineReady && (
          <Card
            title="Ambient baseline"
            subtitle={`Median of ${Math.round(BASELINE_DURATION_MS / 1000 * 10) / 10} s of settled windows, updated before every sweep.`}
          >
            <div className="acoustic-lab__baseline">
              {PROBES.map((probe) => (
                <span key={probe.frequency}>
                  <strong>{formatFrequency(probe.frequency)}</strong>
                  {formatDb(baseline[probe.frequency])}
                  <em>{probe.band === "codec-edge" ? "codec edge" : "coarse"}</em>
                </span>
              ))}
            </div>
          </Card>
        )}

        {results.length > 0 && summary && (
          <Card
            title="Local speaker → microphone results"
            subtitle="These values only show what this phone emitted and heard at close range. They do not prove classroom range or presence."
          >
            <div className="acoustic-lab__table-wrap">
              <table className="acoustic-lab__table">
                <thead>
                  <tr>
                    <th scope="col">Probe</th>
                    <th scope="col">Band</th>
                    <th scope="col">Baseline</th>
                    <th scope="col">Peak</th>
                    <th scope="col">Margin</th>
                    <th scope="col">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.frequency}>
                      <td>{formatFrequency(result.frequency)}</td>
                      <td>
                        <Badge variant={result.band === "codec-edge" ? "info" : "neutral"}>
                          {result.band === "codec-edge" ? "codec edge" : "coarse"}
                        </Badge>
                      </td>
                      <td>{formatDb(result.baseline)}</td>
                      <td>{formatDb(result.peakDb)}</td>
                      <td>{formatDb(result.margin)}</td>
                      <td>
                        <Badge variant={result.verdict.variant}>{result.verdict.label}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="acoustic-lab__recommendation">
              <div className="acoustic-lab__recommendation-head">
                <h3>Recommendation</h3>
                <Badge variant={summary.variant}>{summary.label}</Badge>
              </div>
              <p className="acoustic-lab__recommendation-headline">{summary.headline}</p>
              <p>{summary.detail}</p>
            </div>
          </Card>
        )}

        {deviceInfo && (
          <Card
            title="Copy report"
            subtitle="A plain-text summary of this device and run. Nothing is uploaded or saved by the lab."
            actions={
              <Button variant="secondary" size="sm" onClick={copyReport}>
                <FiClipboard aria-hidden="true" />
                {copyState === "copied" ? "Copied" : "Copy report"}
              </Button>
            }
          >
            {copyState === "copied" && (
              <p className="acoustic-lab__copy-status" role="status">Report copied to the clipboard.</p>
            )}
            {showCopyFallback && (
              <div className="acoustic-lab__copy-fallback">
                <p>
                  Clipboard access was blocked. Select the report below and copy it manually.
                </p>
                <textarea
                  ref={copyFallbackRef}
                  readOnly
                  value={reportText}
                  aria-label="Acoustic lab report"
                />
              </div>
            )}
            {!showCopyFallback && copyState !== "copied" && (
              <p className="acoustic-lab__copy-hint">
                Includes the device report, ambient baseline, probe measurements and the
                recommendation. A textarea fallback appears if the clipboard is unavailable.
              </p>
            )}
          </Card>
        )}

        <footer className="acoustic-lab__footer">
          <span>Bio Attend · Layer 1 acoustic lab</span>
          <span>No sign-in · no stored result · no attendance claim</span>
        </footer>
      </div>
    </main>
  );
};

export default AcousticLab;
