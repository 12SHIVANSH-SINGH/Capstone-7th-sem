const [majorVersion, minorVersion] = process.versions.node.split(".").map(Number);

// PDF.js 6 requires Node 22.13+ (or 24+). Keeping the check in lockstep with
// the dependency engine avoids a runtime import failure after deployment.
const tooOld = majorVersion < 22 || (majorVersion === 22 && minorVersion < 13);

if (tooOld) {
  console.error(
    `Unsupported Node.js ${process.versions.node}. Use Node.js 22.13+ or 24+ for this backend.`
  );
  process.exit(1);
}
