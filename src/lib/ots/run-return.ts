import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ReturnSummary, TaxReturn } from "../return-types";
import { otsFailed, parseOtsNumbers, requireLine } from "./parse-output";
import { runSolver } from "./run-solver";
import { formatUtahWorksheet, utahFromReturn } from "./utah";
import { OTS_TAX_YEAR, OTS_VERSION } from "./version";
import {
  writeFederal,
  writeForm8995,
  writeScheduleC,
  writeScheduleSE,
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

  const pass1 = writeFederal(
    taxReturn,
    {
      businessIncome: netProfit,
      seDeduction,
      seTax,
      qbiDeduction: 0,
    },
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

  const federalInput = writeFederal(
    taxReturn,
    {
      businessIncome: netProfit,
      seDeduction,
      seTax,
      qbiDeduction: qbi,
    },
    dir,
    "federal.txt",
  );
  await solve("taxsolve_US_1040_2025", federalInput);
  const federal = readOut(federalInput.replace(/\.txt$/, "_out.txt"));
  const n = federal.numbers;

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

  const notes = [
    `Federal figures are from OpenTaxSolver ${OTS_VERSION} for tax year ${OTS_TAX_YEAR}.`,
    "Utah figures are a full-year resident TC-40 worksheet in this app. OpenTaxSolver does not include Utah.",
    "Paper filing only. Nothing here is e-filed, and this is not tax advice. Check the official form instructions before you mail a return.",
    "Capital gains are entered as net short-term and long-term totals (proceeds equal to a gain, or cost equal to a loss). Form 8949 will not list each sale.",
    "The qualified business income deduction is Form 8995's simplified computation from Schedule C. Specified-service limits and W-2/property limits are not applied.",
    "Estimated-tax penalties, the earned income credit, and itemized deductions are not calculated.",
  ];

  const files = [
    "federal_out.txt",
    "sched_c_out.txt",
    "sched_se_out.txt",
    "utah_tc40.txt",
  ];
  if (hasBusiness) files.push("form_8995_out.txt");

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
      qbiDeduction: n.L13a ?? qbi,
      taxableIncome,
      incomeTax,
      seTax,
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
    notes,
    files,
  };

  fs.writeFileSync(
    path.join(dir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  return { summary, dir };
}
