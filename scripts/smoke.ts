import fs from "node:fs";
import path from "node:path";
import { countsFromList } from "../src/lib/dependents";
import { familyReturn } from "../src/lib/family-return";
import { parseBrokerCsv } from "../src/lib/ots/broker-csv";
import { computeReturn } from "../src/lib/ots/run-return";
import { extractPdfText } from "../src/lib/pdf/extract-text";
import {
  applyExtracted,
  parseTaxDocument,
  sample1098Text,
  sampleDivText,
  sampleIntText,
  sampleW2Text,
} from "../src/lib/pdf/parse-forms";
import { textPdf } from "../src/lib/pdf/simple-pdf";
import { sampleReturn } from "../src/lib/sample-return";
import { studentLoanDeduction } from "../src/lib/student-loan";

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

assert(studentLoanDeduction(1000, 50000, "mfj") === 1000, "student loan full");
assert(studentLoanDeduction(2500, 200000, "mfj") === 0, "student loan phased out");
assert(studentLoanDeduction(2500, 92500, "single") === 1250, "student loan midpoint");
assert(studentLoanDeduction(1000, 80000, "mfs") === 0, "student loan mfs");
const noSsn = countsFromList([
  { name: "No Ssn", relationship: "child", birthDate: "2016-04-02", monthsLived: 12, ssn: "" },
]);
assert(noSsn.qualifyingChildren === 0, "missing ssn is not a qualifying child");

const family = await computeReturn(familyReturn);
const ff = family.summary.federal;
const fu = family.summary.utah;
console.log("family", JSON.stringify({ federal: ff, utahTax: fu.utahIncomeTax, refund: fu.refund }));
// Hand check, married filing jointly, before OpenTaxSolver rounding:
// Schedule C net 10,000. Half of SE tax is the QBI reduction.
// Interest 1,000, dividends 600, net capital 1,150 (500 + wash 0 + 1,000 - 400 carryover + 50),
// misc 40, student-loan deduction 1,000 (MAGI under the joint phase-out).
// Itemized 35,500 beats the 31,500 standard deduction.
// Two qualifying children x $2,200 = $4,400, all nonrefundable because the tax is larger.
// Utah line 8 subtracts $200 of Treasury interest. Line 12 is the federal itemized deduction.
assert(close(ff.agi, 101083.52), `family AGI ${ff.agi}`);
assert(ff.deductionChoice === "itemized", ff.deductionChoice);
assert(close(ff.itemizedAmount, 35500), `itemized ${ff.itemizedAmount}`);
assert(close(ff.standardDeduction, 31500), `standard ${ff.standardDeduction}`);
assert(close(ff.qbiDeduction, 1858.7), `family QBI ${ff.qbiDeduction}`);
assert(close(ff.childTaxCredit, 4400), `CTC ${ff.childTaxCredit}`);
assert(ff.additionalChildTaxCredit === 0, `ACTC ${ff.additionalChildTaxCredit}`);
assert(close(ff.totalTax, 3983.96), `family tax ${ff.totalTax}`);
assert(close(ff.payments, 9015), `family payments ${ff.payments}`);
assert(close(ff.refund, 5031.04), `family refund ${ff.refund}`);
assert(fu.lines.find((line) => line.line === "8")?.amount === 200, "Utah treasury subtraction");
assert(fu.lines.find((line) => line.line === "2d")?.amount === 3, "Utah dependents count the newborn twice");
assert(fu.lines.find((line) => line.line === "12")?.amount === 35500, "Utah credit uses the federal deduction");
assert(fu.utahIncomeTax === 2868, `Utah tax ${fu.utahIncomeTax}`);
assert(family.summary.safeHarbor?.percent === 100, "safe harbor percent");
assert(family.summary.safeHarbor?.met === false, "safe harbor short");
assert(family.summary.files.includes("form_8812_out.txt"), "8812 output");
assert(
  family.summary.notes.some((note) => note.includes("8283")),
  "8283 note",
);
assert(
  family.summary.notes.some((note) => note.includes("not deducted")),
  "mortgage insurance note",
);

const hsaReturn = {
  ...sampleReturn,
  hsa: { ...sampleReturn.hsa, coverage: "self" as const, contributions: 1000, employerContributions: 500 },
};
const hsa = await computeReturn(hsaReturn);
assert(hsa.summary.files.includes("form_8889_out.txt"), "8889 output");
assert(close(hsa.summary.federal.agi, 79689.09), `HSA AGI ${hsa.summary.federal.agi}`);

for (const sample of [sampleW2Text, sampleIntText, sampleDivText, sample1098Text]) {
  const extracted = await extractPdfText(textPdf(sample.split("\n")));
  assert(!extracted.needsOcr, "text layer");
  const parsed = parseTaxDocument(extracted.text);
  assert(parsed.fields.length >= 3, `${parsed.form} fields`);
  if (parsed.form === "W-2") {
    assert(parsed.fields.some((field) => field.value === "Sample National Park Co"), parsed.fields.map((field) => field.value).join("|"));
  }
}
const applied = applyExtracted(sampleReturn, parseTaxDocument(sampleIntText).fields);
assert(applied.interest[0]?.box3 === 200, "confirmed 1099-INT box 3");
assert(applied.interest[0]?.payer === "First National Sample Bank", applied.interest[0]?.payer ?? "");

console.log("smoke ok");
console.log("Family differences versus the hand check: none on AGI, itemized total, CTC, Utah line 8, or Utah line 12. Utah tax is rounded to the dollar, which is $2,868.");
}

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.02;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
