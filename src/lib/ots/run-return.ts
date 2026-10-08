import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dependentCounts } from "../dependents";
import {
  charityTotals,
  federalEstimates,
  foreignTaxElection,
  hsaActive,
  interestWithholding,
  taxableInterest,
} from "../figures";
import { safeHarbor } from "../safe-harbor";
import { studentLoanDeduction } from "../student-loan";
import type { ReturnSummary, TaxReturn } from "../return-types";
import { otsFailed, parseOtsNumbers, requireLine } from "./parse-output";
import { runSolver } from "./run-solver";
import { formatUtahWorksheet, utahFromReturn } from "./utah";
import { OTS_TAX_YEAR, OTS_VERSION } from "./version";
import {
  writeFederal,
  writeForm8812,
  writeForm8889,
  writeForm8995,
  writeScheduleC,
  writeScheduleSE,
  zeroFederalAmounts,
} from "./write-inputs";

const FORMDATA = path.join(
  process.cwd(),
  "vendor/opentaxsolver/OTS_2025_23.07/src/formdata",
);

const PDFS: { program: string; meta: string; background: string; out: string }[] =
  [
    {
      program: "federal",
      meta: "f1040_meta.dat",
      background: "f1040_pdf.dat",
      out: "us_1040.pdf",
    },
    {
      program: "sched_c",
      meta: "f1040sc_meta.dat",
      background: "f1040sc_pdf.dat",
      out: "schedule_c.pdf",
    },
    {
      program: "sched_se",
      meta: "f1040sse_meta.dat",
      background: "f1040sse_pdf.dat",
      out: "schedule_se.pdf",
    },
    {
      program: "form_8995",
      meta: "f8995_meta.dat",
      background: "f8995_pdf.dat",
      out: "form_8995.pdf",
    },
  ];

function readOut(file: string): { text: string; numbers: Record<string, number> } {
  const text = fs.readFileSync(file, "utf8");
  const failure = otsFailed(text);
  if (failure) {
    throw new Error(`${path.basename(file)}: ${failure}`);
  }
  return { text, numbers: parseOtsNumbers(text) };
}

async function solve(program: string, inputFile: string): Promise<void> {
  const result = await runSolver(program, [inputFile]);
  const outFile = inputFile.replace(/\.txt$/, "_out.txt");
  if (!fs.existsSync(outFile)) {
    throw new Error(
      `${program} did not write ${path.basename(outFile)}. ${result.log}`.trim(),
    );
  }
  if (result.exitCode !== 0) {
    const text = fs.readFileSync(outFile, "utf8");
    throw new Error(
      `${program} exited ${result.exitCode}. ${otsFailed(text) ?? result.log}`.trim(),
    );
  }
}

async function fillPdf(
  metaName: string,
  resultsFile: string,
  backgroundName: string,
  outFile: string,
): Promise<boolean> {
  const result = await runSolver("universal_pdf_file_modifier", [
    path.join(FORMDATA, metaName),
    resultsFile,
    path.join(FORMDATA, backgroundName),
    "-o",
    outFile,
  ]);
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 1000) {
    return false;
  }
  const header = fs.readFileSync(outFile).subarray(0, 5).toString("utf8");
  return header === "%PDF-" && result.exitCode === 0;
}

export async function computeReturn(
  taxReturn: TaxReturn,
  workDir?: string,
): Promise<{ summary: ReturnSummary; dir: string }> {
  if (taxReturn.taxYear !== OTS_TAX_YEAR) {
    throw new Error(
      `This build calculates tax year ${OTS_TAX_YEAR} (OpenTaxSolver ${OTS_VERSION}).`,
    );
  }
  const qualified = taxReturn.investments.qualifiedDividends;
  const ordinary = taxReturn.investments.ordinaryDividends;
  if (qualified > ordinary + 0.001) {
    throw new Error(
      "Qualified dividends cannot be larger than ordinary dividends. Ordinary dividends already include the qualified amount.",
    );
  }

  const dir = workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "taxes-"));
  fs.mkdirSync(dir, { recursive: true });

  const scheduleCInput = writeScheduleC(taxReturn, dir);
  await solve("taxsolve_US_1040_Sched_C_2025", scheduleCInput);
  const scheduleC = readOut(scheduleCInput.replace(/\.txt$/, "_out.txt"));
  const netProfit = requireLine(scheduleC.numbers, "L31", "Schedule C");

  const scheduleSEInput = writeScheduleSE(taxReturn, netProfit, dir);
  await solve("taxsolve_US_1040_Sched_SE_2025", scheduleSEInput);
  const scheduleSE = readOut(scheduleSEInput.replace(/\.txt$/, "_out.txt"));
  const seTax = scheduleSE.numbers.L12 ?? 0;
  const seDeduction = scheduleSE.numbers.L13 ?? 0;

  let hsaDeduction = 0;
  let hsaTaxable = 0;
  let hsaAdditionalTax = 0;
  if (hsaActive(taxReturn)) {
    const hsaInput = writeForm8889(taxReturn, dir);
    await solve("taxsolve_HSA_f8889", hsaInput);
    const hsaOut = readOut(hsaInput.replace(/\.txt$/, "_out.txt"));
    hsaDeduction = hsaOut.numbers.L13 ?? 0;
    hsaTaxable = hsaOut.numbers.L16 ?? 0;
    hsaAdditionalTax = (hsaOut.numbers.L17b ?? 0) + (hsaOut.numbers.L21 ?? 0);
  }

  const shared = {
    businessIncome: netProfit,
    seDeduction,
    seTax,
    hsaDeduction,
    hsaTaxable,
    hsaAdditionalTax,
    foreignTaxCredit: foreignTaxElection(taxReturn).credit,
  };

  let studentLoan = 0;
  if (taxReturn.other.studentLoanInterest > 0) {
    const magiInput = writeFederal(
      taxReturn,
      zeroFederalAmounts({ ...shared, qbiDeduction: 0, studentLoanDeduction: 0 }),
      dir,
      "federal_magi.txt",
    );
    await solve("taxsolve_US_1040_2025", magiInput);
    const magi = readOut(magiInput.replace(/\.txt$/, "_out.txt"));
    studentLoan = studentLoanDeduction(
      taxReturn.other.studentLoanInterest,
      requireLine(magi.numbers, "L11a", "Form 1040"),
      taxReturn.personal.filingStatus,
    );
  }

  const pass1 = writeFederal(
    taxReturn,
    zeroFederalAmounts({ ...shared, studentLoanDeduction: studentLoan, qbiDeduction: 0 }),
    dir,
    "federal_pass1.txt",
  );
  await solve("taxsolve_US_1040_2025", pass1);
  const pass1Out = pass1.replace(/\.txt$/, "_out.txt");

  let qbi = 0;
  const hasBusiness = Math.abs(netProfit) > 0.005;
  if (hasBusiness) {
    const form8995 = writeForm8995(
      taxReturn,
      pass1Out,
      scheduleCInput.replace(/\.txt$/, "_out.txt"),
      dir,
    );
    await solve("taxsolve_f8995_2025", form8995);
    const qbiOut = readOut(form8995.replace(/\.txt$/, "_out.txt"));
    qbi = qbiOut.numbers.L15 ?? 0;
  }

  const withQbi = zeroFederalAmounts({
    ...shared,
    studentLoanDeduction: studentLoan,
    qbiDeduction: qbi,
  });
  const counts = dependentCounts(taxReturn);
  const needsCredit = counts.qualifyingChildren + counts.otherDependents > 0;
  let nonrefundableCtc = 0;
  let refundableCtc = 0;

  if (needsCredit) {
    const preCredit = writeFederal(taxReturn, withQbi, dir, "federal_precit.txt");
    await solve("taxsolve_US_1040_2025", preCredit);
    const pre = readOut(preCredit.replace(/\.txt$/, "_out.txt"));
    // Form 8812 Credit Limit Worksheet A: tax from Form 1040 line 18,
    // minus other nonrefundable credits. The only other one computed here
    // is the foreign-tax election on Schedule 3 line 1.
    const creditLimit = Math.max(0, (pre.numbers.L18 ?? pre.numbers.L16 ?? 0) - shared.foreignTaxCredit);
    const wages = taxReturn.w2s.reduce((sum, w2) => sum + w2.wages, 0);
    const earnedFromSe = Math.max(0, scheduleSE.numbers.L3 ?? netProfit * 0.9235);
    const form8812 = writeForm8812(
      taxReturn,
      {
        agi: requireLine(pre.numbers, "L11a", "Form 1040"),
        creditLimit,
        earnedIncome: wages + earnedFromSe,
        seDeduction,
      },
      dir,
    );
    await solve("taxsolve_f8812_2025", form8812);
    const credit = readOut(form8812.replace(/\.txt$/, "_out.txt"));
    nonrefundableCtc = credit.numbers.L14 ?? 0;
    refundableCtc = credit.numbers.L27 ?? 0;
  }

  const federalInput = writeFederal(
    taxReturn,
    zeroFederalAmounts({ ...withQbi, nonrefundableCtc, refundableCtc }),
    dir,
    "federal.txt",
  );
  await solve("taxsolve_US_1040_2025", federalInput);
  const federal = readOut(federalInput.replace(/\.txt$/, "_out.txt"));
  const n = federal.numbers;
  const choice = readDeductionChoice(federal.text);

  const agi = requireLine(n, "L11a", "Form 1040");
  const deduction = requireLine(n, "L12", "Form 1040");
  const taxableIncome = requireLine(n, "L15", "Form 1040");
  const incomeTax = requireLine(n, "L16", "Form 1040");
  const totalTax = requireLine(n, "L24", "Form 1040");
  const payments = requireLine(n, "L33", "Form 1040");
  const refund = n.L34 ?? 0;
  const amountOwed = n.L37 ?? 0;

  const utah = utahFromReturn(taxReturn, {
    agi,
    deduction,
    schedule1ALine37: n.L13b ?? 0,
  });
  fs.writeFileSync(path.join(dir, "utah_tc40.txt"), formatUtahWorksheet(utah));

  const notes = buildNotes(taxReturn, {
    hasBusiness,
    needsCredit,
    choice,
    hasSales: taxReturn.sales.length > 0,
  });

  const files = [
    "federal_out.txt",
    "sched_c_out.txt",
    "sched_se_out.txt",
    "utah_tc40.txt",
  ];
  if (hasBusiness) files.push("form_8995_out.txt");
  if (needsCredit) files.push("form_8812_out.txt");
  if (hsaActive(taxReturn)) files.push("form_8889_out.txt");

  const pdfSources: Record<string, string> = {
    us_1040: federalInput.replace(/\.txt$/, "_out.txt"),
    schedule_c: scheduleCInput.replace(/\.txt$/, "_out.txt"),
    schedule_se: scheduleSEInput.replace(/\.txt$/, "_out.txt"),
    form_8995: path.join(dir, "form_8995_out.txt"),
  };

  let pdfOk = true;
  for (const pdf of PDFS) {
    if (pdf.out === "form_8995.pdf" && !hasBusiness) continue;
    const resultsFile = pdfSources[pdf.out.replace(/\.pdf$/, "")];
    if (!resultsFile || !fs.existsSync(resultsFile)) {
      pdfOk = false;
      continue;
    }
    const outFile = path.join(dir, pdf.out);
    const ok = await fillPdf(pdf.meta, resultsFile, pdf.background, outFile);
    if (ok) files.push(pdf.out);
    else pdfOk = false;
  }

  if (pdfOk) {
    notes.push(
      "Filled PDFs are OpenTaxSolver overlays on its form images. Some checkboxes and identity fields still need a look before you print.",
    );
  } else {
    notes.push(
      "A filled PDF could not be produced for every form. Download the OTS text output and copy the amounts onto the official IRS forms.",
    );
  }

  const summary: ReturnSummary = {
    federal: {
      agi,
      standardOrItemized: deduction,
      deductionChoice: choice.choice,
      itemizedAmount: choice.itemized,
      standardDeduction: choice.standard,
      qbiDeduction: n.L13a ?? qbi,
      taxableIncome,
      incomeTax,
      seTax,
      childTaxCredit: n.L19 ?? nonrefundableCtc,
      additionalChildTaxCredit: n.L28 ?? refundableCtc,
      totalTax,
      payments,
      refund,
      amountOwed,
    },
    utah: {
      federalAgi: utah.federalAgi,
      utahTaxableIncome: utah.utahTaxableIncome,
      taxBeforeCredit: utah.taxBeforeCredit,
      taxpayerCredit: utah.taxpayerCredit,
      utahIncomeTax: utah.utahIncomeTax,
      withholding: utah.withholding,
      prepayments: utah.prepayments,
      refund: utah.refund,
      amountOwed: utah.amountOwed,
      exempt: utah.exempt,
      lines: utah.lines,
    },
    comparison:
      taxReturn.lastYear.agi > 0 || taxReturn.lastYear.totalTax > 0
        ? {
            priorAgi: taxReturn.lastYear.agi,
            agi,
            priorTax: taxReturn.lastYear.totalTax,
            totalTax,
          }
        : null,
    safeHarbor: safeHarbor({
      status: taxReturn.personal.filingStatus,
      priorAgi: taxReturn.lastYear.agi,
      priorTotalTax: taxReturn.lastYear.totalTax,
      withholding:
        taxReturn.w2s.reduce((sum, w2) => sum + w2.federalWithholding, 0) +
        interestWithholding(taxReturn),
      estimates: federalEstimates(taxReturn) - taxReturn.lastYear.overpaymentApplied,
      overpaymentApplied: taxReturn.lastYear.overpaymentApplied,
    }),
    notes,
    files,
  };

  fs.writeFileSync(
    path.join(dir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  return { summary, dir };
}

function readDeductionChoice(text: string): {
  choice: "standard" | "itemized";
  itemized: number;
  standard: number;
} {
  const match = text.match(
    /Itemizations\s*[<>]\s*Std-Deduction,\s*([\d.]+)\s*[<>]\s*([\d.]+)/,
  );
  const itemized = match ? Number(match[1]) : 0;
  const standard = match ? Number(match[2]) : 0;
  const choice = /Itemizing\./.test(text) ? "itemized" : "standard";
  return { choice, itemized, standard };
}

function buildNotes(
  taxReturn: TaxReturn,
  flags: {
    hasBusiness: boolean;
    needsCredit: boolean;
    choice: { choice: "standard" | "itemized"; itemized: number; standard: number };
    hasSales: boolean;
  },
): string[] {
  const gifts = charityTotals(taxReturn);
  const foreign = foreignTaxElection(taxReturn);
  const notes = [
    `Federal figures are from OpenTaxSolver ${OTS_VERSION} for tax year ${OTS_TAX_YEAR}.`,
    "Utah figures are a full-year resident TC-40 worksheet in this app. OpenTaxSolver does not include Utah. U.S. government obligation interest is subtracted on line 8.",
    "Paper filing only. Nothing here is e-filed, and this is not tax advice. Check the official form instructions before you mail a return.",
    flags.choice.choice === "itemized"
      ? `Schedule A itemized deductions ($${flags.choice.itemized.toFixed(2)}) are larger than the standard deduction ($${flags.choice.standard.toFixed(2)}), so the return itemizes. The SALT cap is the one OpenTaxSolver applies for 2025.`
      : `The standard deduction ($${flags.choice.standard.toFixed(2)}) is larger than Schedule A ($${flags.choice.itemized.toFixed(2)}), so the return takes the standard deduction.`,
  ];
  if (flags.hasSales) {
    notes.push(
      "Each sale is on Form 8949 through OpenTaxSolver, split by whether basis was reported. A wash-sale amount is code W. Summary gain boxes are left blank so those sales are not counted twice.",
    );
  } else {
    notes.push(
      "Capital gains are entered as net short-term and long-term totals (proceeds equal to a gain, or cost equal to a loss). Form 8949 will not list each sale.",
    );
  }
  if (flags.hasBusiness) {
    notes.push(
      "The qualified business income deduction is Form 8995's simplified computation from Schedule C. Specified-service limits and W-2/property limits are not applied.",
    );
  }
  if (flags.needsCredit) {
    notes.push(
      "The child tax credit and credit for other dependents are Form 8812 in OpenTaxSolver ($2,200 per qualifying child under 17, $500 for another dependent). A listed dependent needs a 9-digit SSN for the $2,200. Relationship tests are not applied. The additional credit uses earned income over $2,500. Social Security and Medicare withholding are not collected, which only changes the additional credit when three or more children make the $1,700 cap exceed $5,100.",
    );
  }
  if (taxableInterest(taxReturn) + taxReturn.investments.ordinaryDividends > 1500) {
    notes.push(
      "Interest or ordinary dividends are over $1,500, so Schedule B is required. Those lines are inside the Form 1040 OpenTaxSolver output.",
    );
  }
  if (gifts.noncash > 500) {
    notes.push(
      `Non-cash gifts total $${gifts.noncash.toFixed(2)}, which is over $500. Form 8283 is not prepared. Complete it before filing.`,
    );
  }
  if (taxReturn.mortgage.mortgageInsurance > 0) {
    notes.push(
      "Mortgage insurance premiums are stored and not deducted. OpenTaxSolver 23.07 has no Schedule A line for them.",
    );
  }
  if (foreign.note) notes.push(foreign.note);
  if (taxReturn.other.traditionalIraDeduction > 0) {
    notes.push(
      "The traditional IRA amount is deducted as entered on Schedule 1 line 20. The MAGI phase-out worksheet is not computed.",
    );
  }
  if (taxReturn.other.rothIraContribution > 0) {
    notes.push("A Roth IRA contribution is not deductible and is not on the return.");
  }
  if (taxReturn.other.studentLoanInterest > 0) {
    notes.push(
      "The student loan interest deduction is computed in this app (maximum $2,500, 2025 phase-out from Rev. Proc. 2024-40) and entered on Schedule 1 line 21. Married filing separately gets no deduction.",
    );
  }
  if (hsaActive(taxReturn)) {
    notes.push(
      "Form 8889 is OpenTaxSolver. The 2025 limitation is $4,300 self-only or $8,550 family, plus $1,000 if age 55 or older (Rev. Proc. 2024-25), and a full year of eligibility is assumed. Employer contributions are W-2 box 12 code W.",
    );
  }
  if (taxReturn.other.childCareExpenses > 0) {
    notes.push("Form 2441, child and dependent care, is not yet supported. Those expenses are not deducted or credited.");
  }
  if (taxReturn.other.my529Contribution > 0) {
    notes.push("The Utah my529 credit is not yet supported. That contribution is not credited.");
  }
  if (taxReturn.estimates.some((row) => row.date)) {
    notes.push(
      "Estimated-payment dates are stored. Form 2210 is not prepared, so an underpayment penalty is not calculated.",
    );
  }
  notes.push("The earned income credit is not calculated.");
  return notes;
}
