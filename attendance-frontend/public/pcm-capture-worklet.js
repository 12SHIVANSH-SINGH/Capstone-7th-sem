/**
 * PCM capture AudioWorklet for the two-phone RX page (slice 1.8).
 *
 * It mixes every input channel to mono, buffers fixed-size chunks and posts
 * each chunk to the main thread with a transferable Float32Array. The main
 * thread keeps a rolling buffer and runs the tested fsk.decodeFrame() search.
 *
 * No tone detection happens here on purpose: the RX path must use exactly the
 * same codec/decoder that the Node tests cover.
 */

const DEFAULT_CHUNK_SIZE = 4096;
const MIN_CHUNK_SIZE = 512;
const MAX_CHUNK_SIZE = 32768;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requested = options && options.processorOptions && options.processorOptions.chunkSize;
    this.chunkSize =
      Number.isFinite(requested) && requested >= MIN_CHUNK_SIZE && requested <= MAX_CHUNK_SIZE
        ? Math.floor(requested)
        : DEFAULT_CHUNK_SIZE;
    this.buffer = new Float32Array(this.chunkSize);
    this.writeIndex = 0;
    this.frameIndex = 0;
    this.squareSum = 0;
  }

  flush() {
    const samples = this.buffer;
    const rms = Math.sqrt(this.squareSum / Math.max(1, samples.length));
    const message = {
      type: "pcm",
      samples,
      sampleRate,
      frameIndex: this.frameIndex,
      time: typeof currentTime === "number" ? currentTime : 0,
      rms,
    };

    try {
      this.port.postMessage(message, [samples.buffer]);
    } catch {
      // Some test harnesses do not implement the transfer-list argument.
      this.port.postMessage(message);
    }

    this.frameIndex += 1;
    this.buffer = new Float32Array(this.chunkSize);
    this.writeIndex = 0;
    this.squareSum = 0;
  }

  process(inputs) {
    const inputChannels = inputs[0] || [];
    if (inputChannels.length === 0 || !inputChannels[0]) return true;

    const frameLength = inputChannels[0].length;
    for (let index = 0; index < frameLength; index += 1) {
      let mixed = 0;
      for (let channel = 0; channel < inputChannels.length; channel += 1) {
        const data = inputChannels[channel];
        if (data && index < data.length) mixed += data[index];
      }
      mixed /= inputChannels.length;

      this.buffer[this.writeIndex] = mixed;
      this.writeIndex += 1;
      this.squareSum += mixed * mixed;

      if (this.writeIndex >= this.chunkSize) this.flush();
    }

    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
