/**
 * Node tests for the FSK frame codec (Layer 1, slices 1.6 + 1.7).
 *
 * Run with: npm run test:acoustic
 * No hardware and no browser: everything is synthetic audio buffers in Node.
 * A seeded PRNG keeps every number reproducible between runs.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const codec = require("./fsk");

const SAMPLE_RATE = 48000;
const SECOND_SAMPLE_RATE = 44100;
const SYMBOL_SAMPLES = Math.round(SAMPLE_RATE * (codec.SYMBOL_DURATION_MS / 1000));

// Deterministic PRNG (mulberry32) so each run reports the same numbers.
const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const randomDigits = (random) =>
  Array.from({ length: codec.DATA_SYMBOL_COUNT }, () => Math.floor(random() * codec.DIGIT_RADIX));

const sameDigits = (left, right) => left.length === right.length && left.every((digit, index) => digit === right[index]);

const addWhiteNoise = (samples, snrDb, random) => {
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  const signalRms = Math.sqrt(sumOfSquares / samples.length);
  const noiseRms = signalRms / 10 ** (snrDb / 20);
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    // Uniform noise in [-1, 1] has RMS 1/sqrt(3).
    output[index] = samples[index] + (random() * 2 - 1) * noiseRms * Math.sqrt(3);
  }
  return output;
};

const addEcho = (samples, sampleRate, taps) => {
  const output = Float32Array.from(samples);
  for (const { delayMs, gain } of taps) {
    const delaySamples = Math.round((sampleRate * delayMs) / 1000);
    for (let index = delaySamples; index < samples.length; index += 1) {
      output[index] += gain * samples[index - delaySamples];
    }
  }
  return output;
};

// Render arbitrary tones with the same fade as the encoder, for false-positive tests.
const renderTones = (toneSequence, sampleRate) => {
  const symbolSamples = Math.round(sampleRate * (codec.SYMBOL_DURATION_MS / 1000));
  const fadeSamples = Math.max(1, Math.round(sampleRate * (codec.FADE_DURATION_MS / 1000)));
  const samples = new Float32Array(symbolSamples * toneSequence.length);
  toneSequence.forEach((tone, symbolIndex) => {
    const frequency = codec.toneFrequency(tone);
    const offset = symbolIndex * symbolSamples;
    for (let index = 0; index < symbolSamples; index += 1) {
      let envelope = 1;
      if (index < fadeSamples) envelope = 0.5 - 0.5 * Math.cos((Math.PI * index) / fadeSamples);
      const remaining = symbolSamples - 1 - index;
      if (remaining < fadeSamples) {
        envelope = Math.min(envelope, 0.5 - 0.5 * Math.cos((Math.PI * remaining) / fadeSamples));
      }
      samples[offset + index] = envelope * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
    }
  });
  return samples;
};

test("frame structure: marker, symbol count, tone grid and no repeated adjacent tone", () => {
  const random = makeRandom(1);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const tones = codec.frameTones(randomDigits(random));
    assert.equal(tones.length, codec.SYMBOL_COUNT);
    assert.equal(tones.length, 11);
    assert.equal(tones[0], codec.MARKER_TONE);
    assert.equal(tones[1], codec.MARKER_TONE);
    for (let index = 2; index < tones.length; index += 1) {
      assert.notEqual(tones[index], tones[index - 1], "adjacent data/check tones must differ");
      assert.ok(tones[index] >= 1 && tones[index] <= codec.DATA_TONE_COUNT);
    }
  }

  // Starting values from plan.md section 5.
  assert.equal(codec.toneFrequency(0), 18000);
  assert.equal(codec.toneFrequency(16), 19760);
  assert.equal(codec.toneFrequency(1) - codec.toneFrequency(0), 110);
  assert.equal(codec.SYMBOL_COUNT * codec.SYMBOL_DURATION_MS, 1320);
  assert.equal(codec.MAX_FRAME_VALUE, 15 ** 7);

  const frame = codec.encodeFrame([0, 1, 2, 3, 4, 5, 6], SAMPLE_RATE);
  assert.equal(frame.samples.length, 11 * SYMBOL_SAMPLES);
  for (let index = 0; index < frame.samples.length; index += 1) {
    assert.ok(Number.isFinite(frame.samples[index]));
    assert.ok(Math.abs(frame.samples[index]) <= 1.0000001);
  }

  // The 6 ms fade means symbol edges start and end near zero (no clicks).
  for (const symbolIndex of [0, 1, 5, 10]) {
    assert.ok(Math.abs(frame.samples[symbolIndex * SYMBOL_SAMPLES]) < 0.05);
    assert.ok(Math.abs(frame.samples[(symbolIndex + 1) * SYMBOL_SAMPLES - 1]) < 0.05);
  }
});

test("value <-> digits round trip over the full key space, with input validation", () => {
  const random = makeRandom(2);
  const values = [0, 1, 14, 15, 15 ** 6, codec.MAX_FRAME_VALUE - 1];
  for (let iteration = 0; iteration < 2000; iteration += 1) {
    values.push(Math.floor(random() * codec.MAX_FRAME_VALUE));
  }
  for (const value of values) {
    assert.equal(codec.digitsToValue(codec.valueToDigits(value)), value);
  }
  assert.throws(() => codec.valueToDigits(-1), RangeError);
  assert.throws(() => codec.valueToDigits(codec.MAX_FRAME_VALUE), RangeError);
  assert.throws(() => codec.valueToDigits(1.5), RangeError);
  assert.throws(() => codec.frameTones([0, 1, 2, 3, 4, 5, 15]), RangeError);
  assert.throws(() => codec.frameTones([0, 1, 2, 3, 4, 5]), RangeError);
});

test("tone sequence inverts for 1000 random keys and rejects broken frames", () => {
  const random = makeRandom(3);
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    const digits = randomDigits(random);
    const decoded = codec.decodeToneSequence(codec.frameTones(digits));
    assert.ok(decoded, "valid sequence must decode");
    assert.ok(sameDigits(decoded.dataDigits, digits));
  }

  const digits = [3, 1, 4, 1, 5, 9, 2];
  const tones = codec.frameTones(digits);
  assert.equal(codec.decodeToneSequence([1, ...tones.slice(1)]), null, "wrong first marker");
  assert.equal(codec.decodeToneSequence([0, 1, ...tones.slice(2)]), null, "wrong second marker");
  assert.equal(codec.decodeToneSequence(tones.slice(0, 10)), null, "short sequence");

  const repeated = [...tones];
  repeated[3] = repeated[2];
  assert.equal(codec.decodeToneSequence(repeated), null, "repeated adjacent tone");

  const brokenCheck = [...tones];
  brokenCheck[10] = brokenCheck[10] === 1 ? 2 : 1;
  assert.equal(codec.decodeToneSequence(brokenCheck), null, "wrong check symbol");
});

test("encode then decode 1000 random keys from synthetic audio at 48 kHz", () => {
  const random = makeRandom(4);
  let decodedCount = 0;
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    const digits = randomDigits(random);
    const frame = codec.encodeFrame(digits, SAMPLE_RATE);
    const decoded = codec.decodeFrame(frame.samples, SAMPLE_RATE, { expectedStartSample: 0 });
    assert.ok(decoded, `key ${codec.digitsToValue(digits)} was not decoded`);
    assert.ok(sameDigits(decoded.dataDigits, digits));
    decodedCount += 1;
  }
  console.log(`[audio] clean, 48 kHz: ${decodedCount}/1000 keys decoded`);
  assert.equal(decodedCount, 1000);
});

test("the same 200 keys decode at 44.1 kHz", () => {
  const random = makeRandom(5);
  let decodedCount = 0;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const digits = randomDigits(random);
    const frame = codec.encodeFrame(digits, SECOND_SAMPLE_RATE);
    const decoded = codec.decodeFrame(frame.samples, SECOND_SAMPLE_RATE, { expectedStartSample: 0 });
    assert.ok(decoded, `key ${codec.digitsToValue(digits)} was not decoded at 44.1 kHz`);
    assert.ok(sameDigits(decoded.dataDigits, digits));
    decodedCount += 1;
  }
  console.log(`[audio] clean, 44.1 kHz: ${decodedCount}/200 keys decoded`);
  assert.equal(decodedCount, 200);
});

test("decoder finds frames behind 0-500 ms of leading silence (search mode)", () => {
  const random = makeRandom(6);
  const trials = 100;
  let found = 0;
  for (let iteration = 0; iteration < trials; iteration += 1) {
    const digits = randomDigits(random);
    const frame = codec.encodeFrame(digits, SAMPLE_RATE);
    const padSamples = Math.floor(random() * Math.round(SAMPLE_RATE * 0.5));
    const buffer = new Float32Array(padSamples + frame.samples.length + 480);
    buffer.set(frame.samples, padSamples);

    const decoded = codec.decodeFrame(buffer, SAMPLE_RATE);
    if (decoded && sameDigits(decoded.dataDigits, digits)) found += 1;
  }
  console.log(`[search] leading silence 0-500 ms: ${found}/${trials} frames found`);
  assert.equal(found, trials);
});

test("decode rate at several noise levels", () => {
  const random = makeRandom(7);
  const levels = [30, 20, 10, 0];
  const keysPerLevel = 100;
  const keys = Array.from({ length: keysPerLevel }, () => randomDigits(random));
  const results = new Map();

  for (const snrDb of levels) {
    let decodedCount = 0;
    for (const digits of keys) {
      const frame = codec.encodeFrame(digits, SAMPLE_RATE);
      const noisy = addWhiteNoise(frame.samples, snrDb, random);
      const decoded = codec.decodeFrame(noisy, SAMPLE_RATE, { expectedStartSample: 0 });
      if (decoded && sameDigits(decoded.dataDigits, digits)) decodedCount += 1;
    }
    results.set(snrDb, decodedCount);
    console.log(`[noise] full-band SNR ${snrDb} dB: ${decodedCount}/${keysPerLevel} decoded`);
  }

  assert.equal(results.get(30), keysPerLevel);
  assert.ok(results.get(20) >= keysPerLevel * 0.99, ">=99% expected at 20 dB");
  // 10 dB and 0 dB are reported for the Layer 1 notes; no hard target set yet.
});

test("single echo tap does not break decoding (echo plus noise reported)", () => {
  const random = makeRandom(8);
  const configs = [
    { delayMs: 30, gain: 0.5 },
    { delayMs: 60, gain: 0.5 },
    { delayMs: 90, gain: 0.5 },
    { delayMs: 60, gain: 0.5, snrDb: 10 },
  ];
  const trials = 50;

  for (const config of configs) {
    let decodedCount = 0;
    for (let iteration = 0; iteration < trials; iteration += 1) {
      const digits = randomDigits(random);
      const frame = codec.encodeFrame(digits, SAMPLE_RATE);
      let buffer = addEcho(frame.samples, SAMPLE_RATE, [config]);
      if (config.snrDb != null) buffer = addWhiteNoise(buffer, config.snrDb, random);

      const decoded = codec.decodeFrame(buffer, SAMPLE_RATE, { expectedStartSample: 0 });
      if (decoded && sameDigits(decoded.dataDigits, digits)) decodedCount += 1;
    }
    const label = `delay ${config.delayMs} ms, gain ${config.gain}${config.snrDb != null ? ` + ${config.snrDb} dB noise` : ""}`;
    console.log(`[echo] ${label}: ${decodedCount}/${trials} decoded`);
    if (config.snrDb == null) {
      assert.ok(decodedCount >= trials * 0.95, `>=95% expected without noise (${label})`);
    }
  }
});

test("false-positive rate on audio that contains no valid frame", () => {
  const random = makeRandom(9);
  const frameSamples = 11 * SYMBOL_SAMPLES;
  const noiseTrials = 100;
  let acceptedFromNoise = 0;

  for (let iteration = 0; iteration < noiseTrials; iteration += 1) {
    const padSamples = Math.floor(random() * Math.round(SAMPLE_RATE * 0.3));
    const noise = new Float32Array(frameSamples + padSamples);
    for (let index = 0; index < noise.length; index += 1) noise[index] = random() * 2 - 1;
    if (codec.decodeFrame(noise, SAMPLE_RATE)) acceptedFromNoise += 1;
  }
  console.log(`[false-positive] white noise only: ${acceptedFromNoise}/${noiseTrials} accepted`);

  const toneTrials = 30;
  let acceptedFromTones = 0;
  for (let iteration = 0; iteration < toneTrials; iteration += 1) {
    const toneSequence = Array.from({ length: codec.SYMBOL_COUNT }, () => Math.floor(random() * codec.TONE_COUNT));
    if (codec.decodeFrame(renderTones(toneSequence, SAMPLE_RATE), SAMPLE_RATE)) acceptedFromTones += 1;
  }
  console.log(`[false-positive] random tone sequences: ${acceptedFromTones}/${toneTrials} accepted`);

  assert.equal(acceptedFromNoise, 0);
  assert.equal(acceptedFromTones, 0);
});

test("checksum rejects symbols that flip during detection", () => {
  const random = makeRandom(10);
  const trials = 200;
  let singleAccepted = 0;
  let doubleAccepted = 0;

  // Corrupt the transmitted tone sequence, not the digits: the check symbols
  // still belong to the original key, which is exactly what a mis-detection looks like.
  for (let iteration = 0; iteration < trials; iteration += 1) {
    const digits = randomDigits(random);
    const tones = codec.frameTones(digits);
    const position = Math.floor(random() * codec.DATA_SYMBOL_COUNT);
    const symbolIndex = 2 + position;
    let replacement = 1 + Math.floor(random() * codec.DATA_TONE_COUNT);
    if (replacement === tones[symbolIndex]) replacement = (replacement % codec.DATA_TONE_COUNT) + 1;
    const corrupted = [...tones];
    corrupted[symbolIndex] = replacement;

    if (codec.decodeFrame(renderTones(corrupted, SAMPLE_RATE), SAMPLE_RATE, { expectedStartSample: 0 })) singleAccepted += 1;
  }
  console.log(`[corruption] single-symbol tone flips: ${singleAccepted}/${trials} accepted`);

  for (let iteration = 0; iteration < trials; iteration += 1) {
    const digits = randomDigits(random);
    const tones = codec.frameTones(digits);
    const first = Math.floor(random() * codec.DATA_SYMBOL_COUNT);
    let second = Math.floor(random() * codec.DATA_SYMBOL_COUNT);
    if (second === first) second = (second + 1) % codec.DATA_SYMBOL_COUNT;
    const corrupted = [...tones];
    for (const position of [first, second]) {
      const symbolIndex = 2 + position;
      let replacement = 1 + Math.floor(random() * codec.DATA_TONE_COUNT);
      if (replacement === corrupted[symbolIndex]) replacement = (replacement % codec.DATA_TONE_COUNT) + 1;
      corrupted[symbolIndex] = replacement;
    }

    if (codec.decodeFrame(renderTones(corrupted, SAMPLE_RATE), SAMPLE_RATE, { expectedStartSample: 0 })) doubleAccepted += 1;
  }
  console.log(`[corruption] two-symbol tone flips: ${doubleAccepted}/${trials} accepted (checksum collisions)`);

  // A single flipped data symbol always changes the weighted checksum, so it must never pass.
  assert.equal(singleAccepted, 0);
  assert.ok(doubleAccepted <= 5, "checksum collisions should stay rare (about 1 in 225)");
});

test("detection rule: silence is quiet, a played tone is detected with a healthy margin", () => {
  const silence = new Float32Array(SYMBOL_SAMPLES * 2);
  const quiet = codec.measureTones(silence, 0, Math.round(SYMBOL_SAMPLES * 0.35), SAMPLE_RATE);
  assert.ok(quiet.margin < codec.DEFAULT_DETECTION_MARGIN_DB);

  const frame = codec.encodeFrame([0, 0, 0, 0, 0, 0, 0], SAMPLE_RATE);
  const windowSize = Math.round(SYMBOL_SAMPLES * 0.35);
  // Second symbol = marker tone; take the middle of it.
  const center = SYMBOL_SAMPLES + Math.floor(SYMBOL_SAMPLES / 2);
  const measured = codec.measureTones(frame.samples, center - Math.floor(windowSize / 2), windowSize, SAMPLE_RATE);
  assert.equal(measured.tone, codec.MARKER_TONE);
  assert.ok(measured.margin >= codec.DEFAULT_DETECTION_MARGIN_DB);
});

test("rejects truncated and empty buffers", () => {
  const frame = codec.encodeFrame([1, 2, 3, 4, 5, 6, 7], SAMPLE_RATE);
  const half = frame.samples.slice(0, Math.floor(frame.samples.length / 2));
  assert.equal(codec.decodeFrame(half, SAMPLE_RATE), null);
  assert.equal(codec.decodeFrame(half, SAMPLE_RATE, { expectedStartSample: 0 }), null);
  assert.equal(codec.decodeFrame(new Float32Array(0), SAMPLE_RATE), null);
  assert.equal(codec.decodeFrame(frame.samples, SAMPLE_RATE, { expectedStartSample: 999999 }), null);
});
