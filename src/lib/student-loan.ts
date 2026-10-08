import type { FilingStatus } from "./return-types";

/**
 * Student loan interest deduction for 2025.
 *
 * Rev. Proc. 2024-40, section 3.30, and IRS Publication 970 (2025):
 * the maximum deduction is $2,500. It phases out between MAGI of
 * $85,000 and $100,000 for single, head of household, and qualifying
 * surviving spouse, and between $170,000 and $200,000 for married
 * filing jointly. Married filing separately cannot take the deduction.
 *
 * MAGI here is AGI from a Form 1040 pass that excludes this deduction.
 * The qualified business income deduction is below AGI, so it is not
 * part of that MAGI. OpenTaxSolver accepts the result on Schedule 1
 * line 21 and does not compute the phase-out itself.
 */
const MAX = 2500;

const PHASEOUT: Record<FilingStatus, { floor: number; ceiling: number } | null> = {
  single: { floor: 85000, ceiling: 100000 },
  hoh: { floor: 85000, ceiling: 100000 },
  qw: { floor: 85000, ceiling: 100000 },
  mfj: { floor: 170000, ceiling: 200000 },
  mfs: null,
};

export function studentLoanDeduction(
  interestPaid: number,
  magi: number,
  status: FilingStatus,
): number {
  const band = PHASEOUT[status];
  if (!band || interestPaid <= 0) return 0;
  const tentative = Math.min(interestPaid, MAX);
  if (magi <= band.floor) return roundCents(tentative);
  if (magi >= band.ceiling) return 0;
  const fraction = (magi - band.floor) / (band.ceiling - band.floor);
  return roundCents(tentative * (1 - fraction));
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
