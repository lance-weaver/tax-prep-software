import type { TaxReturn } from "./return-types";

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function taxableInterest(taxReturn: TaxReturn): number {
  return roundCents(
    taxReturn.interest.reduce((sum, row) => sum + row.box1 + row.box3, 0),
  );
}

/** Box 3 is federally taxable and subtracted on Utah TC-40 line 8. */
export function treasuryInterest(taxReturn: TaxReturn): number {
  return roundCents(taxReturn.interest.reduce((sum, row) => sum + row.box3, 0));
}

export function interestWithholding(taxReturn: TaxReturn): number {
  return roundCents(taxReturn.interest.reduce((sum, row) => sum + row.box4, 0));
}

export function federalEstimates(taxReturn: TaxReturn): number {
  const dated = taxReturn.estimates.reduce((sum, row) => sum + row.federal, 0);
  const base = dated > 0 ? dated : taxReturn.payments.federalEstimated;
  return roundCents(base + taxReturn.lastYear.overpaymentApplied);
}

export function utahEstimates(taxReturn: TaxReturn): number {
  const dated = taxReturn.estimates.reduce((sum, row) => sum + row.utah, 0);
  return roundCents(dated > 0 ? dated : taxReturn.payments.utahPrepayments);
}

/**
 * State income tax for Schedule A line 5a: Utah withholding plus Utah
 * estimates paid during the year. Property tax is line 5b, not here.
 * OpenTaxSolver applies the 2025 SALT cap ($40,000, or $20,000 if
 * married filing separately, with the high-AGI worksheet).
 */
export function stateIncomeTaxPaid(taxReturn: TaxReturn): number {
  const withheld = taxReturn.w2s.reduce((sum, w2) => sum + w2.stateWithholding, 0);
  return roundCents(
    withheld + taxReturn.payments.utahWithholdingExtra + utahEstimates(taxReturn),
  );
}

export function charityTotals(taxReturn: TaxReturn): { cash: number; noncash: number } {
  let cash = 0;
  let noncash = 0;
  for (const gift of taxReturn.charity) {
    if (gift.cash) cash += gift.amount;
    else noncash += gift.amount;
  }
  return { cash: roundCents(cash), noncash: roundCents(noncash) };
}

/**
 * A state refund is taxable on Schedule 1 only when last year's federal
 * return itemized. The explicit payments field wins when it is filled in.
 */
export function taxableStateRefund(taxReturn: TaxReturn): number {
  if (taxReturn.payments.stateTaxRefund) return taxReturn.payments.stateTaxRefund;
  const itemized = taxReturn.payments.itemizedLastYear || taxReturn.lastYear.itemized;
  return itemized ? taxReturn.lastYear.stateRefund : 0;
}

export function itemizedLastYear(taxReturn: TaxReturn): boolean {
  return taxReturn.payments.itemizedLastYear || taxReturn.lastYear.itemized;
}

/**
 * Form 1040 instructions: foreign tax on a 1099 can go on Schedule 3
 * line 1 without Form 1116 when it is passive and not over $300
 * ($600 if married filing jointly). Above that, this app does not
 * prepare Form 1116 and does not claim the credit.
 */
export function foreignTaxElection(taxReturn: TaxReturn): {
  credit: number;
  note: string | null;
} {
  const tax = taxReturn.other.foreignTax;
  if (tax <= 0) return { credit: 0, note: null };
  const limit = taxReturn.personal.filingStatus === "mfj" ? 600 : 300;
  if (tax <= limit + 0.001) {
    return {
      credit: roundCents(tax),
      note: `Foreign tax of $${tax.toFixed(2)} is claimed on Schedule 3 line 1 without Form 1116. That election is for passive foreign tax reported on a 1099, up to $${limit.toFixed(0)}.`,
    };
  }
  return {
    credit: 0,
    note: `Foreign tax of $${tax.toFixed(2)} is over the $${limit.toFixed(0)} limit for claiming it without Form 1116. Form 1116 is not prepared, so the credit is not claimed.`,
  };
}

export function hsaEmployer(taxReturn: TaxReturn): number {
  const fromW2 = taxReturn.w2s.reduce((sum, w2) => sum + w2.hsaEmployer, 0);
  return roundCents(taxReturn.hsa.employerContributions || fromW2);
}

export function hsaActive(taxReturn: TaxReturn): boolean {
  const hsa = taxReturn.hsa;
  return (
    hsa.coverage !== "none" ||
    hsa.contributions > 0 ||
    hsa.distributions > 0 ||
    hsaEmployer(taxReturn) > 0
  );
}
