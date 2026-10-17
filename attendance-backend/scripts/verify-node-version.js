const majorVersion = Number(process.versions.node.split(".")[0]);

if (majorVersion < 22) {
  console.error(
    `Unsupported Node.js ${process.versions.node}. Use Node.js 22 LTS or newer for this backend.`
  );
  process.exit(1);
}
