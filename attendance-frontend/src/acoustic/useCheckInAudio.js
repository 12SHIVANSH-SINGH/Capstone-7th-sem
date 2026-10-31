import { useCallback, useEffect, useRef, useState } from "react";
import { createPcmBuffer, extractNextFrame } from "./receiver";
import {
  evaluateContextSampleRate,
  evaluateSampleRateGate,
  mapMicError,
} from "./labConfig";
import { releaseWakeLock, requestWakeLock } from "../components/acousticLab/linkUtils";

/**
 * Microphone capture for the student check-in shell (slice 2.4b).
 *
 * This is the same AudioWorklet + rolling-PCM path as the tested receiver lab,
 * reduced to one job: return the first valid FSK frame, then release the mic.
 * The caller signs and submits the decoded key. Raw audio never leaves the
 * phone.
 */

const CHUNK_SIZE = 4096;
const DECODE_INTERVAL_MS = 700;
const LISTEN_LIMIT_MS = 60 * 1000;

const disposeEngine = (engine) => {
  if (!engine || engine.disposed) return;
  engine.disposed = true;
  if (engine.decodeTimer) window.clearInterval(engine.decodeTimer);
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

export const useCheckInAudio = ({ onFrame } = {}) => {
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const engineRef = useRef(null);
  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const wakeLockRef = useRef(null);
  const limitTimerRef = useRef(null);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const disposeCurrent = useCallback(() => {
    const engine = engineRef.current;
    engineRef.current = null;
    disposeEngine(engine);
    if (limitTimerRef.current) {
      window.clearTimeout(limitTimerRef.current);
      limitTimerRef.current = null;
    }
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    releaseWakeLock(lock);
  }, []);

  const stop = useCallback(
    (nextPhase = "stopped") => {
      if (!runningRef.current) return;
      sessionRef.current += 1;
      runningRef.current = false;
      disposeCurrent();
      setPhase(nextPhase);
    },
    [disposeCurrent]
  );

  useEffect(
    () => () => {
      sessionRef.current += 1;
      runningRef.current = false;
      disposeCurrent();
    },
    [disposeCurrent]
  );

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (!runningRef.current) return;
      stop();
      setError(
        "The tab went to the background, so listening stopped and the microphone was released. Keep this page visible and start again."
      );
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [stop]);

  const handleFrame = useCallback(
    (frame) => {
      sessionRef.current += 1;
      runningRef.current = false;
      disposeCurrent();
      setPhase("captured");
      onFrameRef.current?.(frame);
    },
    [disposeCurrent]
  );

  const decodePass = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || engine.disposed) return;

    const frame = extractNextFrame(engine.buffer, {
      sampleRate: engine.context.sampleRate,
    });
    if (frame) handleFrame(frame);
  }, [handleFrame]);

  const start = useCallback(async () => {
    if (runningRef.current) return false;
    setError("");

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access needs HTTPS or localhost. Open this page over a secure connection.");
      return false;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setError("This browser does not expose the Web Audio API. Use current Chrome on Android.");
      return false;
    }

    runningRef.current = true;
    sessionRef.current += 1;
    const session = sessionRef.current;
    setPhase("starting");

    let context = null;
    let stream = null;
    let engine = null;

    try {
      context = new AudioContextClass();
      const contextGate = evaluateContextSampleRate(context.sampleRate);
      if (!contextGate.ok) {
        const gateError = new Error(contextGate.message);
        gateError.name = "SampleRateError";
        throw gateError;
      }

      if (context.state === "suspended") await context.resume();
      if (session !== sessionRef.current) {
        await context.close().catch(() => {});
        return false;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close().catch(() => {});
        return false;
      }

      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings?.() || {};
      const sampleGate = evaluateSampleRateGate({
        contextRate: context.sampleRate,
        trackRate: settings.sampleRate,
      });
      if (!sampleGate.ok) {
        const gateError = new Error(sampleGate.message);
        gateError.name = "SampleRateError";
        throw gateError;
      }

      engine = {
        context,
        stream,
        source: null,
        worklet: null,
        silentSink: null,
        buffer: createPcmBuffer(),
        disposed: false,
        decodeTimer: null,
      };
      engineRef.current = engine;

      if (!context.audioWorklet || typeof AudioWorkletNode !== "function") {
        throw new Error("This browser does not support AudioWorklet. Use current Chrome on Android.");
      }

      await context.audioWorklet.addModule(
        `${process.env.PUBLIC_URL}/pcm-capture-worklet.js?v=1`
      );
      if (session !== sessionRef.current || engineRef.current !== engine) {
        disposeEngine(engine);
        return false;
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
      };

      source.connect(worklet);
      worklet.connect(silentSink);
      silentSink.connect(context.destination);

      setPhase("listening");
      wakeLockRef.current = await requestWakeLock();
      if (session !== sessionRef.current) {
        disposeCurrent();
        return false;
      }

      engine.decodeTimer = window.setInterval(decodePass, DECODE_INTERVAL_MS);
      limitTimerRef.current = window.setTimeout(() => {
        if (!runningRef.current) return;
        stop();
        setError(
          "Listening stopped after one minute to release the microphone. Start again while the key is still live."
        );
      }, LISTEN_LIMIT_MS);
      return true;
    } catch (startError) {
      if (engine) {
        disposeEngine(engine);
      } else {
        try {
          stream?.getTracks().forEach((item) => item.stop());
        } catch {
          // Already stopped.
        }
        if (context && context.state !== "closed") await context.close().catch(() => {});
      }
      if (engineRef.current === engine) engineRef.current = null;
      if (session !== sessionRef.current) return false;
      runningRef.current = false;
      setPhase("idle");
      setError(mapMicError(startError));
      return false;
    }
  }, [decodePass, disposeCurrent, stop]);

  return { phase, error, start, stop };
};
