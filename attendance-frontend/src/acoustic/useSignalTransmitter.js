import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildTransmissionPlan,
  countStartedFrames,
  validateAmplitude,
  validateGapMs,
  validateKey,
  validateRepeats,
} from "./transmitPlan";
import { encodeFrame, valueToDigits } from "./fsk";
import { evaluateContextSampleRate } from "./labConfig";
import { releaseWakeLock, requestWakeLock } from "../components/acousticLab/linkUtils";

/**
 * The server-minted signal player used by both sides of the cascade.
 *
 * The teacher plays round 0 and the manual nudge; a student echoes the next
 * signal once a proof is accepted. This is the AcousticTransmit scheduling path
 * without the lab form or report: one reusable AudioContext, a buffer source
 * per transmission, and a running-context guard so a late completion cannot
 * touch a newer playback.
 *
 * `prime()` is deliberately synchronous. Mobile Safari/Chrome only unlock audio
 * inside the gesture that created it, so callers must invoke it in the click
 * handler before awaiting the start/proof request.
 */

const DEFAULT_REPEATS = 3;
const DEFAULT_GAP_MS = 450;
const DEFAULT_AMPLITUDE = 0.5;
const START_DELAY_SECONDS = 0.12;

const stopSource = (engine) => {
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
    // The source may already have ended.
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
};

const closeContext = (context) => {
  if (!context || context.state === "closed") return;
  context.close().catch(() => {});
};

export const useSignalTransmitter = ({ onComplete } = {}) => {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [played, setPlayed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const contextRef = useRef(null);
  const engineRef = useRef(null);
  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const planRef = useRef(null);
  const wakeLockRef = useRef(null);
  const settleRef = useRef(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const settle = useCallback((completed) => {
    const resolve = settleRef.current;
    settleRef.current = null;
    if (resolve) resolve(completed);
  }, []);

  const finish = useCallback(
    (reason = "complete") => {
      clearTimer();
      runningRef.current = false;
      const activePlan = planRef.current;
      if (reason === "complete") {
        setPhase("complete");
        setPlayed(activePlan?.repeats ?? 0);
        setElapsedMs(activePlan?.totalDurationMs ?? 0);
      } else {
        setPhase(reason);
      }
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      releaseWakeLock(lock);
      settle(reason === "complete");
      if (reason === "complete") onCompleteRef.current?.();
    },
    [clearTimer, settle]
  );

  const releaseEngine = useCallback(() => {
    const engine = engineRef.current;
    engineRef.current = null;
    stopSource(engine);
  }, []);

  const stop = useCallback(() => {
    if (!runningRef.current) {
      releaseEngine();
      return;
    }
    sessionRef.current += 1;
    runningRef.current = false;
    clearTimer();
    releaseEngine();
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    releaseWakeLock(lock);
    setPhase("stopped");
    settle(false);
  }, [clearTimer, releaseEngine, settle]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden" || !runningRef.current) return;
      stop();
      setError("The tab went to the background, so the signal stopped. Keep this page visible.");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [stop]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      runningRef.current = false;
      clearTimer();
      releaseEngine();
      releaseWakeLock(wakeLockRef.current);
      wakeLockRef.current = null;
      settle(false);
      closeContext(contextRef.current);
      contextRef.current = null;
    },
    [clearTimer, releaseEngine, settle]
  );

  const prime = useCallback(() => {
    if (typeof window === "undefined") return false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setError("This browser does not expose the Web Audio API. Use current Chrome on Android.");
      setPhase("error");
      return false;
    }

    let context = contextRef.current;
    if (!context || context.state === "closed") {
      context = new AudioContextClass();
      const gate = evaluateContextSampleRate(context.sampleRate);
      if (!gate.ok) {
        closeContext(context);
        setError(gate.message);
        setPhase("error");
        return false;
      }
      contextRef.current = context;
    }

    if (context.state === "suspended") {
      // Called inside the user gesture; do not await before the server request.
      context.resume().catch(() => {});
    }
    return true;
  }, []);

  const play = useCallback(
    async ({
      key,
      repeats = DEFAULT_REPEATS,
      gapMs = DEFAULT_GAP_MS,
      amplitude = DEFAULT_AMPLITUDE,
    } = {}) => {
      if (runningRef.current) return false;

      if (!validateKey(key)) {
        setError("The signal key is not valid. Ask the teacher to start a new round.");
        setPhase("error");
        return false;
      }
      if (!validateRepeats(repeats)) {
        setError("Signal repeats must be a whole number from 1 to 100.");
        setPhase("error");
        return false;
      }
      if (!validateGapMs(gapMs)) {
        setError("Signal gap must be between 100 and 5000 ms.");
        setPhase("error");
        return false;
      }
      if (!validateAmplitude(amplitude)) {
        setError("Signal volume must be between 0.05 and 1.");
        setPhase("error");
        return false;
      }

      let nextPlan;
      try {
        nextPlan = buildTransmissionPlan({
          key: Number(key),
          repeats: Number(repeats),
          gapMs: Number(gapMs),
        });
      } catch (planError) {
        setError(planError.message);
        setPhase("error");
        return false;
      }

      if (!prime()) return false;
      const context = contextRef.current;
      if (!context) return false;

      sessionRef.current += 1;
      const session = sessionRef.current;
      runningRef.current = true;
      setError("");
      setPhase("preparing");
      setPlan(nextPlan);
      planRef.current = nextPlan;
      setPlayed(0);
      setElapsedMs(0);

      try {
        if (context.state === "suspended") await context.resume();
        if (session !== sessionRef.current) return false;

        const frame = encodeFrame(valueToDigits(Number(key)), context.sampleRate, {
          amplitude: Number(amplitude),
        });
        const gapSamples = Math.round((context.sampleRate * Number(gapMs)) / 1000);
        const totalSamples =
          frame.samples.length * Number(repeats) +
          gapSamples * Math.max(0, Number(repeats) - 1);
        const audioBuffer = context.createBuffer(1, totalSamples, context.sampleRate);
        for (let index = 0; index < Number(repeats); index += 1) {
          audioBuffer.copyToChannel(
            frame.samples,
            0,
            index * (frame.samples.length + gapSamples)
          );
        }

        const source = context.createBufferSource();
        source.buffer = audioBuffer;
        const master = context.createGain();
        master.gain.value = 1;
        source.connect(master);
        master.connect(context.destination);

        const engine = { context, source, master, disposed: false };
        engineRef.current = engine;

        const startAt = context.currentTime + START_DELAY_SECONDS;
        startTimeRef.current = startAt;
        source.onended = () => {
          if (engine.disposed || session !== sessionRef.current) return;
          releaseEngine();
          finish("complete");
        };
        source.start(startAt);
        setPhase("playing");

        wakeLockRef.current = await requestWakeLock();
        if (session !== sessionRef.current) return false;

        timerRef.current = window.setInterval(() => {
          if (session !== sessionRef.current) return;
          const elapsed = Math.max(0, (context.currentTime - startTimeRef.current) * 1000);
          setElapsedMs(Math.min(nextPlan.totalDurationMs, elapsed));
          setPlayed(countStartedFrames(nextPlan, elapsed));
          if (elapsed >= nextPlan.totalDurationMs + 80) {
            releaseEngine();
            finish("complete");
          }
        }, 100);

        // Completion resolves the promise; stop() resolves it as false.
        return await new Promise((resolve) => {
          settleRef.current = resolve;
        });
      } catch (startError) {
        if (session !== sessionRef.current) return false;
        releaseEngine();
        runningRef.current = false;
        planRef.current = null;
        setPhase("error");
        setError(startError.message || "The signal could not be played.");
        settle(false);
        return false;
      }
    },
    [finish, prime, releaseEngine, settle]
  );

  return { phase, error, plan, played, elapsedMs, prime, play, stop };
};

export const SIGNAL_DEFAULTS = Object.freeze({
  repeats: DEFAULT_REPEATS,
  gapMs: DEFAULT_GAP_MS,
  amplitude: DEFAULT_AMPLITUDE,
});
