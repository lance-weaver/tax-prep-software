/** One saved return. All figures are dollars unless noted. Sample data must stay fake. */

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh" | "qw";

export interface W2 {
  employer: string;
  wages: number;
  federalWithholding: number;
  socialSecurityWages: number;
  stateWages: number;
  stateWithholding: number;
}

export interface ScheduleC {
  businessName: string;
  principalBusiness: string;
  ein: string;
  activityCode: string;
  accountingMethod: "Cash" | "Accrual" | "Other";
  materiallyParticipated: boolean;
  acquiredThisYear: boolean;
  grossReceipts: number;
  returnsAndAllowances: number;
  advertising: number;
  carAndTruck: number;
  commissions: number;
  insurance: number;
  legalAndProfessional: number;
  office: number;
  supplies: number;
  taxesAndLicenses: number;
  travel: number;
  /** Already the deductible amount (generally 50% of meal cost). */
  deductibleMeals: number;
  utilities: number;
  otherExpenses: number;
  otherDescription: string;
}

export interface TaxReturn {
  taxYear: number;
  personal: {
    firstName: string;
    lastName: string;
    ssn: string;
    spouseFirstName: string;
    spouseLastName: string;
    spouseSsn: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    occupation: string;
    spouseOccupation: string;
    filingStatus: FilingStatus;
    you65OrOlder: boolean;
    youBlind: boolean;
    spouse65OrOlder: boolean;
    spouseBlind: boolean;
    homeInUs: boolean;
    digitalAssets: boolean;
    /** Count of qualifying dependents age 16 or under on Dec 31. Newborns are included here. */
    dependentsAge16OrUnder: number;
    /** Other dependents (not yourself, not a spouse, not already in the line above). */
    otherDependents: number;
    /** Newborns already included in dependentsAge16OrUnder. Utah counts them again on TC-40 line 2c. */
    dependentsBornThisYear: number;
  };
  w2s: W2[];
  scheduleC: ScheduleC;
  investments: {
    ordinaryDividends: number;
    qualifiedDividends: number;
    capitalGainDistributions: number;
    shortTermGain: number;
    longTermGain: number;
  };
  payments: {
    federalEstimated: number;
    utahWithholdingExtra: number;
    utahPrepayments: number;
    /** Taxable state refund reported on 2025 Schedule 1. */
    stateTaxRefund: number;
    /** Utah line 7 applies only if last year's federal return was itemized. */
    itemizedLastYear: boolean;
  };
}

export interface LineAmount {
  line: string;
  label: string;
  amount: number;
}

export interface ReturnSummary {
  federal: {
    agi: number;
    standardOrItemized: number;
    qbiDeduction: number;
    taxableIncome: number;
    incomeTax: number;
    seTax: number;
    totalTax: number;
    payments: number;
    refund: number;
    amountOwed: number;
  };
  utah: {
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
  };
  notes: string[];
  files: string[];
}

export const TAX_YEAR = 2025;
