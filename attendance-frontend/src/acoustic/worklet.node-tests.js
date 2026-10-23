/**
 * Node tests for the real tone-detector AudioWorklet (Layer 1, slice 3a).
 *
 * The worklet is loaded in node:vm with minimal stubs for the three worklet
 * globals. No browser and no audio hardware: buffers are synthetic sine waves.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WORKLET_PATH = path.resolve(__dirname, "../../public/tone-detector-worklet.js");
const WORKLET_SOURCE = fs.readFileSync(WORKLET_PATH, "utf8");
const BLOCK_SIZE = 128;

const loadWorklet = ({ sampleRate = 48000, processorOptions } = {}) => {
  let Processor = null;
  let registeredName = null;
  const messages = [];

  const context = {
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {
          onmessage: null,
          postMessage: (message) => messages.push(message),
          close: () => {},
        };
      }
    },
    Float32Array,
    Math,
    Number,
    Array,
    Object,
    Set,
    console,
    sampleRate,
    currentTime: 0,
    registerProcessor: (name, constructor) => {
      registeredName = name;
      Processor = constructor;
    },
  };

  vm.createContext(context);
  vm.runInContext(WORKLET_SOURCE, context, { filename: WORKLET_PATH });
  assert.ok(Processor, "worklet must register a processor");
  const processor = new Processor({ processorOptions });

  return { processor, messages, context, registeredName };
};

const makeSineBlock = (frequency, sampleRate, startSample, amplitude = 0.2) => {
  const block = new Float32Array(BLOCK_SIZE);
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    block[index] =
      amplitude * Math.sin((2 * Math.PI * frequency * (startSample + index)) / sampleRate);
  }
  return block;
};

const processBlocks = (processor, context, channelsForBlock, blockCount, startSample = 0, sampleRate = 48000) => {
  let sample = startSample;
  const outputs = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const output = new Float32Array(BLOCK_SIZE);
    const inputChannels = channelsForBlock(blockIndex, sample);
    processor.process([inputChannels], [[output]]);
    outputs.push(output);
    sample += BLOCK_SIZE;
    context.currentTime = sample / sampleRate;
  }
  return outputs;
};

test("worklet registers the expected processor name", () => {
  const { registeredName } = loadWorklet();
  assert.equal(registeredName, "tone-detector");
});

test("processorOptions configure the worklet before the first window (no message race)", () => {
  const { processor, messages, context } = loadWorklet({
    processorOptions: { frequencies: [19500, 24000], windowSize: 4096 },
  });

  assert.deepEqual(Array.from(processor.frequencies), [19500, 24000]);
  assert.equal(processor.windowSize, 4096);

  let sample = 0;
  const outputs = processBlocks(
    processor,
    context,
    () => {
      const left = makeSineBlock(19500, 48000, sample, 0.2);
      const right = makeSineBlock(19500, 48000, sample, 0.2);
      sample += BLOCK_SIZE;
      return [left, right];
    },
    31
  );

  assert.equal(outputs.length, 31);
  assert.equal(messages.length, 0, "4096 samples must not emit after 31 blocks");

  processBlocks(
    processor,
    context,
    () => {
      const left = makeSineBlock(19500, 48000, sample, 0.2);
      const right = makeSineBlock(19500, 48000, sample, 0.2);
      sample += BLOCK_SIZE;
      return [left, right];
    },
    1
  );

  assert.equal(messages.length, 1, "the 32nd 128-sample block completes the 4096 window");
  const message = messages[0];
  assert.equal(message.type, "measurement");
  assert.equal(message.windowSize, 4096);
  assert.equal(message.frameIndex, 0);
  assert.equal(message.sampleRate, 48000);
  assert.equal(typeof message.time, "number");
  assert.equal(message.time, message.timestamp);
  assert.ok(Number.isFinite(message.bins[19500]));
  assert.ok(message.bins[19500] > -24 && message.bins[19500] < -16);
  assert.equal(message.bins[24000], null, "probe at Nyquist is reported as null");
  assert.equal(message.levels[1].frequency, 24000);
  assert.equal(message.levels[1].db, null);

  processBlocks(
    processor,
    context,
    () => [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)],
    32
  );
  assert.equal(messages.length, 2);
  assert.equal(messages[1].frameIndex, 1);
});

test("all input channels are mixed, not just channel 0", () => {
  const { processor, messages, context } = loadWorklet();
  processor.port.onmessage({
    data: { type: "configure", frequencies: [1000], windowSize: 512 },
  });

  let sample = 0;
  const outputs = processBlocks(
    processor,
    context,
    () => {
      const left = new Float32Array(BLOCK_SIZE);
      const right = makeSineBlock(1000, 48000, sample, 0.5);
      sample += BLOCK_SIZE;
      return [left, right];
    },
    4
  );

  assert.equal(messages.length, 1, "512 samples = 4 blocks");
  assert.ok(
    messages[0].bins[1000] > -40,
    `right channel must reach the mix, got ${messages[0].bins[1000]} dB`
  );

  const sampleIndex = 10;
  const expectedMixed =
    (0.5 * Math.sin((2 * Math.PI * 1000 * sampleIndex) / 48000)) / 2;
  assert.ok(
    Math.abs(outputs[0][sampleIndex] - expectedMixed) < 1e-7,
    "output should be the average of both input channels"
  );
});

test("configure message stays compatible and rejects invalid windowSize/frequencies", () => {
  const { processor } = loadWorklet();

  processor.port.onmessage({
    data: {
      type: "configure",
      frequencies: [1000, -1, 0, "x", NaN, Infinity, 1000],
      windowSize: 42,
    },
  });
  assert.equal(processor.windowSize, 4096, "invalid window falls back to 4096");
  assert.deepEqual(Array.from(processor.frequencies), [1000], "invalid duplicates and frequencies are dropped");

  processor.port.onmessage({
    data: { type: "configure", frequencies: [15500], windowSize: 512 },
  });
  assert.equal(processor.windowSize, 512);
  assert.deepEqual(Array.from(processor.frequencies), [15500]);

  processor.port.onmessage({ data: { type: "something-else", frequencies: [19500] } });
  assert.deepEqual(Array.from(processor.frequencies), [15500], "unknown messages are ignored");
});

test("Nyquist probes are null while sub-Nyquist probes still measure", () => {
  const { processor, messages, context } = loadWorklet({ sampleRate: 32000 });
  processor.port.onmessage({
    data: { type: "configure", frequencies: [15500, 16500, 19500, 19760], windowSize: 256 },
  });

  processBlocks(
    processor,
    context,
    () => [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)],
    2,
    0,
    32000
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].sampleRate, 32000);
  assert.ok(Number.isFinite(messages[0].bins[15500]));
  assert.equal(messages[0].bins[16500], null, "16.5 kHz is above the 16 kHz Nyquist limit");
  assert.equal(messages[0].bins[19500], null);
  assert.equal(messages[0].bins[19760], null);
});

test("silence still produces finite bins and frameIndex advances every window", () => {
  const { processor, messages, context } = loadWorklet({
    processorOptions: { frequencies: [18000], windowSize: 2048 },
  });

  processBlocks(
    processor,
    context,
    () => [new Float32Array(BLOCK_SIZE)],
    16
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].windowSize, 2048);
  assert.ok(Number.isFinite(messages[0].bins[18000]));
  assert.ok(messages[0].bins[18000] <= -100, "silence should not look like a tone");
  assert.equal(messages[0].frameIndex, 0);

  processBlocks(
    processor,
    context,
    () => [new Float32Array(BLOCK_SIZE)],
    16
  );
  assert.equal(messages.length, 2);
  assert.equal(messages[1].frameIndex, 1);
});
