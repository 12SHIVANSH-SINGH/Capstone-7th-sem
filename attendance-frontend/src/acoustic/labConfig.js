/**
 * Pure helpers for the acoustic capability lab (Layer 1, slice 3a).
 *
 * Plain CommonJS on purpose: the same file runs in Node tests
 * (`npm run test:acoustic`) and is imported by the React lab page.
 *
 * This module knows nothing about React, the DOM or AudioContext. It only
 * decides things: sample-rate gates, verdict thresholds, tone schedules,
 * measurement statistics, meter values, error text and report text.
 */

const MIN_SAMPLE_RATE = 44100;
const DEFAULT_WINDOW_SIZE = 4096;

const TONE_DURATION_MS = 700;
const TONE_GAP_MS = 250;
const TONE_FADE_MS = 6;
const TONE_STOP_TAIL_MS = 20;
const TONE_LEVEL = 0.08;

const BASELINE_SETTLE_MS = 450;
const BASELINE_DURATION_MS = 2200;
const STEADY_TRIM_FRACTION = 0.2;

const VERDICT_STRONG_DB = 12;
const VERDICT_TENTATIVE_DB = 6;

const METER_FLOOR_DB = -100;
const METER_CEILING_DB = 0;

// Five coarse probes cover the lower-high and upper-high region; the two
// codec-edge probes are the actual 18.0 kHz marker and 19.76 kHz top tone.
const COARSE_PROBES = [15500, 16500, 17500, 18500, 19500];
const CODEC_EDGE_PROBES = [18000, 19760];
const PROBES = [
  { frequency: 15500, band: "coarse" },
  { frequency: 16500, band: "coarse" },
  { frequency: 17500, band: "coarse" },
  { frequency: 18500, band: "coarse" },
  { frequency: 19500, band: "coarse" },
  { frequency: 18000, band: "codec-edge" },
  { frequency: 19760, band: "codec-edge" },
];
const PROBE_FREQUENCIES = PROBES.map(({ frequency }) => frequency);

const formatRate = (rate) =>
  Number.isFinite(rate) && rate > 0 ? `${Math.round(rate)} Hz` : "not reported";

const evaluateContextSampleRate = (rate) => {
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      ok: false,
      status: "missing",
      rate: null,
      requiredRate: MIN_SAMPLE_RATE,
      message: `The browser did not report an audio sample rate. This lab needs at least ${MIN_SAMPLE_RATE} Hz (44.1 kHz) so every probe fits below the Nyquist limit.`,
    };
  }

  if (rate < MIN_SAMPLE_RATE) {
    return {
      ok: false,
      status: "low",
      rate,
      requiredRate: MIN_SAMPLE_RATE,
      message: `This browser opened audio at ${formatRate(rate)}. The lab refuses to run below ${MIN_SAMPLE_RATE} Hz (44.1 kHz), because the 18-19.8 kHz probes would be cut off or would alias. Use current Chrome on Android with the phone's normal speaker and microphone route.`,
    };
  }

  return {
    ok: true,
    status: "ok",
    rate,
    requiredRate: MIN_SAMPLE_RATE,
    message: `Audio context rate is ${formatRate(rate)}, at or above the ${MIN_SAMPLE_RATE} Hz minimum.`,
  };
};

const evaluateTrackSampleRate = (rate) => {
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      ok: true,
      status: "unknown",
      reported: false,
      rate: null,
      requiredRate: MIN_SAMPLE_RATE,
      warning: `The browser did not report the microphone sample rate. The audio context passed the ${MIN_SAMPLE_RATE} Hz gate, but the capture rate is unverified; check that no Bluetooth headset is selected.`,
      message: "Microphone sample rate not reported.",
    };
  }

  if (rate < MIN_SAMPLE_RATE) {
    return {
      ok: false,
      status: "low",
      reported: true,
      rate,
      requiredRate: MIN_SAMPLE_RATE,
      message: `The microphone reported ${formatRate(rate)}. Capture below ${MIN_SAMPLE_RATE} Hz (44.1 kHz) is refused because the high-band probes cannot be represented. A Bluetooth headset in call/SCO mode often causes this; switch to the phone's own microphone and try again.`,
    };
  }

  return {
    ok: true,
    status: "ok",
    reported: true,
    rate,
    requiredRate: MIN_SAMPLE_RATE,
    message: `Microphone rate is ${formatRate(rate)}.`,
  };
};

const evaluateSampleRateGate = ({ contextRate, trackRate } = {}) => {
  const context = evaluateContextSampleRate(contextRate);
  const track = evaluateTrackSampleRate(trackRate);
  const ok = context.ok && track.ok;

  return {
    ok,
    refused: !ok,
    context,
    track,
    warning: track.warning || null,
    message: !context.ok ? context.message : !track.ok ? track.message : track.warning || context.message,
  };
};

const getVerdict = (margin) => {
  if (!Number.isFinite(margin)) {
    return {
      key: "none",
      label: "No data",
      variant: "neutral",
      detail: "No steady measurement window was collected for this probe.",
    };
  }
  if (margin >= VERDICT_STRONG_DB) {
    return {
      key: "strong",
      label: "Strong",
      variant: "success",
      detail: `${margin.toFixed(1)} dB above baseline: clear local detection.`,
    };
  }
  if (margin >= VERDICT_TENTATIVE_DB) {
    return {
      key: "tentative",
      label: "Tentative",
      variant: "warning",
      detail: `${margin.toFixed(1)} dB above baseline: between the 6 dB tentative and 12 dB strong thresholds.`,
    };
  }
  return {
    key: "weak",
    label: "Weak",
    variant: "neutral",
    detail: `${margin.toFixed(1)} dB above baseline: below the 6 dB tentative threshold.`,
  };
};

const finiteValues = (values) =>
  Array.isArray(values) ? values.filter((value) => Number.isFinite(value)) : [];

const median = (values) => {
  const clean = finiteValues(values);
  if (clean.length === 0) return null;

  const sorted = [...clean].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const computeBaseline = (windows) => median(windows);

/**
 * Median of the steady part of a tone, after trimming the first/last 20%.
 * A single click or spurious spike therefore cannot become the peak.
 */
const computeTonePeak = (windows, options = {}) => {
  const clean = finiteValues(windows);
  if (clean.length === 0) return null;

  const trimFraction = Number.isFinite(options.trimFraction)
    ? Math.min(0.45, Math.max(0, options.trimFraction))
    : STEADY_TRIM_FRACTION;
  const trim = Math.floor(clean.length * trimFraction);
  const steady = clean.length - 2 * trim >= 1 ? clean.slice(trim, clean.length - trim) : clean;
  return median(steady);
};

const hasCompleteBaseline = (baseline, probes = PROBES) =>
  Boolean(baseline) &&
  probes.every((probe) => {
    const frequency = typeof probe === "number" ? probe : probe.frequency;
    return Number.isFinite(baseline[frequency]);
  });

const summarizeSweep = (results) => {
  const margins = new Map();
  for (const result of Array.isArray(results) ? results : []) {
    if (!result || !Number.isFinite(result.frequency) || !Number.isFinite(result.margin)) continue;
    margins.set(result.frequency, result.margin);
  }

  const isStrong = (frequency) => margins.get(frequency) >= VERDICT_STRONG_DB;
  const isAtLeastTentative = (frequency) => {
    const margin = margins.get(frequency);
    return Number.isFinite(margin) && margin >= VERDICT_TENTATIVE_DB;
  };

  const strongFrequencies = PROBE_FREQUENCIES.filter(isStrong);
  const tentativeFrequencies = PROBE_FREQUENCIES.filter(
    (frequency) => isAtLeastTentative(frequency) && !isStrong(frequency)
  );

  const topIsStrong = isStrong(19500) && isStrong(19760);
  const lowerHighStrong = isStrong(18000) || isStrong(18500);
  const fallbackStrong = [15500, 16500, 17500].some(isStrong);
  const anyTentative = PROBE_FREQUENCIES.some(isAtLeastTentative);

  if (topIsStrong) {
    return {
      key: "full-high",
      label: "Full high band",
      variant: "success",
      headline: "The top of the 18-19.8 kHz band was detected strongly on this phone.",
      detail:
        "Both 19.5 and 19.76 kHz measured strong locally. This is a speaker-to-microphone self-test only; verify 18.0/18.5 kHz, distance and different phones before using the full high band in a protocol.",
      strongFrequencies,
      tentativeFrequencies,
    };
  }

  if (lowerHighStrong) {
    return {
      key: "lower-high",
      label: "Lower high band only",
      variant: "info",
      headline: "The lower part of the high band (around 18.0-18.5 kHz) was detected strongly.",
      detail:
        "The top edge (19.5 and 19.76 kHz) was not both strong, so do not claim the full 18-19.8 kHz band from 18.5 kHz alone. Test 18.0/18.5 kHz across phones and at classroom distance before choosing it.",
      strongFrequencies,
      tentativeFrequencies,
    };
  }

  if (fallbackStrong) {
    return {
      key: "fallback",
      label: "Fallback band",
      variant: "warning",
      headline: "The 15.5-17.5 kHz fallback is the only strongly detected option.",
      detail:
        "At least one fallback probe measured strong while the high band did not. This band may be partly audible to younger listeners: keep volume low, frames short, and verify across phones before use.",
      strongFrequencies,
      tentativeFrequencies,
    };
  }

  if (anyTentative) {
    const hasStrongProbe = strongFrequencies.length > 0;
    return {
      key: "tentative",
      label: "Tentative only",
      variant: "warning",
      headline: hasStrongProbe
        ? "Some probes were strong, but not in the combination needed to recommend a band."
        : "Some probes reached the tentative 6 dB threshold, but none reached 12 dB.",
      detail: hasStrongProbe
        ? `Strong probes: ${strongFrequencies
            .map((frequency) => `${(frequency / 1000).toFixed(2)} kHz`)
            .join(", ")}. The expected pattern is incomplete, so one strong probe is not enough to recommend the full 18-19.8 kHz band or a fallback band. Treat it as tentative and retest.`
        : "Do not use a tentative result to choose a band. Rerun in a quieter room, check volume and the microphone route, and test another phone before deciding.",
      strongFrequencies,
      tentativeFrequencies,
    };
  }

  if (margins.size === 0) {
    return {
      key: "none",
      label: "No data",
      variant: "neutral",
      headline: "No usable probe measurements were collected.",
      detail:
        "Check that the page stayed in the foreground and the microphone was not in use, then run the sweep again. This lab cannot mark attendance and does not prove classroom range.",
      strongFrequencies,
      tentativeFrequencies,
    };
  }

  return {
    key: "none",
    label: "No usable band yet",
    variant: "neutral",
    headline: "No probe reached even the 6 dB tentative threshold.",
    detail:
      "Record the browser and device, then test another phone, a quieter room, or a different output volume. This lab cannot mark attendance and does not prove classroom range.",
    strongFrequencies,
    tentativeFrequencies,
  };
};

const buildTonePlan = (frequencies, options = {}) => {
  if (!Array.isArray(frequencies) || frequencies.length === 0) {
    throw new RangeError("frequencies must be a non-empty array");
  }

  const toneDurationMs = options.toneDurationMs ?? TONE_DURATION_MS;
  const gapMs = options.gapMs ?? TONE_GAP_MS;
  const fadeMs = options.fadeMs ?? TONE_FADE_MS;
  const level = options.level ?? TONE_LEVEL;
  const startTime = options.startTime ?? 0;

  if (!Number.isFinite(toneDurationMs) || toneDurationMs <= 0) {
    throw new RangeError("toneDurationMs must be positive");
  }
  if (!Number.isFinite(gapMs) || gapMs < 0) {
    throw new RangeError("gapMs must be zero or positive");
  }
  if (!Number.isFinite(fadeMs) || fadeMs <= 0 || fadeMs * 2 >= toneDurationMs) {
    throw new RangeError("fadeMs must be positive and shorter than half the tone");
  }
  if (!Number.isFinite(level) || level <= 0 || level > 1) {
    throw new RangeError("level must be greater than zero and at most one");
  }
  if (!Number.isFinite(startTime)) {
    throw new RangeError("startTime must be finite");
  }

  frequencies.forEach((frequency, index) => {
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new RangeError(`frequencies[${index}] must be a positive number`);
    }
  });

  const toneSeconds = toneDurationMs / 1000;
  const gapSeconds = gapMs / 1000;
  const slotSeconds = toneSeconds + gapSeconds;

  return frequencies.map((frequency, index) => {
    const entryStart = startTime + index * slotSeconds;
    const entryEnd = entryStart + toneSeconds;
    return {
      frequency,
      index,
      startTime: entryStart,
      endTime: entryEnd,
      fadeInEndTime: entryStart + fadeMs / 1000,
      fadeOutStartTime: entryEnd - fadeMs / 1000,
      stopTime: entryEnd + TONE_STOP_TAIL_MS / 1000,
      fadeMs,
      level,
    };
  });
};

const toneEnvelopePoints = (entry) => {
  if (!entry || !Number.isFinite(entry.startTime) || !Number.isFinite(entry.endTime)) {
    throw new RangeError("a tone entry needs finite startTime and endTime");
  }
  const fadeMs = Number.isFinite(entry.fadeMs) ? entry.fadeMs : TONE_FADE_MS;
  const level = Number.isFinite(entry.level) ? entry.level : TONE_LEVEL;
  const fadeSeconds = fadeMs / 1000;
  if (entry.endTime - entry.startTime <= 2 * fadeSeconds) {
    throw new RangeError("a tone must be longer than two fades");
  }

  return [
    { time: entry.startTime, value: 0 },
    { time: entry.startTime + fadeSeconds, value: level },
    { time: entry.endTime - fadeSeconds, value: level },
    { time: entry.endTime, value: 0 },
  ];
};

const fadeOutEnvelope = (currentTime, currentLevel, options = {}) => {
  if (!Number.isFinite(currentTime)) throw new RangeError("currentTime must be finite");
  const fadeMs = Number.isFinite(options.fadeMs) ? options.fadeMs : TONE_FADE_MS;
  const tailMs = Number.isFinite(options.tailMs) ? options.tailMs : 6;
  const level = Number.isFinite(currentLevel) ? Math.max(0, currentLevel) : 0;
  const fadeEnd = currentTime + fadeMs / 1000;
  return {
    points: [
      { time: currentTime, value: level },
      { time: fadeEnd, value: 0 },
    ],
    stopTime: fadeEnd + tailMs / 1000,
  };
};

const updatePeakHold = (previous, current) => {
  if (!Number.isFinite(current)) return Number.isFinite(previous) ? previous : null;
  if (!Number.isFinite(previous)) return current;
  return Math.max(previous, current);
};

const clampMeterDb = (value, floorDb = METER_FLOOR_DB, ceilingDb = METER_CEILING_DB) => {
  if (!Number.isFinite(value)) return null;
  return Math.min(ceilingDb, Math.max(floorDb, value));
};

const dbToMeterPercent = (value, floorDb = METER_FLOOR_DB, ceilingDb = METER_CEILING_DB) => {
  const clamped = clampMeterDb(value, floorDb, ceilingDb);
  if (clamped == null) return null;
  if (ceilingDb <= floorDb) return 0;
  return ((clamped - floorDb) / (ceilingDb - floorDb)) * 100;
};

const MIC_ERROR_MESSAGES = {
  NotAllowedError:
    "Microphone permission was blocked. Allow microphone access for this site in the browser settings, then try again.",
  PermissionDeniedError:
    "Microphone permission was blocked. Allow microphone access for this site in the browser settings, then try again.",
  NotFoundError:
    "No microphone was found. Connect or enable the phone's microphone and try again.",
  DevicesNotFoundError:
    "No microphone was found. Connect or enable the phone's microphone and try again.",
  NotReadableError:
    "The microphone could not start. Another app may be using it; close other audio apps and try again.",
  TrackStartError:
    "The microphone could not start. Another app may be using it; close other audio apps and try again.",
  OverconstrainedError:
    "The microphone could not apply the requested audio settings. Close other audio apps, use the phone's own microphone, and try again.",
  ConstraintNotSatisfiedError:
    "The microphone could not apply the requested audio settings. Close other audio apps, use the phone's own microphone, and try again.",
  AbortError: "Microphone setup was interrupted. Try again and keep this tab in the foreground.",
  SecurityError:
    "Microphone access needs HTTPS (or localhost). Open this page over a secure connection and try again.",
  NotSupportedError:
    "This browser does not support the required audio features. Use a current Android Chrome build.",
};

const mapMicError = (error) => {
  if (!error) return "Microphone setup failed. Check browser permission and try again.";
  if (error.name && MIC_ERROR_MESSAGES[error.name]) return MIC_ERROR_MESSAGES[error.name];
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  return "Microphone setup failed. Check browser permission and try again.";
};

const measureToneDb = (samples, sampleRate, frequency, options = {}) => {
  if (!samples || typeof samples.length !== "number" || samples.length === 0) return null;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  if (!Number.isFinite(frequency) || frequency <= 0 || frequency >= sampleRate / 2) return null;

  const start = Number.isFinite(options.start) ? Math.max(0, Math.floor(options.start)) : 0;
  const available = samples.length - start;
  const requestedWindow = Number.isFinite(options.windowSize)
    ? Math.floor(options.windowSize)
    : available;
  const windowSize = Math.min(available, requestedWindow);
  if (windowSize < 8) return null;

  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let previous = 0;
  let previousPrevious = 0;

  for (let index = start; index < start + windowSize; index += 1) {
    const current = samples[index] + coefficient * previous - previousPrevious;
    previousPrevious = previous;
    previous = current;
  }

  const magnitudeSquared =
    previousPrevious * previousPrevious +
    previous * previous -
    coefficient * previous * previousPrevious;
  const normalizedPower = Math.max(magnitudeSquared / (windowSize * windowSize), 1e-12);
  return 10 * Math.log10(normalizedPower);
};

const measureProbeLevels = (samples, sampleRate, frequencies = PROBE_FREQUENCIES, options = {}) => {
  const bins = {};
  for (const frequency of frequencies) {
    bins[frequency] = measureToneDb(samples, sampleRate, frequency, options);
  }
  return bins;
};

/**
 * Frequency actually represented when a tone is sampled at `sampleRate`.
 * Example: 19.5 kHz sampled at 32 kHz folds to 12.5 kHz.
 */
const aliasedFrequency = (frequency, sampleRate) => {
  if (!Number.isFinite(frequency) || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  const folded = ((frequency % sampleRate) + sampleRate) % sampleRate;
  return folded <= sampleRate / 2 ? folded : sampleRate - folded;
};

const formatDb = (value) =>
  Number.isFinite(value) ? `${value.toFixed(1)} dB` : "not measured";

const formatProcessing = (value) => {
  if (value === false) return "off (disabled as requested)";
  if (value === true) return "on (browser kept control)";
  return "not reported";
};

const formatLabReport = ({ generatedAt, device, baseline, results, summary } = {}) => {
  const timestamp =
    typeof generatedAt === "string"
      ? generatedAt
      : generatedAt instanceof Date
        ? generatedAt.toISOString()
        : new Date().toISOString();
  const measurements = Array.isArray(results) ? results : [];
  const recommendation = summary || summarizeSweep(measurements);

  const lines = [
    "Bio Attend - acoustic capability lab report",
    `Generated: ${timestamp}`,
    "",
    "This is a local speaker-to-microphone self-test. It cannot mark attendance, does not save a result, and does not prove classroom range or presence.",
    "",
    "Device",
  ];

  if (device) {
    const processing = device.processing || {};
    lines.push(
      `- AudioContext sample rate: ${formatRate(device.contextSampleRate)}`,
      `- Microphone sample rate: ${formatRate(device.trackSampleRate)}`,
      `- Echo cancellation applied: ${formatProcessing(processing.echoCancellation)}`,
      `- Noise suppression applied: ${formatProcessing(processing.noiseSuppression)}`,
      `- Auto gain control applied: ${formatProcessing(processing.autoGainControl)}`,
      `- Microphone channels: ${Number.isFinite(device.channelCount) ? device.channelCount : "not reported"}`,
      `- AudioWorklet: ${device.worklet ? "available" : "not available"}`,
      `- Analysis window: ${Number.isFinite(device.windowSize) ? `${device.windowSize} samples` : "not reported"}`,
      `- Probes: ${PROBE_FREQUENCIES.map((frequency) => `${(frequency / 1000).toFixed(2)} kHz`).join(", ")}`
    );
    if (device.warning) lines.push(`- Warning: ${device.warning}`);
    if (device.userAgent) lines.push(`- Browser: ${device.userAgent}`);
  } else {
    lines.push("- Device details: not available");
  }

  lines.push("", "Ambient baseline");
  if (baseline) {
    for (const probe of PROBES) {
      lines.push(`- ${(probe.frequency / 1000).toFixed(2)} kHz (${probe.band}): ${formatDb(baseline[probe.frequency])}`);
    }
  } else {
    lines.push("- Not measured");
  }

  lines.push("", "Local measurements");
  lines.push("Probe | Band | Baseline | Peak | Margin | Verdict");
  if (measurements.length === 0) {
    lines.push("No sweep has run.");
  } else {
    for (const result of measurements) {
      const probe = PROBES.find((candidate) => candidate.frequency === result.frequency);
      const verdict = result.verdict || getVerdict(result.margin);
      lines.push(
        [
          `${(result.frequency / 1000).toFixed(2)} kHz`,
          probe ? probe.band : "unknown",
          formatDb(result.baseline),
          formatDb(result.peakDb),
          formatDb(result.margin),
          verdict.label,
        ].join(" | ")
      );
    }
  }

  lines.push(
    "",
    `Recommendation: ${recommendation.headline}`,
    recommendation.detail,
    "",
    "No attendance claim can be made from this report."
  );

  return lines.join("\n");
};

module.exports = {
  MIN_SAMPLE_RATE,
  DEFAULT_WINDOW_SIZE,
  TONE_DURATION_MS,
  TONE_GAP_MS,
  TONE_FADE_MS,
  TONE_STOP_TAIL_MS,
  TONE_LEVEL,
  BASELINE_SETTLE_MS,
  BASELINE_DURATION_MS,
  STEADY_TRIM_FRACTION,
  VERDICT_STRONG_DB,
  VERDICT_TENTATIVE_DB,
  METER_FLOOR_DB,
  METER_CEILING_DB,
  COARSE_PROBES,
  CODEC_EDGE_PROBES,
  PROBES,
  PROBE_FREQUENCIES,
  evaluateContextSampleRate,
  evaluateTrackSampleRate,
  evaluateSampleRateGate,
  getVerdict,
  median,
  computeBaseline,
  computeTonePeak,
  hasCompleteBaseline,
  summarizeSweep,
  buildTonePlan,
  toneEnvelopePoints,
  fadeOutEnvelope,
  updatePeakHold,
  clampMeterDb,
  dbToMeterPercent,
  mapMicError,
  measureToneDb,
  measureProbeLevels,
  aliasedFrequency,
  formatLabReport,
};
