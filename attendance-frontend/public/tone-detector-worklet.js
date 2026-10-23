/**
 * Tone detector AudioWorklet for the acoustic capability lab.
 *
 * The UI sends a `configure` message (kept for compatibility) and also passes
 * the same values as `processorOptions`, so the first measurement window is
 * already configured instead of racing the message port.
 *
 * It mixes every input channel to mono, uses a Goertzel filter per probe and
 * posts one message per completed window with `time` / `frameIndex`. Probes at
 * or above Nyquist are reported as `null` instead of inventing a level.
 */

const DEFAULT_WINDOW_SIZE = 4096;
const MIN_WINDOW_SIZE = 256;
const MAX_WINDOW_SIZE = 32768;

class ToneDetectorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frequencies = [];
    this.windowSize = DEFAULT_WINDOW_SIZE;
    this.samples = new Float32Array(this.windowSize);
    this.sampleIndex = 0;
    this.frameIndex = 0;

    this.port.onmessage = ({ data }) => this.configure(data);

    const processorOptions = options && options.processorOptions;
    if (processorOptions) {
      this.configure({ ...processorOptions, type: "configure" });
    }
  }

  configure(data) {
    if (!data || data.type !== "configure") return;

    const requestedWindow = Number(data.windowSize);
    this.windowSize =
      Number.isFinite(requestedWindow) &&
      requestedWindow >= MIN_WINDOW_SIZE &&
      requestedWindow <= MAX_WINDOW_SIZE
        ? Math.floor(requestedWindow)
        : DEFAULT_WINDOW_SIZE;

    this.frequencies = Array.isArray(data.frequencies)
      ? [
          ...new Set(
            data.frequencies
              .filter((frequency) => Number.isFinite(frequency) && frequency > 0)
              .map(Number)
          ),
        ]
      : [];

    this.samples = new Float32Array(this.windowSize);
    this.sampleIndex = 0;
    this.frameIndex = 0;
  }

  measureFrequency(frequency) {
    if (!Number.isFinite(frequency) || frequency <= 0 || frequency >= sampleRate / 2) {
      return null;
    }

    const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
    let previous = 0;
    let previousPrevious = 0;

    for (let index = 0; index < this.samples.length; index += 1) {
      const current = this.samples[index] + coefficient * previous - previousPrevious;
      previousPrevious = previous;
      previous = current;
    }

    const magnitudeSquared =
      previousPrevious * previousPrevious +
      previous * previous -
      coefficient * previous * previousPrevious;
    const normalizedPower = Math.max(magnitudeSquared / (this.windowSize * this.windowSize), 1e-12);
    return 10 * Math.log10(normalizedPower);
  }

  emitMeasurement() {
    const bins = {};
    for (const frequency of this.frequencies) {
      bins[frequency] = this.measureFrequency(frequency);
    }

    const time = typeof currentTime === "number" ? currentTime : 0;
    this.port.postMessage({
      type: "measurement",
      bins,
      levels: this.frequencies.map((frequency) => ({ frequency, db: bins[frequency] })),
      sampleRate,
      windowSize: this.windowSize,
      frameIndex: this.frameIndex,
      time,
      timestamp: time,
    });
    this.frameIndex += 1;
  }

  process(inputs, outputs) {
    const inputChannels = inputs[0] || [];
    if (inputChannels.length === 0 || !inputChannels[0]) return true;

    const frameLength = inputChannels[0].length;
    const output = outputs[0] && outputs[0][0];

    for (let index = 0; index < frameLength; index += 1) {
      let mixed = 0;
      for (let channel = 0; channel < inputChannels.length; channel += 1) {
        const channelData = inputChannels[channel];
        if (channelData && index < channelData.length) mixed += channelData[index];
      }
      mixed /= inputChannels.length;

      if (output && index < output.length) output[index] = mixed;

      if (this.sampleIndex >= this.windowSize) {
        this.emitMeasurement();
        this.sampleIndex = 0;
      }
      this.samples[this.sampleIndex] = mixed;
      this.sampleIndex += 1;
    }

    if (this.sampleIndex >= this.windowSize) {
      this.emitMeasurement();
      this.sampleIndex = 0;
    }

    return true;
  }
}

registerProcessor("tone-detector", ToneDetectorProcessor);
