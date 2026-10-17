class ToneDetectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frequencies = [];
    this.windowSize = 4096;
    this.samples = new Float32Array(this.windowSize);
    this.sampleIndex = 0;

    this.port.onmessage = ({ data }) => {
      if (data?.type !== "configure") return;

      this.frequencies = Array.isArray(data.frequencies) ? data.frequencies : [];
      this.windowSize = Number.isInteger(data.windowSize) ? data.windowSize : 4096;
      this.samples = new Float32Array(this.windowSize);
      this.sampleIndex = 0;
    };
  }

  measureFrequency(frequency) {
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

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!input) return true;
    if (output) output.set(input);

    for (let index = 0; index < input.length; index += 1) {
      this.samples[this.sampleIndex] = input[index];
      this.sampleIndex += 1;

      if (this.sampleIndex === this.windowSize) {
        const bins = Object.fromEntries(
          this.frequencies.map((frequency) => [frequency, this.measureFrequency(frequency)])
        );
        this.port.postMessage({ type: "measurement", bins, sampleRate, windowSize: this.windowSize });
        this.sampleIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("tone-detector", ToneDetectorProcessor);
