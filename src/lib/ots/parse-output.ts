/** Pull `Label = number` lines out of an OTS `*_out.txt` file. */

const LINE =
  /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/;

export function parseOtsNumbers(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(LINE);
    if (!match) continue;
    out[match[1]] = Number(match[2].replace(/,/g, ""));
  }
  return out;
}

export function requireLine(
  values: Record<string, number>,
  label: string,
  file: string,
): number {
  const value = values[label];
  if (value === undefined || Number.isNaN(value)) {
    throw new Error(`OpenTaxSolver output ${file} is missing ${label}.`);
  }
  return value;
}

export function otsFailed(text: string): string | null {
  const hit = text
    .split(/\r?\n/)
    .find((line) => /^(ERROR|Error:)/.test(line.trim()));
  return hit ? hit.trim() : null;
}
