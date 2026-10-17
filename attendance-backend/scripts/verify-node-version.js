const majorVersion = Number(process.versions.node.split(".")[0]);

if (majorVersion < 22 || majorVersion >= 26) {
  console.error(
    `Unsupported Node.js ${process.versions.node}. Use Node.js 24 LTS (or Node 22 LTS) for this backend. Node 26 removed a legacy Buffer API still used by an authentication dependency.`
  );
  process.exit(1);
}
