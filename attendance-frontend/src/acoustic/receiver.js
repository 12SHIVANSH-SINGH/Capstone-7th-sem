/**
 * Rolling PCM buffer + frame extraction for the RX page (slice 1.8).
 *
 * The AudioWorklet posts fixed-size chunks. This module keeps only the recent
 * audio, asks the already-tested fsk.decodeFrame() search for the next frame,
 * and drops the audio that has been consumed. That makes repeated frames count
 * once even though every decode pass sees overlapping audio.
 */

const fsk = require("./fsk");

const createPcmBuffer = () => {
  let chunks = [];
  let startSample = 0;
  let endSample = 0;

  const trimEmpty = () => {
    while (chunks.length > 0 && chunks[0].endSample <= startSample) {
      chunks.shift();
    }
  };

  const append = (samples) => {
    if (!samples || typeof samples.length !== "number" || samples.length === 0) return;
    const copy = samples instanceof Float32Array ? samples : Float32Array.from(samples);
    const chunkStart = endSample;
    chunks.push({ startSample: chunkStart, endSample: chunkStart + copy.length, samples: copy });
    endSample += copy.length;
  };

  const totalSamples = () => Math.max(0, endSample - startSample);

  const readLast = (maxSamples) => {
    const wanted = Math.max(0, Math.floor(Number.isFinite(maxSamples) ? maxSamples : totalSamples()));
    const available = totalSamples();
    const take = Math.min(available, wanted);
    if (take === 0) return { samples: new Float32Array(0), startSample: endSample };

    const from = endSample - take;
    const output = new Float32Array(take);
    let writeAt = 0;
    for (const chunk of chunks) {
      if (chunk.endSample <= from) continue;
      if (chunk.startSample >= from + take) break;
      const sliceStart = Math.max(0, from - chunk.startSample);
      const sliceEnd = Math.min(chunk.samples.length, from + take - chunk.startSample);
      if (sliceEnd <= sliceStart) continue;
      output.set(chunk.samples.subarray(sliceStart, sliceEnd), writeAt);
      writeAt += sliceEnd - sliceStart;
    }
    return { samples: output, startSample: from };
  };

  const dropBefore = (sampleIndex) => {
    const index = Math.max(startSample, Math.floor(Number(sampleIndex) || 0));
    if (index <= startSample) return;
    startSample = Math.min(index, endSample);

    while (chunks.length > 0 && chunks[0].endSample <= startSample) {
      chunks.shift();
    }
    if (chunks.length > 0 && chunks[0].startSample < startSample) {
      const offset = startSample - chunks[0].startSample;
      chunks[0] = {
        startSample,
        endSample: chunks[0].endSample,
        samples: chunks[0].samples.subarray(offset),
      };
    }
    trimEmpty();
  };

  const trimTo = (maxSamples) => {
    const keep = Math.max(0, Math.floor(Number.isFinite(maxSamples) ? maxSamples : 0));
    if (totalSamples() > keep) dropBefore(endSample - keep);
  };

  const reset = () => {
    chunks = [];
    startSample = 0;
    endSample = 0;
  };

  return {
    append,
    totalSamples,
    readLast,
    dropBefore,
    trimTo,
    reset,
    get startSample() {
      return startSample;
    },
    get endSample() {
      return endSample;
    },
  };
};

/**
 * Try one decode pass over the newest audio. Returns the decoded frame with
 * absolute sample positions, or null. Audio through the decoded frame is
 * consumed so the next pass cannot count the same frame twice.
 */
const extractNextFrame = (buffer, options = {}) => {
  const sampleRate = options.sampleRate;
  if (!buffer || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;

  const symbolSamples = Math.round((sampleRate * fsk.SYMBOL_DURATION_MS) / 1000);
  const frameSamples = symbolSamples * fsk.SYMBOL_COUNT;
  const minSamples = options.minSamples ?? frameSamples + Math.round(sampleRate * 0.15);
  const maxSamples = options.maxSamples ?? Math.round(sampleRate * 3.0);
  const keepSamples = options.keepSamples ?? Math.round(sampleRate * 4.0);

  if (buffer.totalSamples() < minSamples) return null;

  const window = buffer.readLast(maxSamples);
  if (window.samples.length < frameSamples) {
    buffer.trimTo(keepSamples);
    return null;
  }

  const decoded = fsk.decodeFrame(window.samples, sampleRate, {
    detectionMarginDb: options.detectionMarginDb ?? fsk.DEFAULT_DETECTION_MARGIN_DB,
  });

  if (!decoded) {
    buffer.trimTo(keepSamples);
    return null;
  }

  const absoluteStart = window.startSample + decoded.frameStartSample;
  const absoluteEnd = absoluteStart + frameSamples;
  buffer.dropBefore(absoluteEnd);

  return {
    ...decoded,
    margin: Math.min(...decoded.margins),
    frameStartSample: absoluteStart,
    frameEndSample: absoluteEnd,
    frameDurationMs: (frameSamples / sampleRate) * 1000,
  };
};

module.exports = {
  createPcmBuffer,
  extractNextFrame,
};
