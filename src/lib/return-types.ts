/** One saved return. All figures are dollars unless noted. Sample data must stay fake. */

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh" | "qw";

export interface W2 {
  employer: string;
  wages: number;
  federalWithholding: number;
  socialSecurityWages: number;
  stateWages: number;
  stateWithholding: number;
  /** Box 12 code W, employer HSA contributions. Also entered on the HSA section. */
  hsaEmployer: number;
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

export interface Dependent {
  name: string;
  relationship: string;
  /** ISO date, YYYY-MM-DD. Age is measured on December 31 of the tax year. */
  birthDate: string;
  monthsLived: number;
  ssn: string;
}

export interface CharityGift {
  name: string;
  date: string;
  /** Cash or check. False means property (non-cash). */
  cash: boolean;
  amount: number;
}

export interface Mortgage1098 {
  lender: string;
  /** Box 1, mortgage interest. */
  interest: number;
  /** Box 6, points. Included with interest on Schedule A line 8a. */
  points: number;
  /** Stored only. OTS 23.07 has no line for mortgage insurance premiums. */
  mortgageInsurance: number;
  /** Real estate tax paid through escrow. Schedule A line 5b. */
  propertyTax: number;
}

export interface Interest1099 {
  payer: string;
  /** Box 1, interest income. Federally taxable. */
  box1: number;
  /** Box 3, Treasury and savings-bond interest. Federally taxable, subtracted on the Utah return. */
  box3: number;
  /** Box 4, federal income tax withheld. */
  box4: number;
}

export interface Sale {
  description: string;
  /** YYYY-MM-DD, or blank when the holding period is entered as various. */
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  cost: number;
  basisReported: boolean;
  /** Disallowed wash-sale loss. A positive amount is Form 8949 code W. */
  washSale: number;
  digitalAsset: boolean;
  /** Used when dates are blank. Ignored when both dates are present. */
  term: "" | "short" | "long";
}

export interface EstimatePayment {
  date: string;
  federal: number;
  utah: number;
}

export interface LastYear {
  agi: number;
  totalTax: number;
  /** Positive dollar amount of the short-term capital-loss carryover. */
  shortTermLossCarryover: number;
  longTermLossCarryover: number;
  stateRefund: number;
  itemized: boolean;
  overpaymentApplied: number;
  filingStatus: FilingStatus | "";
}

export type HsaCoverage = "none" | "self" | "family";

export interface Hsa {
  coverage: HsaCoverage;
  /** Contributions you made, Form 8889 line 2. Employer amounts stay on line 9. */
  contributions: number;
  /** W-2 box 12 code W. */
  employerContributions: number;
  distributions: number;
  qualifiedMedical: number;
  distributionException: boolean;
  /** Age 55 or older at year end. Adds the $1,000 catch-up to the limitation. */
  age55OrOlder: boolean;
}

export interface OtherItems {
  /** Deductible traditional IRA amount. The phase-out worksheet is not computed. */
  traditionalIraDeduction: number;
  /** Recorded only. A Roth contribution is not deductible. */
  rothIraContribution: number;
  /** Interest paid. The allowed deduction is computed in student-loan.ts. */
  studentLoanInterest: number;
  /** Foreign tax paid, typically 1099-DIV box 7. */
  foreignTax: number;
  /** Other income, Schedule 1 line 8z (1099-MISC and similar). */
  miscIncome: number;
  /** Stored so the form can say Form 2441 is not prepared. */
  childCareExpenses: number;
  /** Stored so the form can say the Utah my529 credit is not prepared. */
  my529Contribution: number;
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
  /** When this list has anyone in it, the three counts above are derived from it. */
  dependents: Dependent[];
  w2s: W2[];
  scheduleC: ScheduleC;
  investments: {
    ordinaryDividends: number;
    qualifiedDividends: number;
    capitalGainDistributions: number;
    /**
     * Net short-term and long-term totals. Used only when `sales` is empty.
     * Individual sales go to Form 8949 and are not also added here.
     */
    shortTermGain: number;
    longTermGain: number;
  };
  interest: Interest1099[];
  sales: Sale[];
  charity: CharityGift[];
  mortgage: Mortgage1098;
  payments: {
    federalEstimated: number;
    utahWithholdingExtra: number;
    utahPrepayments: number;
    /** Taxable state refund reported on 2025 Schedule 1. */
    stateTaxRefund: number;
    /** Utah line 7 applies only if last year's federal return was itemized. */
    itemizedLastYear: boolean;
  };
  /** Dated estimates. When any amount is non-zero, these replace the two estimate totals above. */
  estimates: EstimatePayment[];
  lastYear: LastYear;
  hsa: Hsa;
  other: OtherItems;
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
    deductionChoice: "standard" | "itemized";
    itemizedAmount: number;
    standardDeduction: number;
    qbiDeduction: number;
    taxableIncome: number;
    incomeTax: number;
    seTax: number;
    childTaxCredit: number;
    additionalChildTaxCredit: number;
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
  comparison: {
    priorAgi: number;
    agi: number;
    priorTax: number;
    totalTax: number;
  } | null;
  safeHarbor: {
    priorTax: number;
    percent: number;
    required: number;
    paid: number;
    met: boolean;
    note: string;
  } | null;
  notes: string[];
  files: string[];
}

export const TAX_YEAR = 2025;

export interface UsualProfile {
  filingStatus: FilingStatus;
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
  dependents: Dependent[];
  charityNames: string[];
  mortgageLender: string;
  bankNames: string[];
  brokerName: string;
}
