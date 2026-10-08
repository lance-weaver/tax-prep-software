import type { TaxReturn } from "../return-types";
import { emptyW2 } from "../normalize-return";

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  source: string;
}

export interface ParsedDocument {
  form: string;
  fields: ExtractedField[];
}

function field(id: string, label: string, value: string, source: string): ExtractedField {
  return { id, label, value: value.trim(), source };
}

function money(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (!match) return null;
  const cleaned = match[1].replace(/[$,]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function after(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Map a text layer onto form boxes. The patterns are written for the fake
 * sample PDFs this app generates, and they also accept the same box labels
 * when a real form's text layer uses them. Nothing is saved until the
 * person confirms the review screen.
 */
export function parseTaxDocument(text: string): ParsedDocument {
  const flat = text.replace(/\s+/g, " ").trim();
  const fields: ExtractedField[] = [];

  if (/Form W-2/i.test(flat) || /Wage and Tax Statement/i.test(flat)) {
    pushMoney(fields, flat, "w2.wages", "Box 1 wages", /Box 1[^0-9]{0,40}([0-9,]+\.\d{2})/, "W-2 box 1");
    pushMoney(fields, flat, "w2.federalWithholding", "Box 2 federal withholding", /Box 2[^0-9]{0,48}([0-9,]+\.\d{2})/, "W-2 box 2");
    pushMoney(fields, flat, "w2.socialSecurityWages", "Box 3 Social Security wages", /Box 3[^0-9]{0,48}([0-9,]+\.\d{2})/, "W-2 box 3");
    pushMoney(fields, flat, "w2.stateWages", "Box 16 state wages", /Box 16[^0-9]{0,40}([0-9,]+\.\d{2})/, "W-2 box 16");
    pushMoney(fields, flat, "w2.stateWithholding", "Box 17 state withholding", /Box 17[^0-9]{0,40}([0-9,]+\.\d{2})/, "W-2 box 17");
    pushMoney(fields, flat, "w2.hsaEmployer", "Box 12 code W", /Box 12[^0-9]{0,24}W[^0-9]{0,12}([0-9,]+\.\d{2})/, "W-2 box 12 code W");
    const employer = after(flat, /Employer[: ]+(.+?)(?= Box |$)/);
    if (employer) fields.push(field("w2.employer", "Employer", employer, "W-2 employer"));
    return { form: "W-2", fields };
  }

  if (/1099-INT/i.test(flat)) {
    pushMoney(fields, flat, "int.box1", "Box 1 interest", /Box 1[^0-9]{0,40}([0-9,]+\.\d{2})/, "1099-INT box 1");
    pushMoney(fields, flat, "int.box3", "Box 3 Treasury interest", /Box 3[^0-9]{0,60}([0-9,]+\.\d{2})/, "1099-INT box 3");
    pushMoney(fields, flat, "int.box4", "Box 4 federal withholding", /Box 4[^0-9]{0,40}([0-9,]+\.\d{2})/, "1099-INT box 4");
    const payer = after(flat, /PAYER[: ]+(.+?)(?= Box |$)/);
    if (payer) fields.push(field("int.payer", "Payer", payer, "1099-INT payer"));
    return { form: "1099-INT", fields };
  }

  if (/1099-DIV/i.test(flat)) {
    pushMoney(fields, flat, "div.ordinary", "Box 1a ordinary dividends", /Box 1a[^0-9]{0,40}([0-9,]+\.\d{2})/, "1099-DIV box 1a");
    pushMoney(fields, flat, "div.qualified", "Box 1b qualified dividends", /Box 1b[^0-9]{0,40}([0-9,]+\.\d{2})/, "1099-DIV box 1b");
    pushMoney(fields, flat, "div.capgain", "Box 2a capital gain distributions", /Box 2a[^0-9]{0,48}([0-9,]+\.\d{2})/, "1099-DIV box 2a");
    pushMoney(fields, flat, "div.foreign", "Box 7 foreign tax", /Box 7[^0-9]{0,40}([0-9,]+\.\d{2})/, "1099-DIV box 7");
    return { form: "1099-DIV", fields };
  }

  if (/1098/i.test(flat) && /Mortgage/i.test(flat)) {
    pushMoney(fields, flat, "mortgage.interest", "Box 1 mortgage interest", /Box 1[^0-9]{0,40}([0-9,]+\.\d{2})/, "1098 box 1");
    pushMoney(fields, flat, "mortgage.points", "Box 6 points", /Box 6[^0-9]{0,30}([0-9,]+\.\d{2})/, "1098 box 6");
    pushMoney(fields, flat, "mortgage.propertyTax", "Box 10 property tax", /Box 10[^0-9]{0,40}([0-9,]+\.\d{2})/, "1098 box 10");
    pushMoney(fields, flat, "mortgage.mortgageInsurance", "Box 5 mortgage insurance", /Box 5[^0-9]{0,40}([0-9,]+\.\d{2})/, "1098 box 5");
    const lender = after(flat, /RECIPIENT[: ]+(.+?)(?= Box |$)/);
    if (lender) fields.push(field("mortgage.lender", "Lender", lender, "1098 recipient"));
    return { form: "1098", fields };
  }

  return { form: "unknown", fields };
}

/** Copy confirmed boxes onto the return. The caller still has to save. */
export function applyExtracted(taxReturn: TaxReturn, fields: ExtractedField[]): TaxReturn {
  const next: TaxReturn = structuredClone(taxReturn);
  const value = (id: string) => fields.find((field) => field.id === id)?.value;
  const amount = (id: string) => {
    const raw = value(id);
    if (raw === undefined) return undefined;
    const parsed = Number(raw.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const set = (id: string, write: (amount: number) => void) => {
    const parsed = amount(id);
    if (parsed !== undefined) write(parsed);
  };

  if (fields.some((field) => field.id.startsWith("w2."))) {
    if (next.w2s.length === 0) next.w2s.push(emptyW2());
    const w2 = next.w2s[0];
    const employer = value("w2.employer");
    if (employer) w2.employer = employer;
    set("w2.wages", (n) => { w2.wages = n; });
    set("w2.federalWithholding", (n) => { w2.federalWithholding = n; });
    set("w2.socialSecurityWages", (n) => { w2.socialSecurityWages = n; });
    set("w2.stateWages", (n) => { w2.stateWages = n; });
    set("w2.stateWithholding", (n) => { w2.stateWithholding = n; });
    set("w2.hsaEmployer", (n) => { w2.hsaEmployer = n; });
  }
  if (fields.some((field) => field.id.startsWith("int."))) {
    const payer = value("int.payer") || "1099-INT";
    let row = next.interest.find((item) => item.payer === payer);
    if (!row) {
      row = { payer, box1: 0, box3: 0, box4: 0 };
      next.interest.push(row);
    }
    set("int.box1", (n) => { row.box1 = n; });
    set("int.box3", (n) => { row.box3 = n; });
    set("int.box4", (n) => { row.box4 = n; });
  }
  set("div.ordinary", (n) => { next.investments.ordinaryDividends = n; });
  set("div.qualified", (n) => { next.investments.qualifiedDividends = n; });
  set("div.capgain", (n) => { next.investments.capitalGainDistributions = n; });
  set("div.foreign", (n) => { next.other.foreignTax = n; });
  if (fields.some((field) => field.id.startsWith("mortgage."))) {
    const lender = value("mortgage.lender");
    if (lender) next.mortgage.lender = lender;
    set("mortgage.interest", (n) => { next.mortgage.interest = n; });
    set("mortgage.points", (n) => { next.mortgage.points = n; });
    set("mortgage.propertyTax", (n) => { next.mortgage.propertyTax = n; });
    set("mortgage.mortgageInsurance", (n) => { next.mortgage.mortgageInsurance = n; });
  }
  return next;
}

function pushMoney(
  fields: ExtractedField[],
  text: string,
  id: string,
  label: string,
  pattern: RegExp,
  source: string,
): void {
  const value = money(text, pattern);
  if (value !== null) fields.push(field(id, label, value, source));
}

export const sampleW2Text = [
  "FAKE SAMPLE  Form W-2 Wage and Tax Statement",
  "Employer: Sample National Park Co",
  "Box 1 Wages, tips, other compensation 64000.00",
  "Box 2 Federal income tax withheld 7200.00",
  "Box 3 Social security wages 64000.00",
  "Box 12 W 500.00",
  "Box 16 State wages 64000.00",
  "Box 17 State income tax 2800.00",
].join("\n");

export const sampleIntText = [
  "FAKE SAMPLE  Form 1099-INT",
  "PAYER: First National Sample Bank",
  "Box 1 Interest income 800.00",
  "Box 3 Interest on U.S. Savings Bonds and Treasury obligations 200.00",
  "Box 4 Federal income tax withheld 15.00",
].join("\n");

export const sampleDivText = [
  "FAKE SAMPLE  Form 1099-DIV",
  "Box 1a Total ordinary dividends 600.00",
  "Box 1b Qualified dividends 400.00",
  "Box 2a Total capital gain distributions 50.00",
  "Box 7 Foreign tax paid 25.00",
].join("\n");

export const sample1098Text = [
  "FAKE SAMPLE  Form 1098 Mortgage Interest Statement",
  "RECIPIENT: Sample Mortgage Co",
  "Box 1 Mortgage interest received 18000.00",
  "Box 5 Mortgage insurance premiums 400.00",
  "Box 6 Points paid 0.00",
  "Box 10 Property taxes 4500.00",
].join("\n");
