// Flags are opt-in only. A typo such as "tru" must not enable a test path.
const isTruthyFlag = (value) =>
  /^(1|true|yes|on)$/i.test(String(value ?? "").trim());

module.exports = { isTruthyFlag };
