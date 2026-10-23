/**
 * Node tests for the PCM capture AudioWorklet used by the RX page (1.8).
 * Loaded in node:vm with the three worklet globals stubbed, as the tone
 * detector worklet is. No microphone or browser.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WORKLET_PATH = path.resolve(__dirname, "../../public/pcm-capture-worklet.js");
const WORKLET_SOURCE = fs.readFileSync(WORKLET_PATH, "utf8");
const BLOCK = 128;

const loadWorklet = ({ sampleRate = 48000, processorOptions } = {}) => {
  let Processor = null;
  let registeredName = null;
  const messages = [];

  const context = {
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {
          postMessage: (message, transfer) => messages.push({ message, transfer }),
        };
      }
    },
    Float32Array,
    Math,
    Number,
    Array,
    Object,
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

const feed = (processor, context, channelsForBlock, blockCount, startSample = 0, sampleRate = 48000) => {
  let sample = startSample;
  for (let index = 0; index < blockCount; index += 1) {
    const input = channelsForBlock(index, sample);
    processor.process([input]);
    sample += BLOCK;
    context.currentTime = sample / sampleRate;
  }
};

test("registers the pcm-capture processor", () => {
  const { registeredName } = loadWorklet();
  assert.equal(registeredName, "pcm-capture");
});

test("posts fixed-size chunks with timing, rms and transferable buffers", () => {
  const { processor, messages, context } = loadWorklet({
    processorOptions: { chunkSize: 1024 },
  });

  feed(
    processor,
    context,
    (blockIndex, startSample) => {
      const channel = new Float32Array(BLOCK);
      for (let index = 0; index < BLOCK; index += 1) {
        channel[index] = 0.5 * Math.sin((2 * Math.PI * 440 * (startSample + index)) / 48000);
      }
      return [channel];
    },
    16
  );

  assert.equal(messages.length, 2);
  for (const [index, entry] of messages.entries()) {
    assert.equal(entry.message.type, "pcm");
    assert.equal(entry.message.samples.length, 1024);
    assert.equal(entry.message.sampleRate, 48000);
    assert.equal(entry.message.frameIndex, index);
    assert.ok(entry.message.rms > 0.2);
    assert.ok(entry.message.time > 0);
    assert.equal(entry.transfer.length, 1);
    assert.equal(entry.transfer[0], entry.message.samples.buffer);
  }
});

test("mixes all channels, so a signal only on channel 1 is preserved", () => {
  const { processor, messages, context } = loadWorklet({
    processorOptions: { chunkSize: 512 },
  });

  feed(
    processor,
    context,
    () => [new Float32Array(BLOCK), new Float32Array(BLOCK).fill(0.4)],
    4
  );

  assert.equal(messages.length, 1);
  const samples = messages[0].message.samples;
  assert.equal(samples.length, 512);
  assert.ok(samples.every((sample) => Math.abs(sample - 0.2) < 1e-6));
  assert.ok(messages[0].message.rms > 0.19);
});

test("invalid chunk sizes fall back to 4096 and silence still posts", () => {
  const { processor, messages, context } = loadWorklet({
    processorOptions: { chunkSize: 999999 },
  });
  assert.equal(processor.chunkSize, 4096);

  feed(processor, context, () => [new Float32Array(BLOCK)], 32);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message.samples.length, 4096);
  assert.equal(messages[0].message.rms, 0);
});
