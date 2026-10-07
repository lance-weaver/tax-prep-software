import fs from "node:fs";
import path from "node:path";
import { parseBrokerCsv } from "../src/lib/ots/broker-csv";
import { computeReturn } from "../src/lib/ots/run-return";
import { sampleReturn } from "../src/lib/sample-return";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

const csv = fs.readFileSync(
  path.join(process.cwd(), "samples/fake-1099.csv"),
  "utf8",
);
const totals = parseBrokerCsv(csv);
assert(totals.ordinaryDividends === 420, `ordinary ${totals.ordinaryDividends}`);
assert(totals.qualifiedDividends === 310, `qualified ${totals.qualifiedDividends}`);
assert(totals.shortTermGain === 250, `short ${totals.shortTermGain}`);
assert(totals.longTermGain === 1800, `long ${totals.longTermGain}`);

const lots = parseBrokerCsv(
  "proceeds,cost,term\n1250.00,1000.00,short\n3000.00,1200.00,long\n",
);
assert(Math.abs(lots.shortTermGain - 250) < 0.001, "lot short");
assert(Math.abs(lots.longTermGain - 1800) < 0.001, "lot long");

async function main(): Promise<void> {
const { summary, dir } = await computeReturn(sampleReturn);
const federal = summary.federal;
const utah = summary.utah;

console.log(JSON.stringify({ federal, utah: { ...utah, lines: undefined }, files: summary.files, notes: summary.notes }, null, 2));
console.log(`work dir ${dir}`);

assert(federal.seTax > 1800 && federal.seTax < 2600, `SE tax ${federal.seTax}`);
assert(federal.agi > 78000 && federal.agi < 84000, `AGI ${federal.agi}`);
assert(
  federal.taxableIncome > 50000 && federal.taxableIncome < federal.agi,
  `taxable income ${federal.taxableIncome}`,
);
assert(federal.qbiDeduction > 2500 && federal.qbiDeduction < 3200, `QBI ${federal.qbiDeduction}`);
assert(federal.totalTax > 7000 && federal.totalTax < 15000, `total tax ${federal.totalTax}`);
assert(federal.payments > 7000 && federal.payments < 9000, `payments ${federal.payments}`);
assert(
  Math.abs(federal.payments - federal.totalTax - (federal.refund - federal.amountOwed)) < 1,
  `refund/owed ${federal.refund} / ${federal.amountOwed}`,
);
assert(federal.amountOwed > 0 || federal.refund > 0, "federal balance");
assert(utah.utahIncomeTax > 2000 && utah.utahIncomeTax < 5000, `Utah tax ${utah.utahIncomeTax}`);
assert(
  Math.abs(utah.withholding + utah.prepayments - utah.utahIncomeTax - (utah.refund - utah.amountOwed)) <
    1.5,
  "Utah balance",
);

for (const name of ["federal_out.txt", "sched_c_out.txt", "sched_se_out.txt", "utah_tc40.txt"]) {
  assert(summary.files.includes(name), `missing ${name}`);
  assert(fs.existsSync(path.join(dir, name)), `file ${name}`);
}

const pdfs = summary.files.filter((name) => name.endsWith(".pdf"));
if (pdfs.length === 0) {
  console.log("PDF overlay was not produced. Text output is the filing aid.");
  assert(
    summary.notes.some((note) => note.toLowerCase().includes("pdf")),
    "missing PDF limitation note",
  );
} else {
  for (const name of pdfs) {
    const header = fs.readFileSync(path.join(dir, name)).subarray(0, 5).toString("utf8");
    assert(header === "%PDF-", `${name} header ${header}`);
  }
  console.log(`PDF overlays: ${pdfs.join(", ")}`);
}

console.log("smoke ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
