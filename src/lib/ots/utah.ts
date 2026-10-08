import { dependentCounts } from "../dependents";
import { itemizedLastYear, taxableStateRefund, treasuryInterest, utahEstimates } from "../figures";
import type { FilingStatus, LineAmount, TaxReturn } from "../return-types";

/**
 * Full-year Utah resident TC-40 worksheet for tax year 2025.
 *
 * OpenTaxSolver 23.07 does not ship a Utah program (its states are OH, NJ,
 * VA, PA, MA, NC, AZ, MI, NY, OR, and CA). This is not an OTS solver. It
 * applies the arithmetic printed on the 2025 TC-40 and in the Tax Commission
 * instructions (https://incometax.utah.gov/), using federal AGI and the
 * federal deduction OTS already computed.
 *
 * In scope: full-year resident, no TC-40A additions or subtractions other
 * than a state-tax refund that was included because last year was itemized,
 * no Utah credits other than the taxpayer tax credit, no use tax, no
 * penalties. Out of scope on purpose for this proof of concept.
 */

const RATE = 0.045;
const PERSONAL_EXEMPTION = 2111;
const CREDIT_RATE = 0.06;
const PHASEOUT_RATE = 0.013;

const PHASEOUT_BASE: Record<FilingStatus, number> = {
  single: 18213,
  mfs: 18213,
  hoh: 27320,
  mfj: 36426,
  qw: 36426,
};

/** Basic standard deduction for the line 21 exempt worksheet (not the age add-on). */
const BASIC_STANDARD: Record<FilingStatus, number> = {
  single: 15750,
  mfs: 15750,
  hoh: 23625,
  mfj: 31500,
  qw: 31500,
};

function roundDollars(value: number): number {
  return Math.round(value);
}

function nonNegative(value: number): number {
  return value > 0 ? value : 0;
}

export interface UtahInput {
  filingStatus: FilingStatus;
  federalAgi: number;
  federalDeduction: number;
  /** Schedule 1-A line 37, when OTS reports L13b. Used only for the exempt test. */
  seniorSchedule1A: number;
  dependentsAge16OrUnder: number;
  otherDependents: number;
  dependentsBornThisYear: number;
  stateTaxRefund: number;
  itemizedLastYear: boolean;
  /** US government obligation interest, TC-40 line 8. */
  treasuryInterest: number;
  utahWithholding: number;
  utahPrepayments: number;
}

export interface UtahResult {
  federalAgi: number;
  utahTaxableIncome: number;
  taxBeforeCredit: number;
  taxpayerCredit: number;
  utahIncomeTax: number;
  withholding: number;
  prepayments: number;
  refund: number;
  amountOwed: number;
  exempt: boolean;
  lines: LineAmount[];
}

export function utahFromReturn(
  taxReturn: TaxReturn,
  federal: {
    agi: number;
    deduction: number;
    schedule1ALine37: number;
  },
): UtahResult {
  const counts = dependentCounts(taxReturn);
  const withholding =
    taxReturn.w2s.reduce((sum, w2) => sum + w2.stateWithholding, 0) +
    taxReturn.payments.utahWithholdingExtra;
  return computeUtah({
    filingStatus: taxReturn.personal.filingStatus,
    federalAgi: federal.agi,
    federalDeduction: federal.deduction,
    seniorSchedule1A: federal.schedule1ALine37,
    dependentsAge16OrUnder: counts.utahAge16OrUnder,
    otherDependents: counts.utahOther,
    dependentsBornThisYear: counts.utahBornThisYear,
    stateTaxRefund: taxableStateRefund(taxReturn),
    itemizedLastYear: itemizedLastYear(taxReturn),
    treasuryInterest: treasuryInterest(taxReturn),
    utahWithholding: withholding,
    utahPrepayments: utahEstimates(taxReturn),
  });
}

export function computeUtah(input: UtahInput): UtahResult {
  const line2a = Math.max(0, Math.floor(input.dependentsAge16OrUnder));
  const line2b = Math.max(0, Math.floor(input.otherDependents));
  const line2c = Math.min(
    line2a,
    Math.max(0, Math.floor(input.dependentsBornThisYear)),
  );
  const line2d = line2a + line2b + line2c;

  const line4 = input.federalAgi;
  const line5 = 0;
  const line6 = line4 + line5;
  const line7 = input.itemizedLastYear ? input.stateTaxRefund : 0;
  // TC-40 instructions: interest from U.S. government obligations is a subtraction.
  const line8 = Math.max(0, input.treasuryInterest);
  const line9 = line6 - line7 - line8;
  const line10 = nonNegative(line9 * RATE);
  const line11 = line2d * PERSONAL_EXEMPTION;
  const line12 = input.federalDeduction;
  const line13 = line11 + line12;
  const line14 = 0;
  const line15 = line13 - line14;
  const line16 = line15 * CREDIT_RATE;
  const line17 = PHASEOUT_BASE[input.filingStatus];
  const line18 = nonNegative(line9 - line17);
  const line19 = line18 * PHASEOUT_RATE;
  const line20 = nonNegative(line16 - line19);

  const basic = BASIC_STANDARD[input.filingStatus];
  const exemptBase = basic + Math.max(0, input.seniorSchedule1A);
  const exempt = line4 <= exemptBase;

  const line22 = exempt ? 0 : nonNegative(line10 - line20);
  const line27 = line22;
  const line32 = line27;
  const line33 = input.utahWithholding;
  const line34 = input.utahPrepayments;
  const line38 = line33 + line34;
  const line39 = nonNegative(line32 - line38);
  const line42 = nonNegative(line38 - line32);

  const raw: LineAmount[] = [
    { line: "2a", label: "Dependents age 16 and under", amount: line2a },
    { line: "2b", label: "Other dependents", amount: line2b },
    { line: "2c", label: "Dependents born in 2025", amount: line2c },
    { line: "2d", label: "Total qualifying dependents", amount: line2d },
    { line: "4", label: "Federal adjusted gross income", amount: line4 },
    { line: "7", label: "State tax refund included in federal income", amount: line7 },
    { line: "8", label: "U.S. government obligation interest", amount: line8 },
    { line: "9", label: "Utah taxable income", amount: line9 },
    { line: "10", label: "Utah tax (4.5%)", amount: line10 },
    { line: "11", label: "Utah personal exemption", amount: line11 },
    { line: "12", label: "Federal standard or itemized deduction", amount: line12 },
    { line: "16", label: "Initial credit before phase-out", amount: line16 },
    { line: "17", label: "Base phase-out amount", amount: line17 },
    { line: "19", label: "Phase-out amount", amount: line19 },
    { line: "20", label: "Taxpayer tax credit", amount: line20 },
    { line: "22", label: "Utah income tax", amount: line22 },
    { line: "33", label: "Utah withholding", amount: line33 },
    { line: "34", label: "Utah prepayments", amount: line34 },
    { line: "39", label: "Tax due", amount: line39 },
    { line: "42", label: "Refund", amount: line42 },
  ];

  const lines = raw.map((line) => ({
    ...line,
    amount: Number.isInteger(line.amount) ? line.amount : roundDollars(line.amount),
  }));

  return {
    federalAgi: roundDollars(line4),
    utahTaxableIncome: roundDollars(line9),
    taxBeforeCredit: roundDollars(line10),
    taxpayerCredit: roundDollars(line20),
    utahIncomeTax: roundDollars(line22),
    withholding: roundDollars(line33),
    prepayments: roundDollars(line34),
    refund: roundDollars(line42),
    amountOwed: roundDollars(line39),
    exempt,
    lines,
  };
}

export function formatUtahWorksheet(result: UtahResult): string {
  const body = result.lines
    .map(
      (line) =>
        `Line ${line.line.padEnd(4)} ${line.amount.toFixed(2).padStart(12)}  ${line.label}`,
    )
    .join("\n");
  return [
    "Utah TC-40 worksheet for a full-year resident, tax year 2025.",
    "Computed by this app, not by OpenTaxSolver. OTS 23.07 has no Utah program.",
    "Paper filing only. This is not a filled Utah form and it is not tax advice.",
    "Amounts are rounded to the nearest dollar, which Utah accepts.",
    "Not included: TC-40A additions and subtractions (other than a prior-year",
    "state-tax refund when last year was itemized), other credits, use tax,",
    "penalties, and part-year or nonresident apportionment (TC-40B).",
    result.exempt
      ? "Qualified exempt taxpayer worksheet: federal AGI is not above the basic deduction. Line 22 is 0."
      : "Qualified exempt taxpayer worksheet: not exempt.",
    "",
    body,
    "",
  ].join("\n");
}
