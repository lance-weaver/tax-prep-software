import type { FilingStatus } from "./return-types";

/**
 * Estimated-tax safe harbor, Form 1040-ES / Form 2210 instructions.
 * Withholding plus timely estimates must be at least the smaller of
 * 90% of this year's tax or 100% of last year's tax. The prior-year
 * percentage is 110% when last year's AGI was more than $150,000
 * ($75,000 if married filing separately). This note uses the prior-year
 * test only. Form 2210 is not prepared, and payment dates are stored
 * but not tested for timeliness.
 */
export function safeHarbor(input: {
  status: FilingStatus;
  priorAgi: number;
  priorTotalTax: number;
  withholding: number;
  estimates: number;
  overpaymentApplied: number;
}): {
  priorTax: number;
  percent: number;
  required: number;
  paid: number;
  met: boolean;
  note: string;
} | null {
  if (input.priorTotalTax <= 0 && input.priorAgi <= 0) return null;
  const highAgi = input.status === "mfs" ? 75000 : 150000;
  const percent = input.priorAgi > highAgi ? 110 : 100;
  const required = roundCents((input.priorTotalTax * percent) / 100);
  const paid = roundCents(
    input.withholding + input.estimates + input.overpaymentApplied,
  );
  const met = paid + 0.005 >= required;
  const note = met
    ? `Prior-year safe harbor looks met: withholding, estimates, and any applied overpayment are ${money(paid)}, and ${percent}% of last year's total tax is ${money(required)}. Form 2210 is not prepared, and this does not check whether each estimate was on time.`
    : `Prior-year safe harbor is short: withholding, estimates, and any applied overpayment are ${money(paid)}, and ${percent}% of last year's total tax is ${money(required)}. The 110% rate applies when last year's AGI was over ${money(highAgi)}. Form 2210 is not prepared.`;
  return {
    priorTax: input.priorTotalTax,
    percent,
    required,
    paid,
    met,
    note,
  };
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
