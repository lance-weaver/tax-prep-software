/**
 * Fill an OTS input template in place.
 *
 * The solvers read labels in order and reject a file that skips one, so the
 * adapter never builds a form from scratch. It copies the upstream template
 * for that year and writes values onto the existing lines. A missing label
 * throws, which is the signal that a yearly template rename needs a one-line
 * adapter update.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLine(lines: string[], label: string): number {
  const re = new RegExp(
    `^(\\s*${escapeRegExp(label)})(?![A-Za-z0-9_])(.*)$`,
  );
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  throw new Error(
    `OTS template is missing "${label}". A yearly update renamed or removed it; see src/lib/ots/ADAPTER.md.`,
  );
}

function splitComment(rest: string): { code: string; comment: string } {
  const at = rest.indexOf("{");
  if (at < 0) return { code: rest, comment: "" };
  return { code: rest.slice(0, at), comment: " " + rest.slice(at) };
}

export function money(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function setNumeric(src: string, label: string, value: number): string {
  const lines = src.split("\n");
  const index = findLine(lines, label);
  const match = lines[index].match(
    new RegExp(`^(\\s*${escapeRegExp(label)})(?![A-Za-z0-9_])(.*)$`),
  );
  if (!match) throw new Error(`Could not rewrite ${label}`);
  const { code, comment } = splitComment(match[2]);
  if (code.includes(";")) {
    lines[index] = `${match[1]} ${money(value)} ;${comment}`;
  } else {
    lines[index] = `${match[1]} ${money(value)}${comment}`;
  }
  return lines.join("\n");
}

export function setText(src: string, label: string, value: string): string {
  const safe = value.replace(/[{};\r\n]/g, " ").replace(/\s+/g, " ").trim();
  const lines = src.split("\n");
  const index = findLine(lines, label);
  const match = lines[index].match(
    new RegExp(`^(\\s*${escapeRegExp(label)})(?![A-Za-z0-9_])(.*)$`),
  );
  if (!match) throw new Error(`Could not rewrite ${label}`);
  const { comment } = splitComment(match[2]);
  lines[index] = `${match[1]} ${safe}${comment}`;
  return lines.join("\n");
}

export function yn(value: boolean): string {
  return value ? "Y" : "N";
}
