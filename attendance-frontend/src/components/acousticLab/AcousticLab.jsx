import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./acousticLab.css";

const TEST_FREQUENCIES = [15500, 16500, 17500, 18500, 19500];
const WINDOW_SIZE = 4096;
const TONE_DURATION_MS = 700;
const SETTLE_DURATION_MS = 250;

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const formatFrequency = (frequency) => `${(frequency / 1000).toFixed(1)} kHz`;

const getVerdict = (margin) => {
  if (margin >= 12) return { label: "strong", detail: "Clear local detection" };
  if (margin >= 6) return { label: "tentative", detail: "Usable only for further testing" };
  return { label: "weak", detail: "No reliable local detection" };
};

const AcousticLab = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [ambient, setAmbient] = useState({});
  const [results, setResults] = useState([]);

  const audioRef = useRef(null);
  const activeTestRef = useRef(null);
  const ambientRef = useRef({});

  const stopLab = useCallback(async () => {
    const audio = audioRef.current;
    audioRef.current = null;
    activeTestRef.current = null;

    if (!audio) return;
    try {
      audio.oscillator?.stop();
      audio.source?.disconnect();
      audio.worklet?.disconnect();
      audio.silentSink?.disconnect();
      audio.stream.getTracks().forEach((track) => track.stop());
      await audio.context.close();
    } catch {
      // The microphone may already have been stopped by the browser.
    }
  }, []);

  useEffect(() => () => {
    stopLab();
  }, [stopLab]);

  const setupLab = async () => {
    setError("");
    setResults([]);
    setAmbient({});
    ambientRef.current = {};

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone testing requires localhost or HTTPS and a browser with microphone access.");
      return;
    }

    setPhase("setting-up");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      await context.resume();

      if (!context.audioWorklet) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close();
        throw new Error("This browser does not support AudioWorklet. Use a current Android Chrome build.");
      }

      await context.audioWorklet.addModule(`${process.env.PUBLIC_URL}/tone-detector-worklet.js`);

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "tone-detector", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const silentSink = context.createGain();
      silentSink.gain.value = 0;
      worklet.port.postMessage({
        type: "configure",
        frequencies: TEST_FREQUENCIES,
        windowSize: WINDOW_SIZE,
      });
      worklet.port.onmessage = ({ data }) => {
        if (data?.type !== "measurement") return;

        const activeTest = activeTestRef.current;
        if (activeTest) {
          const db = data.bins[activeTest.frequency];
          if (typeof db === "number") activeTest.peakDb = Math.max(activeTest.peakDb, db);
          return;
        }

        TEST_FREQUENCIES.forEach((frequency) => {
          const db = data.bins[frequency];
          if (typeof db === "number") {
            ambientRef.current[frequency] = Math.max(ambientRef.current[frequency] ?? -120, db);
          }
        });
      };

      source.connect(worklet);
      worklet.connect(silentSink);
      silentSink.connect(context.destination);
      audioRef.current = { context, source, worklet, silentSink, stream, oscillator: null };

      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
      setDeviceInfo({
        sampleRate: context.sampleRate,
        settings,
        disabledProcessing: {
          echoCancellation: settings.echoCancellation === false,
          noiseSuppression: settings.noiseSuppression === false,
          autoGainControl: settings.autoGainControl === false,
        },
        worklet: true,
        constraintSupport: {
          echoCancellation: Boolean(supported.echoCancellation),
          noiseSuppression: Boolean(supported.noiseSuppression),
          autoGainControl: Boolean(supported.autoGainControl),
        },
      });

      await wait(600);
      setAmbient({ ...ambientRef.current });
      setPhase("ready");
    } catch (setupError) {
      await stopLab();
      setPhase("idle");
      setError(setupError.message || "Microphone setup failed. Check browser permission and try again.");
    }
  };

  const runToneSweep = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setError("");
    setResults([]);
    setPhase("testing");

    const measurements = [];
    try {
      for (const frequency of TEST_FREQUENCIES) {
        const activeTest = { frequency, peakDb: -120 };
        activeTestRef.current = activeTest;
        await wait(SETTLE_DURATION_MS);

        const oscillator = audio.context.createOscillator();
        const gain = audio.context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        // Low output to keep calibration comfortable. This is not the final protocol volume.
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(audio.context.destination);
        audio.oscillator = oscillator;
        oscillator.start();
        await wait(TONE_DURATION_MS);
        oscillator.stop();
        oscillator.disconnect();
        gain.disconnect();
        audio.oscillator = null;

        await wait(SETTLE_DURATION_MS);
        activeTestRef.current = null;
        const baseline = ambientRef.current[frequency] ?? -120;
        const margin = activeTest.peakDb - baseline;
        measurements.push({ frequency, baseline, peakDb: activeTest.peakDb, margin, ...getVerdict(margin) });
      }
      setResults(measurements);
      setPhase("complete");
    } catch (testError) {
      activeTestRef.current = null;
      setPhase("ready");
      setError(testError.message || "Tone calibration stopped unexpectedly.");
    }
  };

  const resetLab = async () => {
    await stopLab();
    setDeviceInfo(null);
    setAmbient({});
    setResults([]);
    setPhase("idle");
  };

  const highBandHasSignal = results.some((result) => result.frequency >= 18500 && result.margin >= 12);
  const fallbackHasSignal = results.some((result) => result.frequency >= 15500 && result.frequency <= 17500 && result.margin >= 12);

  return (
    <main className="acoustic-lab">
      <header className="acoustic-lab__header">
        <div>
          <p className="acoustic-lab__eyebrow">Prototype · Layer 1</p>
          <h1>Acoustic capability check</h1>
          <p>This local calibration stores no identity or result, and it cannot mark attendance.</p>
        </div>
        <button className="acoustic-lab__back" type="button" onClick={() => navigate(-1)}>Back</button>
      </header>

      <section className="acoustic-lab__notice">
        <h2>Before you test</h2>
        <p>Use current Chrome on an Android phone, set media volume around 50%, keep the phone flat in a quiet room, and allow microphone access. The test plays five brief, low-volume high-frequency tones. Stop if any tone is uncomfortable. This page is intentionally shareable for prototype testing; it does not use sign-in or save a result.</p>
      </section>

      {error && <p className="acoustic-lab__error" role="alert">{error}</p>}

      <section className="acoustic-lab__controls">
        {phase === "idle" && <button type="button" onClick={setupLab}>Allow microphone &amp; inspect device</button>}
        {phase === "setting-up" && <button type="button" disabled>Preparing microphone…</button>}
        {phase === "ready" && <button type="button" onClick={runToneSweep}>Run local tone sweep</button>}
        {phase === "testing" && <button type="button" disabled>Testing tones…</button>}
        {phase === "complete" && <button type="button" onClick={runToneSweep}>Run again</button>}
        {(phase === "ready" || phase === "complete") && <button className="acoustic-lab__secondary" type="button" onClick={resetLab}>Stop microphone</button>}
      </section>

      {deviceInfo && (
        <section className="acoustic-lab__panel">
          <h2>Device report</h2>
          <dl className="acoustic-lab__device-grid">
            <div><dt>Audio sample rate</dt><dd>{deviceInfo.sampleRate} Hz</dd></div>
            <div><dt>AudioWorklet</dt><dd>{deviceInfo.worklet ? "Available" : "Unavailable"}</dd></div>
            <div><dt>Echo cancellation disabled</dt><dd>{deviceInfo.disabledProcessing.echoCancellation ? "Yes" : "Browser kept control"}</dd></div>
            <div><dt>Noise suppression disabled</dt><dd>{deviceInfo.disabledProcessing.noiseSuppression ? "Yes" : "Browser kept control"}</dd></div>
            <div><dt>Auto gain disabled</dt><dd>{deviceInfo.disabledProcessing.autoGainControl ? "Yes" : "Browser kept control"}</dd></div>
            <div><dt>Mic channel count</dt><dd>{deviceInfo.settings.channelCount || "Not reported"}</dd></div>
          </dl>
        </section>
      )}

      {Object.keys(ambient).length > 0 && phase !== "testing" && (
        <section className="acoustic-lab__panel">
          <h2>Ambient baseline</h2>
          <p>Local noise at each test frequency, recorded before any tone is played.</p>
          <div className="acoustic-lab__baseline">
            {TEST_FREQUENCIES.map((frequency) => <span key={frequency}>{formatFrequency(frequency)}: {(ambient[frequency] ?? -120).toFixed(1)} dB</span>)}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="acoustic-lab__panel">
          <h2>Local speaker → microphone results</h2>
          <p>These values prove only that this phone can emit and detect a tone at close range. They do not prove classroom range, resistance to replay, or attendance presence.</p>
          <div className="acoustic-lab__table-wrap">
            <table>
              <thead><tr><th>Frequency</th><th>Signal margin</th><th>Result</th></tr></thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.frequency}>
                    <td>{formatFrequency(result.frequency)}</td>
                    <td>{result.margin.toFixed(1)} dB</td>
                    <td><span className={`acoustic-lab__verdict acoustic-lab__verdict--${result.label}`}>{result.detail}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="acoustic-lab__recommendation">
            {highBandHasSignal && "Candidate for the 18–19.8 kHz experimental band: test next across separate phones in the classroom."}
            {!highBandHasSignal && fallbackHasSignal && "Use the 15–17 kHz fallback as the next test candidate; the higher band was not locally clear."}
            {!highBandHasSignal && !fallbackHasSignal && "This phone is not yet a candidate for the acoustic protocol. Record the browser/device and test another phone."}
          </p>
        </section>
      )}
    </main>
  );
};

export default AcousticLab;
