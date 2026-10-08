import fs from "node:fs";
import path from "node:path";
import { dependentCounts } from "../dependents";
import {
  charityTotals,
  federalEstimates,
  foreignTaxElection,
  hsaEmployer,
  interestWithholding,
  stateIncomeTaxPaid,
  taxableInterest,
  taxableStateRefund,
} from "../figures";
import type { FilingStatus, Sale, TaxReturn } from "../return-types";
import { money, setNumeric, setText, yn } from "./fill-template";

const VENDOR = path.join(
  process.cwd(),
  "vendor/opentaxsolver/OTS_2025_23.07/tax_form_files",
);

const STATUS: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Married/Joint",
  mfs: "Married/Sep",
  hoh: "Head_of_House",
  qw: "Widow(er)",
};

function readTemplate(...parts: string[]): string {
  return fs.readFileSync(path.join(VENDOR, ...parts), "utf8");
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function gainPair(gain: number): { proceeds: number; cost: number } {
  if (gain >= 0) return { proceeds: gain, cost: 0 };
  return { proceeds: 0, cost: -gain };
}

export function federalDependents(taxReturn: TaxReturn): number {
  const counts = dependentCounts(taxReturn);
  return counts.qualifyingChildren + counts.otherDependents;
}

export function writeScheduleC(taxReturn: TaxReturn, dir: string): string {
  const c = taxReturn.scheduleC;
  const person = taxReturn.personal;
  let text = readTemplate(
    "US_1040_Sched_C",
    "US_1040Sched_C_2025_template.txt",
  );
  const name = `${person.firstName} ${person.lastName}`.trim();
  text = setText(text, "YourName:", name);
  text = setText(text, "YourSocSec#:", digits(person.ssn));
  text = setText(text, "PrincipalBus:", c.principalBusiness || "Tour operator");
  text = setText(text, "BusinessName:", c.businessName);
  text = setText(text, "Number&Street:", person.street);
  text = setText(
    text,
    "TownStateZip:",
    `${person.city} ${person.state} ${person.zip}`.trim(),
  );
  text = setText(text, "ActivityCode:", c.activityCode || "561500");
  text = setText(text, "BusinessEIN:", digits(c.ein));
  text = setText(text, "Fmethod:", c.accountingMethod);
  text = setText(text, "GPartic:", yn(c.materiallyParticipated));
  text = setText(text, "Hacquired:", yn(c.acquiredThisYear));
  text = setText(text, "Ireq1099s:", "N");
  text = setText(text, "Jfile1099s:", "n/a");
  text = setNumeric(text, "L1", c.grossReceipts);
  text = setNumeric(text, "L2", c.returnsAndAllowances);
  text = setNumeric(text, "L8", c.advertising);
  text = setNumeric(text, "L9", c.carAndTruck);
  text = setNumeric(text, "L10", c.commissions);
  text = setNumeric(text, "L15", c.insurance);
  text = setNumeric(text, "L17", c.legalAndProfessional);
  text = setNumeric(text, "L18", c.office);
  text = setNumeric(text, "L22", c.supplies);
  text = setNumeric(text, "L23", c.taxesAndLicenses);
  text = setNumeric(text, "L24a", c.travel);
  text = setNumeric(text, "L24b", c.deductibleMeals);
  text = setNumeric(text, "L25", c.utilities);
  text = setText(text, "L32a", "Yes");
  text = setText(text, "L48a_descr:", c.otherDescription || "Other");
  text = setNumeric(text, "L48a_amnt", c.otherExpenses);

  const file = path.join(dir, "sched_c.txt");
  fs.writeFileSync(file, text);
  return file;
}

export function writeScheduleSE(
  taxReturn: TaxReturn,
  netProfit: number,
  dir: string,
): string {
  const person = taxReturn.personal;
  const ssWages = taxReturn.w2s.reduce(
    (sum, w2) => sum + (w2.socialSecurityWages || w2.wages),
    0,
  );
  let text = readTemplate("US_1040_Sched_SE", "US_1040_Sched_SE_template.txt");
  text = setText(
    text,
    "YourName:",
    `${person.firstName} ${person.lastName}`.trim(),
  );
  text = setText(text, "YourSocSec#:", digits(person.ssn));
  text = setNumeric(text, "L2", netProfit);
  text = setNumeric(text, "L8a", ssWages);
  const file = path.join(dir, "sched_se.txt");
  fs.writeFileSync(file, text);
  return file;
}

export interface FederalAmounts {
  businessIncome: number;
  seDeduction: number;
  seTax: number;
  qbiDeduction: number;
  studentLoanDeduction: number;
  hsaDeduction: number;
  hsaTaxable: number;
  hsaAdditionalTax: number;
  nonrefundableCtc: number;
  refundableCtc: number;
  foreignTaxCredit: number;
  iraDeduction: number;
  otherIncome: number;
}

export function zeroFederalAmounts(
  partial: Partial<FederalAmounts> = {},
): FederalAmounts {
  return {
    businessIncome: 0,
    seDeduction: 0,
    seTax: 0,
    qbiDeduction: 0,
    studentLoanDeduction: 0,
    hsaDeduction: 0,
    hsaTaxable: 0,
    hsaAdditionalTax: 0,
    nonrefundableCtc: 0,
    refundableCtc: 0,
    foreignTaxCredit: 0,
    iraDeduction: 0,
    otherIncome: 0,
    ...partial,
  };
}

export function writeFederal(
  taxReturn: TaxReturn,
  amounts: FederalAmounts,
  dir: string,
  filename: string,
): string {
  const person = taxReturn.personal;
  const wages = taxReturn.w2s.reduce((sum, w2) => sum + w2.wages, 0);
  const federalWithholding = taxReturn.w2s.reduce(
    (sum, w2) => sum + w2.federalWithholding,
    0,
  );
  const gifts = charityTotals(taxReturn);
  const useSales = taxReturn.sales.length > 0;
  const short = useSales ? { proceeds: 0, cost: 0 } : gainPair(taxReturn.investments.shortTermGain);
  const long = useSales ? { proceeds: 0, cost: 0 } : gainPair(taxReturn.investments.longTermGain);
  const digital = taxReturn.personal.digitalAssets || taxReturn.sales.some((sale) => sale.digitalAsset);

  let text = readTemplate("US_1040", "US_1040_template.txt");
  text = setText(text, "Status", STATUS[person.filingStatus]);
  text = setText(text, "You_65+Over?", yn(person.you65OrOlder));
  text = setText(text, "You_Blind?", yn(person.youBlind));
  text = setText(text, "Spouse_65+Over?", yn(person.spouse65OrOlder));
  text = setText(text, "Spouse_Blind?", yn(person.spouseBlind));
  text = setNumeric(text, "Dependents", federalDependents(taxReturn));
  text = setText(text, "CkHomeInUS", yn(person.homeInUs));
  text = setText(text, "VirtCurr?", yn(person.digitalAssets));
  text = setNumeric(text, "L1a", wages);
  text = setNumeric(text, "L2b", taxableInterest(taxReturn));
  text = setNumeric(text, "L3a", taxReturn.investments.qualifiedDividends);
  text = setNumeric(text, "L3b", taxReturn.investments.ordinaryDividends);
  text = setNumeric(text, "L13a", amounts.qbiDeduction);
  text = setNumeric(text, "L19", amounts.nonrefundableCtc);
  text = setNumeric(text, "L25a", federalWithholding);
  text = setNumeric(text, "L25b", interestWithholding(taxReturn));
  text = setNumeric(text, "L26", federalEstimates(taxReturn));
  text = setNumeric(text, "L28", amounts.refundableCtc);
  text = setNumeric(text, "D1ad", short.proceeds);
  text = setNumeric(text, "D1ae", short.cost);
  text = setNumeric(text, "D6", taxReturn.lastYear.shortTermLossCarryover);
  text = setNumeric(text, "D8ad", long.proceeds);
  text = setNumeric(text, "D8ae", long.cost);
  text = setNumeric(text, "D13", taxReturn.investments.capitalGainDistributions);
  text = setNumeric(text, "D14", taxReturn.lastYear.longTermLossCarryover);
  text = setNumeric(text, "A5a", stateIncomeTaxPaid(taxReturn));
  text = setNumeric(text, "A5b", taxReturn.mortgage.propertyTax);
  text = setNumeric(text, "A8a", taxReturn.mortgage.interest + taxReturn.mortgage.points);
  text = setNumeric(text, "A11", gifts.cash);
  text = setNumeric(text, "A12", gifts.noncash);
  text = setNumeric(text, "S1_1", taxableStateRefund(taxReturn));
  text = setNumeric(text, "S1_3", amounts.businessIncome);
  text = setNumeric(text, "S1_8f", amounts.hsaTaxable);
  text = setNumeric(text, "S1_8z", amounts.otherIncome + taxReturn.other.miscIncome);
  text = setNumeric(text, "S1_13", amounts.hsaDeduction);
  text = setNumeric(text, "S1_15", amounts.seDeduction);
  text = setNumeric(text, "S1_20", amounts.iraDeduction + taxReturn.other.traditionalIraDeduction);
  text = setNumeric(text, "S1_21", amounts.studentLoanDeduction);
  text = setNumeric(text, "S2_4", amounts.seTax);
  text = setNumeric(text, "S2_17d", amounts.hsaAdditionalTax);
  text = setNumeric(text, "S3_1", amounts.foreignTaxCredit || foreignTaxElection(taxReturn).credit);
  text = setText(text, "VirtCurr?", yn(digital));
  if (useSales) text = attachSalesSpreadsheets(text, taxReturn, dir);
  text = setText(text, "Your1stName:", person.firstName);
  text = setText(text, "YourLastName:", person.lastName);
  text = setText(text, "YourSocSec#:", digits(person.ssn));
  text = setText(text, "Spouse1stName:", person.spouseFirstName);
  text = setText(text, "SpouseLastName:", person.spouseLastName);
  text = setText(text, "SpouseSocSec#:", digits(person.spouseSsn));
  text = setText(text, "Number&Street:", person.street);
  text = setText(text, "Town/City:", person.city);
  text = setText(text, "State:", person.state);
  text = setText(text, "ZipCode:", person.zip);
  text = setText(text, "YourOccupat:", person.occupation);
  text = setText(text, "SpouseOccupat:", person.spouseOccupation);

  const file = path.join(dir, filename);
  fs.writeFileSync(file, text);
  return file;
}

export function writeForm8995(
  taxReturn: TaxReturn,
  federalOut: string,
  scheduleCOut: string,
  dir: string,
): string {
  let text = readTemplate("Form_8995", "Form_8995_template.txt");
  text = setText(text, "FileName1040", federalOut);
  text = setText(text, "FileNameSchC", scheduleCOut);
  text = setText(text, "L1_i_a:", taxReturn.scheduleC.businessName || "Business");
  text = setText(text, "L1_i_b:", digits(taxReturn.scheduleC.ein));
  text = setNumeric(text, "L1_i_c", 0);
  // Upstream template puts a bare ";" on L1_iii_a. OTS treats any non-empty
  // name plus a zero amount as another auto-calculated copy of Schedule C.
  text = setText(text, "L1_iii_a:", "");
  const file = path.join(dir, "form_8995.txt");
  fs.writeFileSync(file, text);
  return file;
}

export function moneyLabel(value: number): string {
  return money(value);
}

function csvCell(value: string): string {
  return value.replace(/[",\r\n]/g, " ").trim();
}

/** OTS reads month-day-year. ISO dates are converted. Blank dates use various-short or various-long. */
function otsDate(iso: string, term: Sale["term"]): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return term === "long" ? "various-long" : "various-short";
  return `${Number(match[2])}-${Number(match[3])}-${match[1]}`;
}

function saleCsv(sales: Sale[]): string {
  const rows = ["Description,Date_Acquired,Date_Sold,Proceeds,Cost,Code,Adjustment"];
  for (const sale of sales) {
    const code = sale.washSale > 0 ? "W" : "";
    const adjustment = sale.washSale > 0 ? money(sale.washSale) : "";
    rows.push(
      [
        csvCell(sale.description || "Security"),
        otsDate(sale.dateAcquired, sale.term),
        otsDate(sale.dateSold, sale.term || "short"),
        money(sale.proceeds),
        money(sale.cost),
        code,
        adjustment,
      ].join(","),
    );
  }
  return rows.join("\n") + "\n";
}

/**
 * After the label word, OTS reads the rest of that same line as the CSV
 * path (comments in braces are skipped). The CapGains label still has to
 * follow. Summary lines D1ad/D1ae stay at zero when a spreadsheet is
 * attached, or the same gain would be counted twice.
 */
function attachSalesSpreadsheets(text: string, taxReturn: TaxReturn, dir: string): string {
  const groups: { label: string; file: string; sales: Sale[] }[] = [
    {
      label: "f8949_spreadsheet-A/D:",
      file: "f8949_ad.csv",
      sales: taxReturn.sales.filter((sale) => sale.basisReported && !sale.digitalAsset),
    },
    {
      label: "f8949_spreadsheet-B/E:",
      file: "f8949_be.csv",
      sales: taxReturn.sales.filter((sale) => !sale.basisReported && !sale.digitalAsset),
    },
    {
      label: "f8949_spreadsheet-G/J:",
      file: "f8949_gj.csv",
      sales: taxReturn.sales.filter((sale) => sale.basisReported && sale.digitalAsset),
    },
    {
      label: "f8949_spreadsheet-H/K:",
      file: "f8949_hk.csv",
      sales: taxReturn.sales.filter((sale) => !sale.basisReported && sale.digitalAsset),
    },
  ];
  let next = text;
  for (const group of groups) {
    if (group.sales.length === 0) continue;
    const full = path.join(dir, group.file);
    fs.writeFileSync(full, saleCsv(group.sales));
    const lines = next.split("\n");
    const index = lines.findIndex((line) => line.trimStart().startsWith(group.label));
    if (index < 0) {
      throw new Error(
        `OTS template is missing "${group.label}". A yearly update renamed it; see src/lib/ots/ADAPTER.md.`,
      );
    }
    const brace = lines[index].indexOf("{");
    lines[index] =
      brace >= 0
        ? `${lines[index].slice(0, brace)}${full} ${lines[index].slice(brace)}`
        : `${lines[index]} ${full}`;
    next = lines.join("\n");
  }
  return next;
}

/** Rev. Proc. 2024-25: 2025 HSA limits. Full-year eligibility is assumed. */
const HSA_SELF = 4300;
const HSA_FAMILY = 8550;
const HSA_CATCHUP = 1000;

export function hsaLimitation(taxReturn: TaxReturn): number {
  const family = taxReturn.hsa.coverage === "family";
  const base = family ? HSA_FAMILY : HSA_SELF;
  return base + (taxReturn.hsa.age55OrOlder ? HSA_CATCHUP : 0);
}

export function writeForm8889(taxReturn: TaxReturn, dir: string): string {
  const person = taxReturn.personal;
  const coverage = taxReturn.hsa.coverage === "family" ? "Family" : "Self-Only";
  const lines = [
    "Title: 8889 HSA Form - 2025",
    `YourName: ${person.firstName} ${person.lastName}`.trim(),
    `YourSocSec#: ${digits(person.ssn)}`,
    `L1: ${coverage}`,
    `L2 ${money(taxReturn.hsa.contributions)} ;`,
    `L3 ${money(hsaLimitation(taxReturn))} ;`,
    "L4 0.00 ;",
    "L6 0.00 ;",
    "L7 0.00 ;",
    `L9 ${money(hsaEmployer(taxReturn))} ;`,
    "L10 0.00 ;",
    `L14a ${money(taxReturn.hsa.distributions)} ;`,
    "L14b 0.00 ;",
    `L15 ${money(taxReturn.hsa.qualifiedMedical)} ;`,
    `L17a: ${taxReturn.hsa.distributionException ? "Y" : "N"}`,
    "L18 0.00 ;",
    "L19 0.00 ;",
    "",
  ];
  const file = path.join(dir, "form_8889.txt");
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}

export function writeForm8812(
  taxReturn: TaxReturn,
  input: { agi: number; creditLimit: number; earnedIncome: number; seDeduction: number },
  dir: string,
): string {
  const person = taxReturn.personal;
  const counts = dependentCounts(taxReturn);
  const lines = [
    "Title: Form 8812 - 2025",
    `Status ${STATUS[person.filingStatus]}`,
    `L1 ${money(input.agi)} ;`,
    "L2a 0.00 ;",
    "L2b 0.00 ;",
    "L2c 0.00 ;",
    `L4 ${counts.qualifyingChildren} ;`,
    `L6 ${counts.otherDependents} ;`,
    `L13 ${money(input.creditLimit)} ;`,
    "Amnt19 0.00 ;",
    `L18a ${money(input.earnedIncome)} ;`,
    "L18b 0.00 ;",
    "L21 0.00 ;",
    `L22 ${money(input.seDeduction)} ;`,
    "L24 0.00 ;",
    `YourName: ${person.firstName} ${person.lastName}`.trim(),
    `SocSec: ${digits(person.ssn)}`,
    "",
  ];
  const file = path.join(dir, "form_8812.txt");
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}
