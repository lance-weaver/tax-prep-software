import type { Dependent, TaxReturn } from "./return-types";
import { TAX_YEAR } from "./return-types";

export interface DependentCounts {
  /** Qualifying children under 17 with a 9-digit SSN. Form 8812 line 4. */
  qualifyingChildren: number;
  /** Other dependents for the $500 credit. Form 8812 line 6. */
  otherDependents: number;
  /** Utah TC-40 line 2a. Includes newborns. */
  utahAge16OrUnder: number;
  /** Utah TC-40 line 2b. */
  utahOther: number;
  /** Utah TC-40 line 2c. Newborns already included on line 2a. */
  utahBornThisYear: number;
  missingSsn: string[];
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function birthYear(value: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1900 || year > TAX_YEAR) return null;
  return year;
}

/**
 * Qualifying-child age for the 2025 child tax credit is 16 or under on
 * December 31, 2025 (born in 2009 or later). A child born in 2025 qualifies
 * even with fewer than 7 months in the home: the IRS treats the home as the
 * child's home for more than half the time the child was alive. Everyone
 * else needs months lived of at least 7 ("more than half the year").
 *
 * Relationship is stored and not tested. A 9-digit number is treated as an
 * SSN; an ITIN is not distinguished. Missing digits means no $2,200 credit.
 */
export function classifyDependent(dependent: Dependent): {
  childTaxCredit: boolean;
  otherDependent: boolean;
  newborn: boolean;
  hasSsn: boolean;
} {
  const year = birthYear(dependent.birthDate);
  const age = year === null ? null : TAX_YEAR - year;
  const newborn = year === TAX_YEAR;
  const months = dependent.monthsLived;
  const livedEnough = newborn || months >= 7;
  const hasSsn = digits(dependent.ssn).length === 9;
  const childTaxCredit = age !== null && age <= 16 && livedEnough && hasSsn;
  const otherDependent = !childTaxCredit && livedEnough && (age === null || age >= 17);
  return { childTaxCredit, otherDependent, newborn, hasSsn };
}

export function countsFromList(dependents: Dependent[]): DependentCounts {
  const counts: DependentCounts = {
    qualifyingChildren: 0,
    otherDependents: 0,
    utahAge16OrUnder: 0,
    utahOther: 0,
    utahBornThisYear: 0,
    missingSsn: [],
  };
  for (const dependent of dependents) {
    const row = classifyDependent(dependent);
    const year = birthYear(dependent.birthDate);
    const age = year === null ? null : TAX_YEAR - year;
    if (row.childTaxCredit) {
      counts.qualifyingChildren += 1;
      counts.utahAge16OrUnder += 1;
      if (row.newborn) counts.utahBornThisYear += 1;
    } else if (row.otherDependent) {
      counts.otherDependents += 1;
      counts.utahOther += 1;
    }
    if ((age === null || age <= 16) && !row.hasSsn && dependent.name) {
      counts.missingSsn.push(dependent.name);
    }
  }
  return counts;
}

/** Prefer the dependent list. Fall back to the three counts on older saved returns. */
export function dependentCounts(taxReturn: TaxReturn): DependentCounts {
  if (taxReturn.dependents.length > 0) return countsFromList(taxReturn.dependents);
  return {
    qualifyingChildren: taxReturn.personal.dependentsAge16OrUnder,
    otherDependents: taxReturn.personal.otherDependents,
    utahAge16OrUnder: taxReturn.personal.dependentsAge16OrUnder,
    utahOther: taxReturn.personal.otherDependents,
    utahBornThisYear: Math.min(
      taxReturn.personal.dependentsAge16OrUnder,
      taxReturn.personal.dependentsBornThisYear,
    ),
    missingSsn: [],
  };
}
