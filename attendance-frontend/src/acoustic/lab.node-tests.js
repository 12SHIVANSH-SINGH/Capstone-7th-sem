/**
 * Node tests for the acoustic lab helpers (Layer 1, slice 3a).
 *
 * Run with: npm run test:acoustic
 * No browser, microphone or AudioContext is involved: these are pure decisions
 * plus synthetic sine waves measured with the same Goertzel maths as the worklet.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const lab = require("./labConfig");

const makeSine = (frequency, sampleRate, length, amplitude = 0.2, startSample = 0) => {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] =
      amplitude * Math.sin((2 * Math.PI * frequency * (startSample + index)) / sampleRate);
  }
  return samples;
};

const makeResults = (margins) =>
  lab.PROBES.map(({ frequency }) => ({ frequency, margin: margins[frequency] ?? 0 }));

test("probe list: five coarse probes plus two codec-edge probes", () => {
  assert.equal(lab.PROBES.length, 7);
  assert.deepEqual(lab.PROBE_FREQUENCIES, [15500, 16500, 17500, 18500, 19500, 18000, 19760]);
  assert.deepEqual(lab.COARSE_PROBES, [15500, 16500, 17500, 18500, 19500]);
  assert.deepEqual(lab.CODEC_EDGE_PROBES, [18000, 19760]);
  assert.deepEqual(
    lab.PROBES.filter((probe) => probe.band === "coarse").map((probe) => probe.frequency),
    lab.COARSE_PROBES
  );
  assert.deepEqual(
    lab.PROBES.filter((probe) => probe.band === "codec-edge").map((probe) => probe.frequency),
    lab.CODEC_EDGE_PROBES
  );
});

test("sample-rate gate truth table refuses below 44.1 kHz, warns when track rate is absent", () => {
  const cases = [
    { contextRate: 32000, trackRate: 48000, ok: false, contextStatus: "low", trackStatus: "ok" },
    { contextRate: 44100, trackRate: 32000, ok: false, contextStatus: "ok", trackStatus: "low" },
    { contextRate: 32000, trackRate: 32000, ok: false, contextStatus: "low", trackStatus: "low" },
    { contextRate: 44100, trackRate: 44100, ok: true, contextStatus: "ok", trackStatus: "ok" },
    { contextRate: 48000, trackRate: 48000, ok: true, contextStatus: "ok", trackStatus: "ok" },
    { contextRate: 48000, trackRate: undefined, ok: true, contextStatus: "ok", trackStatus: "unknown" },
    { contextRate: 44100, trackRate: null, ok: true, contextStatus: "ok", trackStatus: "unknown" },
    { contextRate: undefined, trackRate: 48000, ok: false, contextStatus: "missing", trackStatus: "ok" },
  ];

  for (const item of cases) {
    const gate = lab.evaluateSampleRateGate(item);
    assert.equal(gate.ok, item.ok, `${item.contextRate}/${item.trackRate}`);
    assert.equal(gate.refused, !item.ok);
    assert.equal(gate.context.status, item.contextStatus);
    assert.equal(gate.track.status, item.trackStatus);
    if (item.contextStatus === "low") {
      assert.match(gate.message, /44,?100 Hz/);
      assert.match(gate.message, /Nyquist|alias/);
    }
  }

  const missingTrack = lab.evaluateSampleRateGate({ contextRate: 48000 });
  assert.ok(missingTrack.warning, "missing track rate must warn");
  assert.match(missingTrack.warning, /did not report/i);

  const bluetooth = lab.evaluateSampleRateGate({ contextRate: 48000, trackRate: 32000 });
  assert.match(bluetooth.message, /Bluetooth|SCO/i);
  assert.equal(bluetooth.track.rate, 32000);
  assert.equal(lab.evaluateContextSampleRate(44100).ok, true);
  assert.equal(lab.evaluateContextSampleRate(44099).ok, false);
  assert.equal(lab.evaluateTrackSampleRate(44100).ok, true);
});

test("verdict boundaries are 6 dB tentative and 12 dB strong", () => {
  const expected = [
    [5.999, "weak"],
    [6, "tentative"],
    [11.999, "tentative"],
    [12, "strong"],
    [40, "strong"],
    [NaN, "none"],
    [null, "none"],
  ];
  for (const [margin, key] of expected) {
    assert.equal(lab.getVerdict(margin).key, key, `margin ${margin}`);
  }
  assert.equal(lab.getVerdict(12).label, "Strong");
  assert.equal(lab.getVerdict(6).label, "Tentative");
  assert.equal(lab.getVerdict(0).label, "Weak");
  assert.equal(lab.getVerdict(null).label, "No data");
});

test("sweep summary: full-high, lower-high, fallback, tentative and none", () => {
  const full = lab.summarizeSweep(makeResults({ 19500: 15, 19760: 13 }));
  assert.equal(full.key, "full-high");
  assert.equal(full.variant, "success");

  const lowerHigh = lab.summarizeSweep(makeResults({ 18500: 15, 19500: 2, 19760: 1 }));
  assert.equal(lowerHigh.key, "lower-high");
  assert.notEqual(lowerHigh.key, "full-high");
  assert.doesNotMatch(lowerHigh.headline, /full/i);
  assert.match(lowerHigh.detail, /do not claim the full/i);

  const lowerHighEdge = lab.summarizeSweep(makeResults({ 18000: 14, 19500: 14, 19760: 3 }));
  assert.equal(lowerHighEdge.key, "lower-high", "one top probe alone must not claim full-high");

  const fallback = lab.summarizeSweep(makeResults({ 16500: 12.5 }));
  assert.equal(fallback.key, "fallback");

  const tentative = lab.summarizeSweep(makeResults({ 18500: 8 }));
  assert.equal(tentative.key, "tentative");

  const incompleteHigh = lab.summarizeSweep(makeResults({ 19500: 16, 19760: 2 }));
  assert.equal(incompleteHigh.key, "tentative", "a strong 19.5 kHz alone must not claim the full band");
  assert.doesNotMatch(incompleteHigh.headline, /none reached 12 dB/i);
  assert.match(incompleteHigh.detail, /pattern is incomplete/i);

  const none = lab.summarizeSweep(makeResults({ 18500: 5.9, 19500: 5.9 }));
  assert.equal(none.key, "none");

  const noData = lab.summarizeSweep([
    { frequency: 19500, margin: null },
    { frequency: 19760, margin: null },
  ]);
  assert.equal(noData.key, "none");
  assert.match(noData.headline, /No usable probe measurements/i);

  assert.equal(lab.summarizeSweep([]).key, "none");
  assert.equal(lab.summarizeSweep(null).key, "none");
  assert.equal(
    lab.summarizeSweep(makeResults({ 19500: 20, 19760: 20, 15500: 20 })).key,
    "full-high",
    "full-high takes precedence when fallback is also strong"
  );
});

test("tone plan is non-overlapping with a 6 ms fade on every tone", () => {
  const plan = lab.buildTonePlan(lab.PROBE_FREQUENCIES, {
    startTime: 1.5,
    toneDurationMs: 700,
    gapMs: 250,
    fadeMs: 6,
    level: 0.08,
  });

  assert.equal(plan.length, 7);
  assert.equal(plan[0].startTime, 1.5);
  for (let index = 0; index < plan.length; index += 1) {
    const entry = plan[index];
    assert.equal(entry.fadeMs, 6);
    assert.ok(Math.abs(entry.endTime - entry.startTime - 0.7) < 1e-12);
    assert.ok(entry.stopTime > entry.endTime);
    assert.ok(Math.abs(entry.fadeInEndTime - entry.startTime - 0.006) < 1e-12);
    assert.ok(Math.abs(entry.endTime - entry.fadeOutStartTime - 0.006) < 1e-12);

    if (index > 0) {
      const previous = plan[index - 1];
      assert.ok(
        entry.startTime >= previous.endTime,
        "tones must not overlap; the 250 ms gap is preserved"
      );
      assert.ok(entry.startTime - previous.endTime >= 0.25 - 1e-12);
    }
  }

  const silencePlan = lab.buildTonePlan([18000], { gapMs: 0 });
  assert.ok(Math.abs(silencePlan[0].endTime - silencePlan[0].startTime - 0.7) < 1e-12);
  assert.throws(() => lab.buildTonePlan([]), RangeError);
  assert.throws(() => lab.buildTonePlan([0]), RangeError);
  assert.throws(() => lab.buildTonePlan([18000], { fadeMs: 400 }), RangeError);
  assert.throws(() => lab.buildTonePlan([18000], { gapMs: -1 }), RangeError);
  assert.throws(() => lab.buildTonePlan([18000], { level: 0 }), RangeError);
});

test("envelope edges start and end at zero, with exactly 6 ms ramps", () => {
  const plan = lab.buildTonePlan([18000], { startTime: 2, fadeMs: 6, level: 0.08 });
  const points = lab.toneEnvelopePoints(plan[0]);

  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { time: 2, value: 0 });
  assert.ok(Math.abs(points[3].time - 2.7) < 1e-12);
  assert.equal(points[3].value, 0);
  assert.ok(Math.abs(points[1].time - points[0].time - 0.006) < 1e-12);
  assert.ok(Math.abs(points[3].time - points[2].time - 0.006) < 1e-12);
  assert.equal(points[1].value, 0.08);
  assert.equal(points[2].value, 0.08);

  const cancel = lab.fadeOutEnvelope(5, 0.08, { fadeMs: 6, tailMs: 6 });
  assert.equal(cancel.points[0].time, 5);
  assert.equal(cancel.points[0].value, 0.08);
  assert.equal(cancel.points[1].value, 0);
  assert.ok(Math.abs(cancel.points[1].time - 5.006) < 1e-12);
  assert.ok(Math.abs(cancel.stopTime - 5.012) < 1e-12);

  assert.throws(() => lab.toneEnvelopePoints(null), RangeError);
  assert.throws(
    () => lab.toneEnvelopePoints({ startTime: 0, endTime: 0.01, fadeMs: 6, level: 0.08 }),
    RangeError
  );
});

test("baseline and tone peak use medians, rejecting spikes and clicks", () => {
  const baselineWindows = Array.from({ length: 25 }, (_, index) => -95 + (index % 3) - 1);
  baselineWindows[7] = -20; // a door slam / click
  baselineWindows[18] = -10; // a second spike

  const baseline = lab.computeBaseline(baselineWindows);
  assert.ok(baseline <= -94 && baseline >= -97, `median baseline stayed near -95, got ${baseline}`);

  const toneWindows = [-42, -41, 15, -43, -42, -41, -42, -44, -41, -42];
  const peak = lab.computeTonePeak(toneWindows);
  assert.ok(peak <= -41 && peak >= -43, `single spike must not become the peak, got ${peak}`);
  assert.notEqual(peak, 15);

  assert.equal(lab.computeBaseline([]), null);
  assert.equal(lab.computeBaseline([NaN, Infinity, null]), null);
  assert.equal(lab.computeTonePeak([]), null);
  assert.equal(lab.computeBaseline([-90]), -90);
  assert.equal(lab.computeTonePeak([-40]), -40);
});

test("baseline completeness gate covers every probe", () => {
  const complete = Object.fromEntries(lab.PROBE_FREQUENCIES.map((frequency) => [frequency, -95]));
  assert.equal(lab.hasCompleteBaseline(complete), true);
  assert.equal(lab.hasCompleteBaseline({ ...complete, 19760: null }), false);
  assert.equal(lab.hasCompleteBaseline(null), false);
});

test("peak hold rises with new peaks and never decays on quieter windows", () => {
  let peak = lab.updatePeakHold(null, -82);
  assert.equal(peak, -82);
  peak = lab.updatePeakHold(peak, -70);
  assert.equal(peak, -70);
  peak = lab.updatePeakHold(peak, -95);
  assert.equal(peak, -70);
  peak = lab.updatePeakHold(peak, NaN);
  assert.equal(peak, -70);
  assert.equal(lab.updatePeakHold(null, null), null);
});

test("meter values clamp into the display range and missing data stays missing", () => {
  assert.equal(lab.clampMeterDb(-120), -100);
  assert.equal(lab.clampMeterDb(3), 0);
  assert.equal(lab.clampMeterDb(-50), -50);
  assert.equal(lab.clampMeterDb(NaN), null);
  assert.equal(lab.clampMeterDb(null), null);

  assert.equal(lab.dbToMeterPercent(-120), 0);
  assert.equal(lab.dbToMeterPercent(3), 100);
  assert.equal(lab.dbToMeterPercent(-50), 50);
  assert.equal(lab.dbToMeterPercent(NaN), null);
});

test("microphone errors map to actionable messages", () => {
  const byName = (name) => lab.mapMicError(Object.assign(new Error("raw"), { name }));

  assert.match(byName("NotAllowedError"), /permission was blocked/i);
  assert.match(byName("NotFoundError"), /No microphone/i);
  assert.match(byName("NotReadableError"), /Another app/i);
  assert.match(byName("OverconstrainedError"), /requested audio settings/i);
  assert.match(byName("SecurityError"), /HTTPS/i);
  assert.match(byName("AbortError"), /interrupted/i);
  assert.equal(lab.mapMicError(new Error("custom setup failure")), "custom setup failure");
  assert.match(lab.mapMicError(null), /Microphone setup failed/i);
});

test("synthetic 19.5 kHz is measurable at 48 kHz and 44.1 kHz", () => {
  for (const sampleRate of [48000, 44100]) {
    const samples = makeSine(19500, sampleRate, 8192, 0.2);
    const db = lab.measureToneDb(samples, sampleRate, 19500, { windowSize: 8192 });
    assert.ok(Number.isFinite(db), `${sampleRate}: measurement must be finite`);
    assert.ok(db > -24 && db < -16, `${sampleRate}: expected about -20 dBFS, got ${db.toFixed(2)}`);

    const bins = lab.measureProbeLevels(samples, sampleRate, [19500, 19760]);
    assert.ok(Number.isFinite(bins[19500]));
    assert.ok(Number.isFinite(bins[19760]));
  }
});

test("19.5 kHz is not recoverable from a 32 kHz recording (aliases to 12.5 kHz)", () => {
  const sampleRate = 32000;
  assert.equal(lab.aliasedFrequency(19500, sampleRate), 12500);

  const aliased = makeSine(19500, sampleRate, 8192, 0.2);
  assert.equal(lab.measureToneDb(aliased, sampleRate, 19500), null, "probe at/above Nyquist is skipped");
  const aliasDb = lab.measureToneDb(aliased, sampleRate, 12500, { windowSize: 8192 });
  assert.ok(aliasDb > -24 && aliasDb < -16, `alias appears at 12.5 kHz, got ${aliasDb}`);

  const bins = lab.measureProbeLevels(aliased, sampleRate, [19500, 15500]);
  assert.equal(bins[19500], null);
  assert.ok(Number.isFinite(bins[15500]), "15.5 kHz is below the 16 kHz Nyquist limit");
});

test("report formatter includes device, baseline, measurements and an honest recommendation", () => {
  const results = lab.PROBES.map(({ frequency, band }) => {
    const margin = frequency === 19500 ? 15 : frequency === 19760 ? 13 : frequency === 18500 ? 10 : 2;
    return {
      frequency,
      band,
      baseline: -96,
      peakDb: -96 + margin,
      margin,
      verdict: lab.getVerdict(margin),
    };
  });
  const baseline = Object.fromEntries(lab.PROBE_FREQUENCIES.map((frequency) => [frequency, -96]));
  const report = lab.formatLabReport({
    generatedAt: "2026-10-23T00:00:00.000Z",
    device: {
      contextSampleRate: 48000,
      trackSampleRate: 44100,
      processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      channelCount: 1,
      worklet: true,
      windowSize: 4096,
      warning: "Track rate not reported.",
      userAgent: "TestBrowser/1.0",
    },
    baseline,
    results,
  });

  assert.match(report, /acoustic capability lab report/i);
  assert.match(report, /Generated: 2026-10-23T00:00:00.000Z/);
  assert.match(report, /AudioContext sample rate: 48000 Hz/);
  assert.match(report, /Microphone sample rate: 44100 Hz/);
  assert.match(report, /Echo cancellation applied: off/);
  assert.match(report, /Noise suppression applied: off/);
  assert.match(report, /Auto gain control applied: on/);
  assert.match(report, /Microphone channels: 1/);
  assert.match(report, /AudioWorklet: available/);
  assert.match(report, /18.50 kHz \(coarse\): -96.0 dB/);
  assert.match(report, /19.50 kHz \| coarse \| -96.0 dB \| -81.0 dB \| 15.0 dB \| Strong/);
  assert.match(report, /Recommendation: /);
  assert.match(report, /full 18-19.8|top of the 18-19.8/i);
  assert.match(report, /No attendance claim/);

  const missing = lab.formatLabReport({
    generatedAt: "2026-10-23T00:00:00.000Z",
    device: null,
    baseline: null,
    results: [{ frequency: 19500, baseline: -95, peakDb: null, margin: null }],
  });
  assert.match(missing, /not measured/);
  assert.doesNotMatch(missing, /-120\.0 dB/);
});
