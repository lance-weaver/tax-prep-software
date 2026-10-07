/**
 * Best-effort prefill from a broker CSV. This is not a Robinhood PDF import.
 *
 * Recognized layouts (headers are matched case-insensitively):
 * 1. Summary rows: columns `kind` and `amount`
 *    kinds: ordinary_dividends, qualified_dividends, capital_gain_distributions,
 *    short_term_gain, long_term_gain
 * 2. 1099-B lots: `proceeds` and `cost` (or `cost_basis`), plus `term`
 *    (`short` / `long`) or acquired and sold dates.
 * 3. Box rows: `form`, `box`, and `amount`, optional `term`.
 *    DIV box 1a / 1b / 2a, and B gain when `term` is set.
 */

export interface BrokerTotals {
  ordinaryDividends: number;
  qualifiedDividends: number;
  capitalGainDistributions: number;
  shortTermGain: number;
  longTermGain: number;
  recognized: string[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function num(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned || cleaned === "-") return 0;
  const paren = cleaned.match(/^\((.+)\)$/);
  const parsed = Number(paren ? `-${paren[1]}` : cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function col(header: string[], names: string[]): number {
  for (const name of names) {
    const index = header.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

function termOf(value: string, acquired: string, sold: string): "short" | "long" | null {
  const text = value.toLowerCase();
  if (text.startsWith("s") || text.includes("short")) return "short";
  if (text.startsWith("l") || text.includes("long")) return "long";
  const a = Date.parse(acquired);
  const s = Date.parse(sold);
  if (Number.isFinite(a) && Number.isFinite(s)) {
    return s - a > 1000 * 60 * 60 * 24 * 366 ? "long" : "short";
  }
  return null;
}

export function parseBrokerCsv(text: string): BrokerTotals {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new Error("The CSV needs a header row and at least one data row.");
  }
  const header = rows[0].map(headerKey);
  const totals: BrokerTotals = {
    ordinaryDividends: 0,
    qualifiedDividends: 0,
    capitalGainDistributions: 0,
    shortTermGain: 0,
    longTermGain: 0,
    recognized: [],
  };

  const kindCol = col(header, ["kind", "category", "type"]);
  const amountCol = col(header, ["amount", "value"]);
  const proceedsCol = col(header, ["proceeds", "sales_proceeds", "box_1d"]);
  const costCol = col(header, ["cost", "cost_basis", "cost_or_other_basis", "box_1e"]);
  const gainCol = col(header, ["gain", "gain_loss", "gain_or_loss"]);
  const termCol = col(header, ["term", "holding_period", "long_short"]);
  const formCol = col(header, ["form"]);
  const boxCol = col(header, ["box"]);
  const acquiredCol = col(header, ["date_acquired", "acquired", "acquisition_date"]);
  const soldCol = col(header, ["date_sold", "sold", "sale_date"]);

  if (kindCol >= 0 && amountCol >= 0 && proceedsCol < 0 && formCol < 0) {
    for (const row of rows.slice(1)) {
      const kind = headerKey(row[kindCol] ?? "");
      const amount = num(row[amountCol]);
      if (kind === "ordinary_dividends" || kind === "ordinary") {
        totals.ordinaryDividends += amount;
      } else if (kind === "qualified_dividends" || kind === "qualified") {
        totals.qualifiedDividends += amount;
      } else if (
        kind === "capital_gain_distributions" ||
        kind === "cap_gain_distributions"
      ) {
        totals.capitalGainDistributions += amount;
      } else if (kind === "short_term_gain" || kind === "short_term") {
        totals.shortTermGain += amount;
      } else if (kind === "long_term_gain" || kind === "long_term") {
        totals.longTermGain += amount;
      }
    }
    totals.recognized.push("summary kind/amount rows");
    return totals;
  }

  if (formCol >= 0 && boxCol >= 0 && amountCol >= 0) {
    for (const row of rows.slice(1)) {
      const form = (row[formCol] ?? "").toUpperCase();
      const box = (row[boxCol] ?? "").toLowerCase().replace(/\s+/g, "");
      const amount = num(row[amountCol]);
      const term = termOf(
        termCol >= 0 ? row[termCol] ?? "" : "",
        acquiredCol >= 0 ? row[acquiredCol] ?? "" : "",
        soldCol >= 0 ? row[soldCol] ?? "" : "",
      );
      if (form.includes("DIV") && (box === "1a" || box === "1")) {
        totals.ordinaryDividends += amount;
      } else if (form.includes("DIV") && box === "1b") {
        totals.qualifiedDividends += amount;
      } else if (form.includes("DIV") && box === "2a") {
        totals.capitalGainDistributions += amount;
      } else if (form.includes("B") && term === "short") {
        totals.shortTermGain += amount;
      } else if (form.includes("B") && term === "long") {
        totals.longTermGain += amount;
      }
    }
    totals.recognized.push("form/box/amount rows");
    return totals;
  }

  if ((proceedsCol >= 0 && costCol >= 0) || gainCol >= 0) {
    for (const row of rows.slice(1)) {
      const term = termOf(
        termCol >= 0 ? row[termCol] ?? "" : "",
        acquiredCol >= 0 ? row[acquiredCol] ?? "" : "",
        soldCol >= 0 ? row[soldCol] ?? "" : "",
      );
      if (!term) continue;
      const gain =
        gainCol >= 0
          ? num(row[gainCol])
          : num(row[proceedsCol]) - num(row[costCol]);
      if (term === "short") totals.shortTermGain += gain;
      else totals.longTermGain += gain;
    }
    totals.recognized.push("1099-B lot rows");
    return totals;
  }

  throw new Error(
    "Unrecognized CSV. Use kind,amount rows, form/box/amount rows, or 1099-B columns (proceeds, cost, term).",
  );
}
