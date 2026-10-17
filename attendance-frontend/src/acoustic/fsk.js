/**
 * FSK frame codec for the acoustic presence check-in (plan.md section 5).
 *
 * Plain CommonJS on purpose: the same file runs in Node tests
 * (`npm run test:acoustic`) and is imported by the React app.
 *
 * Signal design (starting values from plan.md; tune only with measurements):
 * - 17 tones, 110 Hz apart, from 18.0 kHz to 19.76 kHz.
 * - Tone 0 (18.0 kHz) is the start marker; tones 1..16 carry symbols.
 * - Frame: 2 marker symbols + 7 data symbols + 2 check symbols, 120 ms each (~1.32 s).
 * - Data and check symbols are digits 0..14 (base 15); 15^7 = 170,859,375 keys.
 * - Two consecutive data/check tones are never the same: a digit is carried by
 *   walking the 16 data tones in an order that skips the previous tone, and the
 *   decoder inverts the same rule symbol by symbol.
 * - The 2 check symbols carry a weighted-sum checksum modulo 225.
 * - Every symbol is faded in and out with a 6 ms raised cosine to avoid clicks.
 */

const TONE_COUNT = 17;
const BASE_FREQUENCY_HZ = 18000;
const TONE_SPACING_HZ = 110;
const SYMBOL_DURATION_MS = 120;
const FADE_DURATION_MS = 6;

const MARKER_TONE = 0;
const DATA_TONE_COUNT = 16;
const DATA_SYMBOL_COUNT = 7;
const CHECK_SYMBOL_COUNT = 2;
const SYMBOL_COUNT = 2 + DATA_SYMBOL_COUNT + CHECK_SYMBOL_COUNT;
const DIGIT_RADIX = 15;
const CHECK_MODULUS = DIGIT_RADIX * DIGIT_RADIX;
const CHECK_WEIGHTS = [1, 2, 4, 7, 8, 11, 13];
const INITIAL_PREVIOUS_SLOT = 15;
const MAX_FRAME_VALUE = DIGIT_RADIX ** DATA_SYMBOL_COUNT;

const DEFAULT_DETECTION_MARGIN_DB = 9;
const DECISION_WINDOW_FRACTION = 0.35;
const SEARCH_HOP_MS = 10;
const MIN_MARKER_SPAN_SYMBOLS = 1.5;

const toneFrequency = (toneIndex) => BASE_FREQUENCY_HZ + toneIndex * TONE_SPACING_HZ;

const toneFrequencies = () => Array.from({ length: TONE_COUNT }, (_, index) => toneFrequency(index));

const assertDigits = (digits, expectedLength, label) => {
  if (!Array.isArray(digits) || digits.length !== expectedLength) {
    throw new RangeError(`${label} must be an array of ${expectedLength} digits`);
  }
  digits.forEach((digit, index) => {
    if (!Number.isInteger(digit) || digit < 0 || digit >= DIGIT_RADIX) {
      throw new RangeError(`${label}[${index}] must be an integer from 0 to ${DIGIT_RADIX - 1}`);
    }
  });
};

const valueToDigits = (value) => {
  if (!Number.isInteger(value) || value < 0 || value >= MAX_FRAME_VALUE) {
    throw new RangeError(`value must be an integer from 0 to ${MAX_FRAME_VALUE - 1}`);
  }

  const digits = new Array(DATA_SYMBOL_COUNT);
  let remaining = value;
  for (let index = DATA_SYMBOL_COUNT - 1; index >= 0; index -= 1) {
    digits[index] = remaining % DIGIT_RADIX;
    remaining = Math.floor(remaining / DIGIT_RADIX);
  }
  return digits;
};

const digitsToValue = (digits) => {
  assertDigits(digits, DATA_SYMBOL_COUNT, "digits");
  return digits.reduce((value, digit) => value * DIGIT_RADIX + digit, 0);
};

const checkDigitsFor = (dataDigits) => {
  assertDigits(dataDigits, DATA_SYMBOL_COUNT, "dataDigits");
  let sum = 0;
  for (let index = 0; index < DATA_SYMBOL_COUNT; index += 1) {
    sum += CHECK_WEIGHTS[index] * dataDigits[index];
  }
  const checksum = sum % CHECK_MODULUS;
  return [Math.floor(checksum / DIGIT_RADIX), checksum % DIGIT_RADIX];
};

const checkDigitsMatch = (dataDigits, checkDigits) => {
  const [first, second] = checkDigitsFor(dataDigits);
  return checkDigits[0] === first && checkDigits[1] === second;
};

/**
 * Full 11-tone sequence for the given 7 data digits.
 * This is the bit of "key" that actually becomes sound.
 */
const frameTones = (dataDigits) => {
  assertDigits(dataDigits, DATA_SYMBOL_COUNT, "dataDigits");
  const tones = [MARKER_TONE, MARKER_TONE];
  let previousSlot = INITIAL_PREVIOUS_SLOT;

  for (const digit of [...dataDigits, ...checkDigitsFor(dataDigits)]) {
    const slot = (previousSlot + 1 + digit) % DATA_TONE_COUNT;
    tones.push(slot + 1);
    previousSlot = slot;
  }
  return tones;
};

/**
 * Invert a tone sequence back to digits; null if it is not a valid frame.
 * Enforces the marker, the no-adjacent-repeat chain and the checksum.
 */
const decodeToneSequence = (toneSequence) => {
  if (!Array.isArray(toneSequence) || toneSequence.length !== SYMBOL_COUNT) return null;
  if (toneSequence[0] !== MARKER_TONE || toneSequence[1] !== MARKER_TONE) return null;

  const digits = [];
  let previousSlot = INITIAL_PREVIOUS_SLOT;
  for (let index = 2; index < SYMBOL_COUNT; index += 1) {
    const tone = toneSequence[index];
    if (!Number.isInteger(tone) || tone < 1 || tone > DATA_TONE_COUNT) return null;

    const slot = tone - 1;
    const digit = ((slot - previousSlot - 1) % DATA_TONE_COUNT + DATA_TONE_COUNT) % DATA_TONE_COUNT;
    if (digit >= DIGIT_RADIX) return null;

    digits.push(digit);
    previousSlot = slot;
  }

  const dataDigits = digits.slice(0, DATA_SYMBOL_COUNT);
  const checkDigits = digits.slice(DATA_SYMBOL_COUNT);
  if (!checkDigitsMatch(dataDigits, checkDigits)) return null;

  return { dataDigits, checkDigits, toneSequence: [...toneSequence] };
};

const symbolEnvelope = (index, symbolSamples, fadeSamples) => {
  if (index < fadeSamples) {
    return 0.5 - 0.5 * Math.cos((Math.PI * index) / fadeSamples);
  }
  const remaining = symbolSamples - 1 - index;
  if (remaining < fadeSamples) {
    return 0.5 - 0.5 * Math.cos((Math.PI * remaining) / fadeSamples);
  }
  return 1;
};

/**
 * Synthesize one frame. Returns the raw mono samples plus the tone plan.
 */
const encodeFrame = (dataDigits, sampleRate, options = {}) => {
  const amplitude = options.amplitude ?? 1;
  const symbolSamples = Math.round((sampleRate * SYMBOL_DURATION_MS) / 1000);
  const fadeSamples = Math.max(1, Math.round((sampleRate * FADE_DURATION_MS) / 1000));
  const toneSequence = frameTones(dataDigits);
  const samples = new Float32Array(symbolSamples * toneSequence.length);

  toneSequence.forEach((tone, symbolIndex) => {
    const frequency = toneFrequency(tone);
    const offset = symbolIndex * symbolSamples;
    for (let index = 0; index < symbolSamples; index += 1) {
      const envelope = symbolEnvelope(index, symbolSamples, fadeSamples);
      samples[offset + index] +=
        amplitude * envelope * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
    }
  });

  return {
    samples,
    sampleRate,
    symbolSamples,
    toneSequence,
    dataDigits: [...dataDigits],
    checkDigits: checkDigitsFor(dataDigits),
  };
};

const singleTonePowerDb = (samples, start, windowSize, sampleRate, frequency) => {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
  let previous = 0;
  let previousPrevious = 0;
  const end = start + windowSize;

  for (let index = start; index < end; index += 1) {
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

/**
 * Goertzel measurement of all 17 tones over one window.
 * Detection rule from plan.md: a tone counts only if ~9 dB above the median.
 */
const measureTones = (samples, start, windowSize, sampleRate) => {
  const db = new Array(TONE_COUNT);
  for (let tone = 0; tone < TONE_COUNT; tone += 1) {
    db[tone] = singleTonePowerDb(samples, start, windowSize, sampleRate, toneFrequency(tone));
  }

  const sorted = [...db].sort((left, right) => left - right);
  const median = sorted[(TONE_COUNT - 1) >> 1];
  let loudestTone = 0;
  for (let tone = 1; tone < TONE_COUNT; tone += 1) {
    if (db[tone] > db[loudestTone]) loudestTone = tone;
  }

  return { tone: loudestTone, margin: db[loudestTone] - median, db, median };
};

/**
 * Try to read the 11 symbols assuming the frame starts exactly at startSample.
 */
const decodeAtStart = (samples, sampleRate, startSample, detectionMarginDb) => {
  const symbolSamples = Math.round((sampleRate * SYMBOL_DURATION_MS) / 1000);
  const windowSize = Math.max(512, Math.round(symbolSamples * DECISION_WINDOW_FRACTION));
  const frameSamples = symbolSamples * SYMBOL_COUNT;

  if (startSample < 0 || startSample + frameSamples > samples.length) return null;

  const tones = [];
  const margins = [];
  for (let symbolIndex = 0; symbolIndex < SYMBOL_COUNT; symbolIndex += 1) {
    const center = startSample + symbolIndex * symbolSamples + Math.floor(symbolSamples / 2);
    const windowStart = center - Math.floor(windowSize / 2);
    const measurement = measureTones(samples, windowStart, windowSize, sampleRate);
    if (measurement.margin < detectionMarginDb) return null;
    tones.push(measurement.tone);
    margins.push(measurement.margin);
  }

  const decoded = decodeToneSequence(tones);
  if (!decoded) return null;

  return {
    ...decoded,
    margins,
    frameStartSample: startSample,
    windowSize,
  };
};

/**
 * Find and decode one frame in a buffer.
 * With `expectedStartSample` the decoder trusts the caller's timing;
 * otherwise it hunts for the two-symbol marker burst and aligns to it.
 */
const decodeFrame = (samples, sampleRate, options = {}) => {
  const detectionMarginDb = options.detectionMarginDb ?? DEFAULT_DETECTION_MARGIN_DB;

  if (options.expectedStartSample != null) {
    return decodeAtStart(samples, sampleRate, options.expectedStartSample, detectionMarginDb);
  }

  const symbolSamples = Math.round((sampleRate * SYMBOL_DURATION_MS) / 1000);
  const windowSize = Math.max(512, Math.round(symbolSamples * DECISION_WINDOW_FRACTION));
  const hopSamples = Math.max(1, Math.round((sampleRate * SEARCH_HOP_MS) / 1000));
  const minMarkerSpan = MIN_MARKER_SPAN_SYMBOLS * symbolSamples;

  const markerStarts = [];
  for (let start = 0; start + windowSize <= samples.length; start += hopSamples) {
    const measurement = measureTones(samples, start, windowSize, sampleRate);
    if (measurement.tone === MARKER_TONE && measurement.margin >= detectionMarginDb) {
      markerStarts.push(start);
    }
  }

  // Group the passing windows into marker runs (one-hop gaps allowed).
  const runs = [];
  for (const start of markerStarts) {
    const current = runs[runs.length - 1];
    if (current && start - current.lastStart <= 2 * hopSamples) {
      current.lastStart = start;
    } else {
      runs.push({ firstStart: start, lastStart: start });
    }
  }

  for (const run of runs) {
    const span = run.lastStart + windowSize - run.firstStart;
    if (span < minMarkerSpan) continue;

    const estimate = Math.round((run.firstStart + run.lastStart + windowSize) / 2 - symbolSamples);
    for (const offset of [0, -hopSamples, hopSamples, -2 * hopSamples, 2 * hopSamples, -3 * hopSamples, 3 * hopSamples]) {
      const decoded = decodeAtStart(samples, sampleRate, estimate + offset, detectionMarginDb);
      if (decoded) return decoded;
    }
  }

  return null;
};

module.exports = {
  TONE_COUNT,
  BASE_FREQUENCY_HZ,
  TONE_SPACING_HZ,
  SYMBOL_DURATION_MS,
  FADE_DURATION_MS,
  MARKER_TONE,
  DATA_TONE_COUNT,
  DATA_SYMBOL_COUNT,
  CHECK_SYMBOL_COUNT,
  SYMBOL_COUNT,
  DIGIT_RADIX,
  CHECK_MODULUS,
  CHECK_WEIGHTS,
  INITIAL_PREVIOUS_SLOT,
  MAX_FRAME_VALUE,
  DEFAULT_DETECTION_MARGIN_DB,
  toneFrequency,
  toneFrequencies,
  valueToDigits,
  digitsToValue,
  checkDigitsFor,
  frameTones,
  decodeToneSequence,
  encodeFrame,
  measureTones,
  decodeFrame,
};
