/**
 * Pure planning/report helpers for the two-phone FSK link (Layer 1, slice 1.8).
 *
 * The TX page uses these to schedule frames; the RX page uses them for
 * counters and reports. Keeping them out of React makes the timing and rate
 * arithmetic testable in Node without a speaker, microphone or browser.
 */

const fsk = require("./fsk");

const RUN_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RUN_ID_LENGTH = 6;
const MIN_GAP_MS = 100;
const MAX_GAP_MS = 5000;
const MAX_REPEATS = 100;
const FRAME_DURATION_MS = fsk.SYMBOL_COUNT * fsk.SYMBOL_DURATION_MS;
const MAX_KEY_VALUE = fsk.MAX_FRAME_VALUE - 1;

const generateRunId = (random = Math.random) => {
  let id = "";
  for (let index = 0; index < RUN_ID_LENGTH; index += 1) {
    const pick = Math.floor(random() * RUN_ID_ALPHABET.length);
    id += RUN_ID_ALPHABET[Math.min(RUN_ID_ALPHABET.length - 1, Math.max(0, pick))];
  }
  return id;
};

const normaliseRunId = (value) => String(value || "").trim().toUpperCase();

const validateRunId = (value) => {
  const id = normaliseRunId(value);
  return /^[A-HJ-NP-Z2-9]{4,12}$/.test(id);
};

const validateKey = (value) => {
  const key = Number(value);
  return Number.isInteger(key) && key >= 0 && key <= MAX_KEY_VALUE;
};

const validateRepeats = (value) => {
  const repeats = Number(value);
  return Number.isInteger(repeats) && repeats >= 1 && repeats <= MAX_REPEATS;
};

const validateGapMs = (value) => {
  const gap = Number(value);
  return Number.isFinite(gap) && gap >= MIN_GAP_MS && gap <= MAX_GAP_MS;
};

const validateAmplitude = (value) => {
  const amplitude = Number(value);
  return Number.isFinite(amplitude) && amplitude > 0 && amplitude <= 1;
};

const buildTransmissionPlan = ({ key, repeats, gapMs = 450 } = {}) => {
  if (!validateKey(key)) {
    throw new RangeError(`key must be an integer from 0 to ${MAX_KEY_VALUE}`);
  }
  if (!validateRepeats(repeats)) {
    throw new RangeError(`repeats must be an integer from 1 to ${MAX_REPEATS}`);
  }
  if (!validateGapMs(gapMs)) {
    throw new RangeError(`gapMs must be between ${MIN_GAP_MS} and ${MAX_GAP_MS}`);
  }

  const slotMs = FRAME_DURATION_MS + gapMs;
  const frames = Array.from({ length: repeats }, (_, index) => ({
    index,
    number: index + 1,
    startMs: index * slotMs,
    endMs: index * slotMs + FRAME_DURATION_MS,
  }));

  return {
    key: Number(key),
    repeats: Number(repeats),
    gapMs: Number(gapMs),
    frameDurationMs: FRAME_DURATION_MS,
    slotMs,
    totalDurationMs: repeats * FRAME_DURATION_MS + (repeats - 1) * gapMs,
    frames,
    dataDigits: fsk.valueToDigits(Number(key)),
    toneSequence: fsk.frameTones(fsk.valueToDigits(Number(key))),
    checkDigits: fsk.checkDigitsFor(fsk.valueToDigits(Number(key))),
  };
};

const countStartedFrames = (plan, elapsedMs) => {
  if (!plan || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const started = Math.floor(elapsedMs / plan.slotMs) + 1;
  return Math.min(plan.repeats, Math.max(0, started));
};

const decodeRate = (decoded, planned) => {
  if (!Number.isFinite(decoded) || !Number.isFinite(planned) || planned <= 0) return null;
  return Math.max(0, decoded) / planned;
};

const formatPercent = (ratio) => {
  if (!Number.isFinite(ratio)) return "not available";
  return `${(ratio * 100).toFixed(1)}%`;
};

const seconds = (milliseconds) => (Number.isFinite(milliseconds) ? `${(milliseconds / 1000).toFixed(1)} s` : "—");

const formatCommonHeader = ({ title, role, generatedAt, device, runId, distance, room, notes }) => {
  const timestamp = generatedAt instanceof Date ? generatedAt.toISOString() : String(generatedAt || new Date().toISOString());
  const lines = [
    "Bio Attend - FSK two-phone link report",
    `Role: ${role}`,
    `Run ID: ${normaliseRunId(runId) || "not set"}`,
    `Generated: ${timestamp}`,
    "",
    "This is a Layer 1 acoustic link test. It does not mark attendance, prove classroom range or replace the paired report from the other phone.",
    "",
    title,
  ];
  if (device) {
    lines.push(
      `- Browser: ${device.userAgent || "not reported"}`,
      `- AudioContext rate: ${Number.isFinite(device.contextSampleRate) ? `${device.contextSampleRate} Hz` : "not reported"}`,
      `- Microphone rate: ${Number.isFinite(device.trackSampleRate) ? `${device.trackSampleRate} Hz` : device.role === "tx" ? "not used" : "not reported"}`
    );
    if (device.warning) lines.push(`- Warning: ${device.warning}`);
  } else {
    lines.push("- Device details: not available");
  }
  if (distance || room || notes) {
    lines.push("", "Test conditions", `- Distance: ${distance || "not set"}`, `- Room: ${room || "not set"}`, `- Notes: ${notes || "none"}`);
  }
  return lines;
};

const formatTxReport = (report = {}) => {
  const plan = report.plan;
  const lines = formatCommonHeader({
    title: "Transmitter (TX)",
    role: "transmitter (TX)",
    generatedAt: report.generatedAt,
    device: report.device,
    runId: report.runId,
    distance: report.distance,
    room: report.room,
    notes: report.notes,
  });

  lines.push("", "Frame plan");
  if (plan) {
    lines.push(
      `- Key value: ${plan.key}`,
      `- Data digits (base 15): ${plan.dataDigits.join(", ")}`,
      `- Tone sequence: ${plan.toneSequence.join(", ")}`,
      `- Check digits: ${plan.checkDigits.join(", ")}`,
      `- Symbol duration: ${fsk.SYMBOL_DURATION_MS} ms`,
      `- Frame duration: ${seconds(plan.frameDurationMs)}`,
      `- Gap between frames: ${plan.gapMs} ms`,
      `- Planned frames: ${plan.repeats}`,
      `- Planned duration: ${seconds(plan.totalDurationMs)}`,
      `- Amplitude setting: ${Number.isFinite(report.amplitude) ? report.amplitude : "not reported"}`,
      `- Frames played: ${Number.isFinite(report.played) ? report.played : 0}`
    );
  } else {
    lines.push("- No transmission was started.");
  }
  lines.push("", "TX cannot know whether the receiver heard anything. Compare this report with the RX report using the same run ID.");
  return lines.join("\n");
};

const formatRxReport = (report = {}) => {
  const lines = formatCommonHeader({
    title: "Receiver (RX)",
    role: "receiver (RX)",
    generatedAt: report.generatedAt,
    device: report.device,
    runId: report.runId,
    distance: report.distance,
    room: report.room,
    notes: report.notes,
  });

  const ratio = decodeRate(report.decoded, report.planned);
  lines.push(
    "",
    "Decode counters",
    `- Planned frames (entered from TX): ${Number.isFinite(report.planned) ? report.planned : "not set"}`,
    `- Frames decoded: ${Number.isFinite(report.decoded) ? report.decoded : 0}`,
    `- Decode rate: ${ratio == null ? "not available (set planned frames)" : formatPercent(ratio)}`,
    `- Listening time: ${seconds(report.elapsedMs)}`,
    `- Last decoded key: ${Number.isFinite(report.lastKey) ? report.lastKey : "none"}`,
    `- Last frame margin: ${Number.isFinite(report.lastMargin) ? `${report.lastMargin.toFixed(1)} dB` : "none"}`
  );
  if (Array.isArray(report.keys) && report.keys.length > 0) {
    lines.push(`- Decoded sequence: ${report.keys.join(", ")}`);
  }
  lines.push(
    "",
    "A decoded frame means the checksum and marker passed. It does not prove which phone produced the sound, and it is not an attendance record."
  );
  return lines.join("\n");
};

const buildTxReportJson = (report = {}) => ({
  version: 1,
  testType: "cross-phone",
  role: "tx",
  runId: normaliseRunId(report.runId),
  generatedAt: new Date(report.generatedAt || Date.now()).toISOString(),
  appVersion: process.env.REACT_APP_VERSION || "dev",
  device: report.device || null,
  conditions: {
    distance: report.distance || null,
    room: report.room || null,
    notes: report.notes || null,
  },
  key: report.plan?.key ?? null,
  dataDigits: report.plan?.dataDigits ?? null,
  toneSequence: report.plan?.toneSequence ?? null,
  symbolDurationMs: fsk.SYMBOL_DURATION_MS,
  frameDurationMs: report.plan?.frameDurationMs ?? FRAME_DURATION_MS,
  gapMs: report.plan?.gapMs ?? null,
  repeats: report.plan?.repeats ?? null,
  plannedDurationMs: report.plan?.totalDurationMs ?? null,
  amplitude: report.amplitude ?? null,
  played: report.played ?? 0,
});

const buildRxReportJson = (report = {}) => ({
  version: 1,
  testType: "cross-phone",
  role: "rx",
  runId: normaliseRunId(report.runId),
  generatedAt: new Date(report.generatedAt || Date.now()).toISOString(),
  appVersion: process.env.REACT_APP_VERSION || "dev",
  device: report.device || null,
  conditions: {
    distance: report.distance || null,
    room: report.room || null,
    notes: report.notes || null,
  },
  planned: report.planned ?? null,
  decoded: report.decoded ?? 0,
  decodeRate: decodeRate(report.decoded, report.planned),
  elapsedMs: report.elapsedMs ?? 0,
  keys: report.keys || [],
  lastKey: report.lastKey ?? null,
  lastMargin: report.lastMargin ?? null,
  frames: report.frames || [],
});

module.exports = {
  RUN_ID_ALPHABET,
  RUN_ID_LENGTH,
  FRAME_DURATION_MS,
  MAX_KEY_VALUE,
  MAX_REPEATS,
  MIN_GAP_MS,
  MAX_GAP_MS,
  generateRunId,
  normaliseRunId,
  validateRunId,
  validateKey,
  validateRepeats,
  validateGapMs,
  validateAmplitude,
  buildTransmissionPlan,
  countStartedFrames,
  decodeRate,
  formatPercent,
  formatTxReport,
  formatRxReport,
  buildTxReportJson,
  buildRxReportJson,
};
