import { TAX_YEAR, type FilingStatus, type TaxReturn } from "./return-types";

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

export function normalizeReturn(input: unknown): TaxReturn {
  const body = (input ?? {}) as {
    personal?: Partial<TaxReturn["personal"]>;
    scheduleC?: Partial<TaxReturn["scheduleC"]>;
    investments?: Partial<TaxReturn["investments"]>;
    payments?: Partial<TaxReturn["payments"]>;
    w2s?: Partial<TaxReturn["w2s"][number]>[];
  };
  const personal: Partial<TaxReturn["personal"]> = body.personal ?? {};
  const scheduleC: Partial<TaxReturn["scheduleC"]> = body.scheduleC ?? {};
  const investments: Partial<TaxReturn["investments"]> = body.investments ?? {};
  const payments: Partial<TaxReturn["payments"]> = body.payments ?? {};
  const status = STATUSES.has(personal.filingStatus as FilingStatus)
    ? (personal.filingStatus as FilingStatus)
    : "single";
  const method = scheduleC.accountingMethod;
  const w2s = Array.isArray(body.w2s) ? body.w2s.slice(0, 8) : [];

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
    w2s:
      w2s.length > 0
        ? w2s.map((w2) => ({
            employer: text(w2.employer),
            wages: num(w2.wages),
            federalWithholding: num(w2.federalWithholding),
            socialSecurityWages: num(w2.socialSecurityWages),
            stateWages: num(w2.stateWages),
            stateWithholding: num(w2.stateWithholding),
          }))
        : [
            {
              employer: "",
              wages: 0,
              federalWithholding: 0,
              socialSecurityWages: 0,
              stateWages: 0,
              stateWithholding: 0,
            },
          ],
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
    payments: {
      federalEstimated: num(payments.federalEstimated),
      utahWithholdingExtra: num(payments.utahWithholdingExtra),
      utahPrepayments: num(payments.utahPrepayments),
      stateTaxRefund: num(payments.stateTaxRefund),
      itemizedLastYear: flag(payments.itemizedLastYear),
    },
  };
}
