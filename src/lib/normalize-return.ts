import {
  TAX_YEAR,
  type CharityGift,
  type Dependent,
  type EstimatePayment,
  type FilingStatus,
  type HsaCoverage,
  type Interest1099,
  type Sale,
  type TaxReturn,
  type UsualProfile,
  type W2,
} from "./return-types";

const STATUSES = new Set<FilingStatus>(["single", "mfj", "mfs", "hoh", "qw"]);

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function text(value: unknown, max = 80): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]/g, " ").trim().slice(0, max);
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === "Y" || value === "yes";
}

function count(value: unknown): number {
  return Math.max(0, Math.min(20, Math.floor(num(value))));
}

function statusOf(value: unknown, fallback: FilingStatus = "single"): FilingStatus {
  return STATUSES.has(value as FilingStatus) ? (value as FilingStatus) : fallback;
}

function dateOf(value: unknown): string {
  const raw = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function list<T>(value: unknown, map: (row: unknown) => T, max: number): T[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(map);
}

export function normalizeReturn(input: unknown): TaxReturn {
  const body = (input ?? {}) as {
    personal?: Partial<TaxReturn["personal"]>;
    scheduleC?: Partial<TaxReturn["scheduleC"]>;
    investments?: Partial<TaxReturn["investments"]>;
    payments?: Partial<TaxReturn["payments"]>;
    w2s?: Partial<W2>[];
    dependents?: Partial<Dependent>[];
    interest?: Partial<Interest1099>[];
    sales?: Partial<Sale>[];
    charity?: Partial<CharityGift>[];
    mortgage?: Partial<TaxReturn["mortgage"]>;
    estimates?: Partial<EstimatePayment>[];
    lastYear?: Partial<TaxReturn["lastYear"]>;
    hsa?: Partial<TaxReturn["hsa"]>;
    other?: Partial<TaxReturn["other"]>;
  };
  const personal: Partial<TaxReturn["personal"]> = body.personal ?? {};
  const scheduleC: Partial<TaxReturn["scheduleC"]> = body.scheduleC ?? {};
  const investments: Partial<TaxReturn["investments"]> = body.investments ?? {};
  const payments: Partial<TaxReturn["payments"]> = body.payments ?? {};
  const mortgage: Partial<TaxReturn["mortgage"]> = body.mortgage ?? {};
  const lastYear: Partial<TaxReturn["lastYear"]> = body.lastYear ?? {};
  const hsa: Partial<TaxReturn["hsa"]> = body.hsa ?? {};
  const other: Partial<TaxReturn["other"]> = body.other ?? {};
  const status = statusOf(personal.filingStatus);
  const method = scheduleC.accountingMethod;
  const w2s = Array.isArray(body.w2s) ? body.w2s.slice(0, 8) : [];
  const coverage: HsaCoverage =
    hsa.coverage === "self" || hsa.coverage === "family" ? hsa.coverage : "none";

  return {
    taxYear: TAX_YEAR,
    personal: {
      firstName: text(personal.firstName),
      lastName: text(personal.lastName),
      ssn: text(personal.ssn, 11),
      spouseFirstName: text(personal.spouseFirstName),
      spouseLastName: text(personal.spouseLastName),
      spouseSsn: text(personal.spouseSsn, 11),
      street: text(personal.street, 120),
      city: text(personal.city),
      state: text(personal.state, 2).toUpperCase(),
      zip: text(personal.zip, 10),
      occupation: text(personal.occupation),
      spouseOccupation: text(personal.spouseOccupation),
      filingStatus: status,
      you65OrOlder: flag(personal.you65OrOlder),
      youBlind: flag(personal.youBlind),
      spouse65OrOlder: flag(personal.spouse65OrOlder),
      spouseBlind: flag(personal.spouseBlind),
      homeInUs: personal.homeInUs === undefined ? true : flag(personal.homeInUs),
      digitalAssets: flag(personal.digitalAssets),
      dependentsAge16OrUnder: count(personal.dependentsAge16OrUnder),
      otherDependents: count(personal.otherDependents),
      dependentsBornThisYear: count(personal.dependentsBornThisYear),
    },
    dependents: list(body.dependents, (row) => {
      const item = (row ?? {}) as Partial<Dependent>;
      return {
        name: text(item.name),
        relationship: text(item.relationship, 40),
        birthDate: dateOf(item.birthDate),
        monthsLived: Math.max(0, Math.min(12, Math.floor(num(item.monthsLived)))),
        ssn: text(item.ssn, 11),
      };
    }, 12),
    w2s:
      w2s.length > 0
        ? w2s.map((w2) => ({
            employer: text(w2.employer),
            wages: num(w2.wages),
            federalWithholding: num(w2.federalWithholding),
            socialSecurityWages: num(w2.socialSecurityWages),
            stateWages: num(w2.stateWages),
            stateWithholding: num(w2.stateWithholding),
            hsaEmployer: num(w2.hsaEmployer),
          }))
        : [emptyW2()],
    scheduleC: {
      businessName: text(scheduleC.businessName),
      principalBusiness: text(scheduleC.principalBusiness),
      ein: text(scheduleC.ein, 12),
      activityCode: text(scheduleC.activityCode, 6) || "561500",
      accountingMethod:
        method === "Accrual" || method === "Other" ? method : "Cash",
      materiallyParticipated:
        scheduleC.materiallyParticipated === undefined
          ? true
          : flag(scheduleC.materiallyParticipated),
      acquiredThisYear: flag(scheduleC.acquiredThisYear),
      grossReceipts: num(scheduleC.grossReceipts),
      returnsAndAllowances: num(scheduleC.returnsAndAllowances),
      advertising: num(scheduleC.advertising),
      carAndTruck: num(scheduleC.carAndTruck),
      commissions: num(scheduleC.commissions),
      insurance: num(scheduleC.insurance),
      legalAndProfessional: num(scheduleC.legalAndProfessional),
      office: num(scheduleC.office),
      supplies: num(scheduleC.supplies),
      taxesAndLicenses: num(scheduleC.taxesAndLicenses),
      travel: num(scheduleC.travel),
      deductibleMeals: num(scheduleC.deductibleMeals),
      utilities: num(scheduleC.utilities),
      otherExpenses: num(scheduleC.otherExpenses),
      otherDescription: text(scheduleC.otherDescription),
    },
    investments: {
      ordinaryDividends: num(investments.ordinaryDividends),
      qualifiedDividends: num(investments.qualifiedDividends),
      capitalGainDistributions: num(investments.capitalGainDistributions),
      shortTermGain: num(investments.shortTermGain),
      longTermGain: num(investments.longTermGain),
    },
    interest: list(body.interest, (row) => {
      const item = (row ?? {}) as Partial<Interest1099>;
      return {
        payer: text(item.payer),
        box1: num(item.box1),
        box3: num(item.box3),
        box4: num(item.box4),
      };
    }, 12),
    sales: list(body.sales, (row) => {
      const item = (row ?? {}) as Partial<Sale>;
      const term = item.term === "short" || item.term === "long" ? item.term : "";
      return {
        description: text(item.description, 60),
        dateAcquired: dateOf(item.dateAcquired),
        dateSold: dateOf(item.dateSold),
        proceeds: num(item.proceeds),
        cost: num(item.cost),
        basisReported: item.basisReported === undefined ? true : flag(item.basisReported),
        washSale: Math.max(0, num(item.washSale)),
        digitalAsset: flag(item.digitalAsset),
        term,
      };
    }, 80),
    charity: list(body.charity, (row) => {
      const item = (row ?? {}) as Partial<CharityGift>;
      return {
        name: text(item.name),
        date: dateOf(item.date),
        cash: item.cash === undefined ? true : flag(item.cash),
        amount: num(item.amount),
      };
    }, 24),
    mortgage: {
      lender: text(mortgage.lender),
      interest: num(mortgage.interest),
      points: num(mortgage.points),
      mortgageInsurance: num(mortgage.mortgageInsurance),
      propertyTax: num(mortgage.propertyTax),
    },
    payments: {
      federalEstimated: num(payments.federalEstimated),
      utahWithholdingExtra: num(payments.utahWithholdingExtra),
      utahPrepayments: num(payments.utahPrepayments),
      stateTaxRefund: num(payments.stateTaxRefund),
      itemizedLastYear: flag(payments.itemizedLastYear),
    },
    estimates: list(body.estimates, (row) => {
      const item = (row ?? {}) as Partial<EstimatePayment>;
      return {
        date: dateOf(item.date),
        federal: num(item.federal),
        utah: num(item.utah),
      };
    }, 8),
    lastYear: {
      agi: num(lastYear.agi),
      totalTax: num(lastYear.totalTax),
      shortTermLossCarryover: Math.max(0, num(lastYear.shortTermLossCarryover)),
      longTermLossCarryover: Math.max(0, num(lastYear.longTermLossCarryover)),
      stateRefund: num(lastYear.stateRefund),
      itemized: flag(lastYear.itemized),
      overpaymentApplied: num(lastYear.overpaymentApplied),
      filingStatus: STATUSES.has(lastYear.filingStatus as FilingStatus)
        ? (lastYear.filingStatus as FilingStatus)
        : "",
    },
    hsa: {
      coverage,
      contributions: num(hsa.contributions),
      employerContributions: num(hsa.employerContributions),
      distributions: num(hsa.distributions),
      qualifiedMedical: num(hsa.qualifiedMedical),
      distributionException: flag(hsa.distributionException),
      age55OrOlder: flag(hsa.age55OrOlder),
    },
    other: {
      traditionalIraDeduction: num(other.traditionalIraDeduction),
      rothIraContribution: num(other.rothIraContribution),
      studentLoanInterest: num(other.studentLoanInterest),
      foreignTax: num(other.foreignTax),
      miscIncome: num(other.miscIncome),
      childCareExpenses: num(other.childCareExpenses),
      my529Contribution: num(other.my529Contribution),
    },
  };
}

export function emptyW2(): W2 {
  return {
    employer: "",
    wages: 0,
    federalWithholding: 0,
    socialSecurityWages: 0,
    stateWages: 0,
    stateWithholding: 0,
    hsaEmployer: 0,
  };
}

export function profileFromReturn(taxReturn: TaxReturn): UsualProfile {
  return {
    filingStatus: taxReturn.personal.filingStatus,
    firstName: taxReturn.personal.firstName,
    lastName: taxReturn.personal.lastName,
    ssn: taxReturn.personal.ssn,
    spouseFirstName: taxReturn.personal.spouseFirstName,
    spouseLastName: taxReturn.personal.spouseLastName,
    spouseSsn: taxReturn.personal.spouseSsn,
    street: taxReturn.personal.street,
    city: taxReturn.personal.city,
    state: taxReturn.personal.state,
    zip: taxReturn.personal.zip,
    occupation: taxReturn.personal.occupation,
    spouseOccupation: taxReturn.personal.spouseOccupation,
    dependents: taxReturn.dependents.map((row) => ({ ...row })),
    charityNames: taxReturn.charity.map((row) => row.name).filter(Boolean),
    mortgageLender: taxReturn.mortgage.lender,
    bankNames: taxReturn.interest.map((row) => row.payer).filter(Boolean),
    brokerName: "Robinhood",
  };
}

export function normalizeProfile(input: unknown): UsualProfile {
  const body = (input ?? {}) as Partial<UsualProfile>;
  const blank = profileFromReturn(normalizeReturn({}));
  return {
    ...blank,
    filingStatus: statusOf(body.filingStatus),
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    ssn: text(body.ssn, 11),
    spouseFirstName: text(body.spouseFirstName),
    spouseLastName: text(body.spouseLastName),
    spouseSsn: text(body.spouseSsn, 11),
    street: text(body.street, 120),
    city: text(body.city),
    state: text(body.state, 2).toUpperCase(),
    zip: text(body.zip, 10),
    occupation: text(body.occupation),
    spouseOccupation: text(body.spouseOccupation),
    dependents: list(body.dependents, (row) => {
      const item = (row ?? {}) as Partial<Dependent>;
      return {
        name: text(item.name),
        relationship: text(item.relationship, 40),
        birthDate: dateOf(item.birthDate),
        monthsLived: Math.max(0, Math.min(12, Math.floor(num(item.monthsLived)))),
        ssn: text(item.ssn, 11),
      };
    }, 12),
    charityNames: list(body.charityNames, (row) => text(row), 24).filter(Boolean),
    mortgageLender: text(body.mortgageLender),
    bankNames: list(body.bankNames, (row) => text(row), 12).filter(Boolean),
    brokerName: text(body.brokerName) || "Robinhood",
  };
}

/** Copy saved names onto the open return. Amounts already entered stay put. */
export function applyProfile(taxReturn: TaxReturn, profile: UsualProfile): TaxReturn {
  const next: TaxReturn = {
    ...taxReturn,
    personal: {
      ...taxReturn.personal,
      filingStatus: profile.filingStatus,
      firstName: profile.firstName,
      lastName: profile.lastName,
      ssn: profile.ssn,
      spouseFirstName: profile.spouseFirstName,
      spouseLastName: profile.spouseLastName,
      spouseSsn: profile.spouseSsn,
      street: profile.street,
      city: profile.city,
      state: profile.state,
      zip: profile.zip,
      occupation: profile.occupation,
      spouseOccupation: profile.spouseOccupation,
    },
    dependents: profile.dependents.map((row) => ({ ...row })),
    mortgage: { ...taxReturn.mortgage, lender: profile.mortgageLender },
  };
  if (profile.charityNames.length > 0) {
    next.charity = profile.charityNames.map((name, index) => ({
      name,
      date: next.charity[index]?.date ?? "",
      cash: next.charity[index]?.cash ?? true,
      amount: next.charity[index]?.amount ?? 0,
    }));
  }
  if (profile.bankNames.length > 0) {
    next.interest = profile.bankNames.map((payer, index) => ({
      payer,
      box1: next.interest[index]?.box1 ?? 0,
      box3: next.interest[index]?.box3 ?? 0,
      box4: next.interest[index]?.box4 ?? 0,
    }));
  }
  return next;
}
