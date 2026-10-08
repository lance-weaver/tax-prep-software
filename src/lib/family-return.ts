import { TAX_YEAR, type TaxReturn } from "./return-types";
import { sampleReturn } from "./sample-return";

/**
 * Fake family used by the smoke test. Not a real household.
 *
 * Married filing jointly. Two qualifying children (one born in 2025).
 * Mortgage interest, church gifts, bank interest with a Treasury piece,
 * Robinhood sales including a wash sale, and a short-term loss carryover.
 * Itemized deductions are built to exceed the married standard deduction
 * so OpenTaxSolver's larger-of test is the one under check.
 */
export const familyReturn: TaxReturn = {
  ...sampleReturn,
  personal: {
    ...sampleReturn.personal,
    firstName: "Alex",
    lastName: "Sample",
    ssn: "999-00-9999",
    spouseFirstName: "Jordan",
    spouseLastName: "Sample",
    spouseSsn: "999-00-8888",
    occupation: "Guide",
    spouseOccupation: "Teacher",
    filingStatus: "mfj",
  },
  dependents: [
    {
      name: "Casey Sample",
      relationship: "child",
      birthDate: "2016-04-02",
      monthsLived: 12,
      ssn: "999-00-1111",
    },
    {
      name: "Riley Sample",
      relationship: "child",
      birthDate: "2025-03-15",
      monthsLived: 9,
      ssn: "999-00-2222",
    },
  ],
  w2s: [
    {
      employer: "Sample National Park Co",
      wages: 90000,
      federalWithholding: 8000,
      socialSecurityWages: 90000,
      stateWages: 90000,
      stateWithholding: 4000,
      hsaEmployer: 0,
    },
  ],
  scheduleC: {
    ...sampleReturn.scheduleC,
    grossReceipts: 12000,
    advertising: 400,
    insurance: 600,
    office: 200,
    supplies: 300,
    travel: 300,
    deductibleMeals: 100,
    otherExpenses: 100,
    otherDescription: "Permits and maps",
  },
  investments: {
    ordinaryDividends: 600,
    qualifiedDividends: 400,
    capitalGainDistributions: 50,
    shortTermGain: 0,
    longTermGain: 0,
  },
  interest: [
    { payer: "First National Sample Bank", box1: 800, box3: 200, box4: 15 },
  ],
  sales: [
    {
      description: "Sample index fund",
      dateAcquired: "2025-02-03",
      dateSold: "2025-09-12",
      proceeds: 1500,
      cost: 1000,
      basisReported: true,
      washSale: 0,
      digitalAsset: false,
      term: "",
    },
    {
      description: "Sample wash lot",
      dateAcquired: "2025-01-10",
      dateSold: "2025-03-04",
      proceeds: 800,
      cost: 1000,
      basisReported: true,
      washSale: 200,
      digitalAsset: false,
      term: "",
    },
    {
      description: "Sample long fund",
      dateAcquired: "2023-05-01",
      dateSold: "2025-06-18",
      proceeds: 3000,
      cost: 2000,
      basisReported: true,
      washSale: 0,
      digitalAsset: false,
      term: "",
    },
  ],
  charity: [
    {
      name: "Sample Community Church",
      date: "2025-12-15",
      cash: true,
      amount: 8000,
    },
    {
      name: "Sample Thrift Shop",
      date: "2025-11-02",
      cash: false,
      amount: 600,
    },
  ],
  mortgage: {
    lender: "Sample Mortgage Co",
    interest: 18000,
    points: 0,
    mortgageInsurance: 400,
    propertyTax: 4500,
  },
  payments: {
    ...sampleReturn.payments,
    federalEstimated: 0,
    utahPrepayments: 0,
  },
  estimates: [
    { date: "2025-04-15", federal: 250, utah: 100 },
    { date: "2025-06-15", federal: 250, utah: 100 },
    { date: "2025-09-15", federal: 250, utah: 100 },
    { date: "2026-01-15", federal: 250, utah: 100 },
  ],
  lastYear: {
    agi: 140000,
    totalTax: 12000,
    shortTermLossCarryover: 400,
    longTermLossCarryover: 0,
    stateRefund: 0,
    itemized: false,
    overpaymentApplied: 0,
    filingStatus: "mfj",
  },
  other: {
    ...sampleReturn.other,
    studentLoanInterest: 1000,
    foreignTax: 25,
    miscIncome: 40,
  },
  taxYear: TAX_YEAR,
};
