const INSTITUTIONAL_DOMAIN = "nitjsr.ac.in";

const splitCsvLine = (line) => {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell.trim());
  return { cells, valid: !quoted };
};

const deriveIdentity = (email) => {
  const loginId = email.split("@")[0];
  const match = loginId.match(/^(\d{4})([a-z]+)(\d+)$/i);

  if (!match) {
    return { loginId };
  }

  return {
    loginId,
    batch: match[1],
    programmeBranch: match[2].toUpperCase(),
    rollNumber: match[3],
  };
};

const parseRosterText = (rosterText, { allowedTestEmails = [] } = {}) => {
  if (typeof rosterText !== "string" || !rosterText.trim()) {
    return { entries: [], errors: [{ row: null, message: "Paste a CSV or one college email per line." }] };
  }

  const errors = [];
  const entries = [];
  const seenEmails = new Set();
  const rehearsalEmails = new Set(
    (Array.isArray(allowedTestEmails) ? allowedTestEmails : [])
      .map((email) => String(email || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const isInstitutionalEmail = (email) =>
    email.endsWith(`@${INSTITUTIONAL_DOMAIN}`) && /^[^\s@]+@nitjsr\.ac\.in$/i.test(email);
  const lines = rosterText.replace(/^\uFEFF/, "").split(/\r?\n/);
  let firstDataLine = true;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const row = index + 1;

    if (!line) return;

    const { cells, valid } = splitCsvLine(line);
    if (!valid) {
      errors.push({ row, message: "Unclosed quote in CSV row." });
      return;
    }

    const email = (cells[0] || "").trim().toLowerCase();
    const name = (cells[1] || "").trim();

    if (firstDataLine && ["email", "college email", "student email"].includes(email)) {
      firstDataLine = false;
      return;
    }
    firstDataLine = false;

    if (!isInstitutionalEmail(email) && !rehearsalEmails.has(email)) {
      errors.push({
        row,
        message: rehearsalEmails.size > 0
          ? `Use a valid @${INSTITUTIONAL_DOMAIN} email or an allowlisted rehearsal account.`
          : `Use a valid @${INSTITUTIONAL_DOMAIN} email.`,
      });
      return;
    }

    if (seenEmails.has(email)) {
      errors.push({ row, message: "Duplicate email in this roster." });
      return;
    }

    seenEmails.add(email);
    entries.push({ email, name, identity: deriveIdentity(email) });
  });

  if (entries.length > 250) {
    errors.push({ row: null, message: "A single class roster can contain at most 250 students." });
  }

  return { entries, errors };
};

module.exports = { INSTITUTIONAL_DOMAIN, parseRosterText };
