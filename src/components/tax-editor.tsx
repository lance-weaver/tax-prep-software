"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { applyProfile, profileFromReturn } from "@/lib/normalize-return";
import { applyExtracted, parseTaxDocument, type ExtractedField } from "@/lib/pdf/parse-forms";
import type {
  CharityGift,
  Dependent,
  EstimatePayment,
  Interest1099,
  ReturnSummary,
  Sale,
  TaxReturn,
  UsualProfile,
  W2,
} from "@/lib/return-types";
import { sampleReturn } from "@/lib/sample-return";

const SECTIONS = [
  ["personal", "Personal & dependents"],
  ["income", "Income"],
  ["deductions", "Deductions"],
  ["credits", "Credits"],
  ["payments", "Payments"],
  ["prior", "Last year"],
  ["review", "Review & print"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maskSsn(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;
  return `***-**-${digits.slice(-4)}`;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SsnField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label>
      {label}
      <input
        value={focused ? value : maskSsn(value)}
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

const emptyW2 = (): W2 => ({
  employer: "",
  wages: 0,
  federalWithholding: 0,
  socialSecurityWages: 0,
  stateWages: 0,
  stateWithholding: 0,
  hsaEmployer: 0,
});

const emptyDependent = (): Dependent => ({
  name: "",
  relationship: "child",
  birthDate: "",
  monthsLived: 12,
  ssn: "",
});

const emptySale = (): Sale => ({
  description: "",
  dateAcquired: "",
  dateSold: "",
  proceeds: 0,
  cost: 0,
  basisReported: true,
  washSale: 0,
  digitalAsset: false,
  term: "",
});

export function TaxEditor() {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>("personal");
  const [taxReturn, setTaxReturn] = useState<TaxReturn>(sampleReturn);
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [review, setReview] = useState<{ id: string; form: string; needsOcr: boolean; fields: ExtractedField[] } | null>(null);
  const [ocrNote, setOcrNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/return");
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { taxReturn: TaxReturn };
      if (!cancelled) setTaxReturn(body.taxReturn);
      const profile = await fetch("/api/profile");
      if (profile.ok) {
        const saved = (await profile.json()) as { saved: boolean };
        if (!cancelled) setProfileSaved(saved.saved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function patch(next: TaxReturn) {
    setTaxReturn(next);
  }

  async function save() {
    setPending(true);
    setError("");
    const response = await fetch("/api/return", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(taxReturn),
    });
    setPending(false);
    if (!response.ok) {
      setError("The return was not saved.");
      return;
    }
    setStatus("Saved.");
  }

  async function calculate() {
    setPending(true);
    setError("");
    setStatus("Calculating…");
    const response = await fetch("/api/compute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(taxReturn),
    });
    const body = (await response.json()) as { summary?: ReturnSummary; error?: string };
    setPending(false);
    if (!response.ok || !body.summary) {
      setStatus("");
      setError(body.error ?? "The return did not calculate.");
      return;
    }
    setSummary(body.summary);
    setSection("review");
    setStatus("Calculated and saved.");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function saveProfile() {
    const profile: UsualProfile = profileFromReturn(taxReturn);
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      setError("The usual items were not saved.");
      return;
    }
    setProfileSaved(true);
    setStatus("Usual names saved. Amounts stay on the return until you change them.");
  }

  async function loadProfile() {
    const response = await fetch("/api/profile");
    const body = (await response.json()) as { profile: UsualProfile | null };
    if (!body.profile) {
      setError("No usual items are saved yet.");
      return;
    }
    patch(applyProfile(taxReturn, body.profile));
    setStatus("Usual names loaded. Update this year's amounts, then save.");
  }

  async function onCsv(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const response = await fetch("/api/broker-csv", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: text,
    });
    const body = (await response.json()) as {
      error?: string;
      ordinaryDividends?: number;
      qualifiedDividends?: number;
      capitalGainDistributions?: number;
      shortTermGain?: number;
      longTermGain?: number;
      interest?: number;
      treasuryInterest?: number;
      interestWithholding?: number;
      foreignTax?: number;
      miscIncome?: number;
      sales?: Sale[];
    };
    if (!response.ok) {
      setError(body.error ?? "The CSV could not be read.");
      return;
    }
    const sales = body.sales ?? [];
    patch({
      ...taxReturn,
      personal: { ...taxReturn.personal, digitalAssets: sales.some((sale) => sale.digitalAsset) || taxReturn.personal.digitalAssets },
      investments: {
        ordinaryDividends: body.ordinaryDividends ?? taxReturn.investments.ordinaryDividends,
        qualifiedDividends: body.qualifiedDividends ?? taxReturn.investments.qualifiedDividends,
        capitalGainDistributions: body.capitalGainDistributions ?? taxReturn.investments.capitalGainDistributions,
        shortTermGain: sales.length > 0 ? 0 : body.shortTermGain ?? 0,
        longTermGain: sales.length > 0 ? 0 : body.longTermGain ?? 0,
      },
      sales: sales.length > 0 ? sales : taxReturn.sales,
      interest:
        (body.interest ?? 0) > 0 || (body.treasuryInterest ?? 0) > 0
          ? [
              ...taxReturn.interest,
              {
                payer: "Broker",
                box1: body.interest ?? 0,
                box3: body.treasuryInterest ?? 0,
                box4: body.interestWithholding ?? 0,
              },
            ]
          : taxReturn.interest,
      other: {
        ...taxReturn.other,
        foreignTax: body.foreignTax || taxReturn.other.foreignTax,
        miscIncome: body.miscIncome || taxReturn.other.miscIncome,
      },
    });
    setStatus(sales.length > 0 ? "Sales loaded onto Form 8949. Summary gain boxes were cleared." : "Broker totals loaded.");
  }

  async function onPdf(file: File | undefined) {
    if (!file) return;
    setError("");
    setOcrNote("");
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "content-type": file.type || "application/pdf" },
      body: await file.arrayBuffer(),
    });
    const body = (await response.json()) as {
      error?: string;
      id: string;
      form: string;
      needsOcr: boolean;
      fields: ExtractedField[];
    };
    if (!response.ok) {
      setError(body.error ?? "The file could not be read.");
      return;
    }
    setReview(body);
    if (body.needsOcr) {
      setOcrNote("No text layer. Read a page image in the browser, or delete this file. Nothing is saved until you confirm and then save the return.");
    }
  }

  async function onOcr(file: File | undefined) {
    if (!file) return;
    setOcrNote("Reading the image in this browser…");
    setError("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tesseract",
      });
      const result = await worker.recognize(file);
      await worker.terminate();
      const parsed = parseTaxDocument(result.data.text);
      setReview({ id: review?.id ?? "", form: parsed.form, needsOcr: false, fields: parsed.fields });
      setOcrNote("Check each value against the page. Confirm only if it matches. The image was not uploaded.");
    } catch (caught) {
      setOcrNote("");
      setError(caught instanceof Error ? caught.message : "The image could not be read.");
    }
  }

  async function deleteUpload() {
    if (!review?.id) {
      setReview(null);
      return;
    }
    await fetch(`/api/upload?id=${review.id}`, { method: "DELETE" });
    setReview(null);
    setOcrNote("");
  }

  function confirmExtract() {
    if (!review) return;
    patch(applyExtracted(taxReturn, review.fields));
    setStatus("Boxes applied to the form. They are not saved until you press Save.");
    setReview(null);
  }

  const person = taxReturn.personal;
  const fake = person.ssn.replace(/\D/g, "") === "999009999";
  const federalBalance = summary
    ? summary.federal.refund > 0
      ? `Federal refund ${money(summary.federal.refund)}`
      : `Federal owed ${money(summary.federal.amountOwed)}`
    : "Federal —";
  const utahBalance = summary
    ? summary.utah.refund > 0
      ? `Utah refund ${money(summary.utah.refund)}`
      : `Utah owed ${money(summary.utah.amountOwed)}`
    : "Utah —";

  return (
    <div className="app">
      <nav className="side">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="secondary" onClick={signOut}>Sign out</button>
      </nav>
      <main>
        <header className="top">
          <div>
            <h1>2025 return</h1>
            <p>Federal forms from OpenTaxSolver. Utah is a full-year TC-40 worksheet. Print and mail.</p>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={save} disabled={pending}>Save</button>
            <button type="button" onClick={calculate} disabled={pending}>Calculate</button>
          </div>
        </header>
        <div className="totals">
          <div><span>Running total</span><strong>{federalBalance}</strong></div>
          <div><span>Running total</span><strong>{utahBalance}</strong></div>
          {summary ? <div><span>Federal AGI</span><strong>{money(summary.federal.agi)}</strong></div> : null}
        </div>
        {fake ? (
          <div className="banner">These figures are the fake sample return. Replace them before you rely on a result.</div>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        {status ? <p>{status}</p> : null}

        {section === "personal" ? (
          <section>
            <h2>Personal & dependents</h2>
            <div className="actions" style={{ marginBottom: "0.8rem" }}>
              <button type="button" className="secondary" onClick={loadProfile}>
                Load my usual items
              </button>
              <button type="button" className="secondary" onClick={saveProfile}>Save these names as usual</button>
            </div>
            <div className="grid">
              <Field label="First name" value={person.firstName} onChange={(value) => patch({ ...taxReturn, personal: { ...person, firstName: value } })} />
              <Field label="Last name" value={person.lastName} onChange={(value) => patch({ ...taxReturn, personal: { ...person, lastName: value } })} />
              <SsnField label="SSN" value={person.ssn} onChange={(value) => patch({ ...taxReturn, personal: { ...person, ssn: value } })} />
              <label>
                Filing status
                <select
                  value={person.filingStatus}
                  onChange={(event) => patch({ ...taxReturn, personal: { ...person, filingStatus: event.target.value as TaxReturn["personal"]["filingStatus"] } })}
                >
                  <option value="single">Single</option>
                  <option value="mfj">Married filing jointly</option>
                  <option value="mfs">Married filing separately</option>
                  <option value="hoh">Head of household</option>
                  <option value="qw">Qualifying surviving spouse</option>
                </select>
              </label>
              <Field label="Spouse first name" value={person.spouseFirstName} onChange={(value) => patch({ ...taxReturn, personal: { ...person, spouseFirstName: value } })} />
              <Field label="Spouse last name" value={person.spouseLastName} onChange={(value) => patch({ ...taxReturn, personal: { ...person, spouseLastName: value } })} />
              <SsnField label="Spouse SSN" value={person.spouseSsn} onChange={(value) => patch({ ...taxReturn, personal: { ...person, spouseSsn: value } })} />
              <Field label="Street" value={person.street} onChange={(value) => patch({ ...taxReturn, personal: { ...person, street: value } })} />
              <Field label="City" value={person.city} onChange={(value) => patch({ ...taxReturn, personal: { ...person, city: value } })} />
              <Field label="State" value={person.state} onChange={(value) => patch({ ...taxReturn, personal: { ...person, state: value } })} />
              <Field label="ZIP" value={person.zip} onChange={(value) => patch({ ...taxReturn, personal: { ...person, zip: value } })} />
              <Field label="Occupation" value={person.occupation} onChange={(value) => patch({ ...taxReturn, personal: { ...person, occupation: value } })} />
              <Field label="Spouse occupation" value={person.spouseOccupation} onChange={(value) => patch({ ...taxReturn, personal: { ...person, spouseOccupation: value } })} />
            </div>
            <Check label="You are 65 or older" checked={person.you65OrOlder} onChange={(value) => patch({ ...taxReturn, personal: { ...person, you65OrOlder: value } })} />
            <Check label="Digital assets" checked={person.digitalAssets} onChange={(value) => patch({ ...taxReturn, personal: { ...person, digitalAssets: value } })} />
            <h2>Dependents</h2>
            <p>A child under 17 on December 31 with a full SSN is the $2,200 credit. A newborn counts even with fewer than 7 months. Relationship is recorded and not tested.</p>
            {taxReturn.dependents.map((row, index) => (
              <div className="grid w2" key={index}>
                <Field label="Name" value={row.name} onChange={(value) => updateDependent(index, { name: value })} />
                <Field label="Relationship" value={row.relationship} onChange={(value) => updateDependent(index, { relationship: value })} />
                <Field label="Birth date" type="date" value={row.birthDate} onChange={(value) => updateDependent(index, { birthDate: value })} />
                <Field label="Months lived with you" type="number" value={row.monthsLived} onChange={(value) => updateDependent(index, { monthsLived: num(value) })} />
                <SsnField label="SSN" value={row.ssn} onChange={(value) => updateDependent(index, { ssn: value })} />
                <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, dependents: taxReturn.dependents.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, dependents: [...taxReturn.dependents, emptyDependent()] })}>Add a dependent</button>
          </section>
        ) : null}

        {section === "income" ? (
          <>
            <section>
              <h2>W-2 wages</h2>
              {taxReturn.w2s.map((w2, index) => (
                <div className="grid w2" key={index}>
                  <Field label="Employer" value={w2.employer} onChange={(value) => updateW2(index, { employer: value })} />
                  <Field label="Box 1 wages" type="number" value={w2.wages} onChange={(value) => updateW2(index, { wages: num(value) })} />
                  <Field label="Box 2 federal withholding" type="number" value={w2.federalWithholding} onChange={(value) => updateW2(index, { federalWithholding: num(value) })} />
                  <Field label="Box 3 Social Security wages" type="number" value={w2.socialSecurityWages} onChange={(value) => updateW2(index, { socialSecurityWages: num(value) })} />
                  <Field label="Box 16 state wages" type="number" value={w2.stateWages} onChange={(value) => updateW2(index, { stateWages: num(value) })} />
                  <Field label="Box 17 Utah withholding" type="number" value={w2.stateWithholding} onChange={(value) => updateW2(index, { stateWithholding: num(value) })} />
                  <Field label="Box 12 code W (HSA)" type="number" value={w2.hsaEmployer} onChange={(value) => updateW2(index, { hsaEmployer: num(value) })} />
                </div>
              ))}
              <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, w2s: [...taxReturn.w2s, emptyW2()] })}>Add a W-2</button>
            </section>
            <section>
              <h2>Bank 1099-INT</h2>
              <p>Box 1 and box 3 are both taxable on the federal return. Box 3 is subtracted on the Utah return.</p>
              {taxReturn.interest.map((row, index) => (
                <div className="grid w2" key={index}>
                  <Field label="Payer" value={row.payer} onChange={(value) => updateInterest(index, { payer: value })} />
                  <Field label="Box 1 interest" type="number" value={row.box1} onChange={(value) => updateInterest(index, { box1: num(value) })} />
                  <Field label="Box 3 Treasury" type="number" value={row.box3} onChange={(value) => updateInterest(index, { box3: num(value) })} />
                  <Field label="Box 4 withholding" type="number" value={row.box4} onChange={(value) => updateInterest(index, { box4: num(value) })} />
                  <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, interest: taxReturn.interest.filter((_, i) => i !== index) })}>Remove</button>
                </div>
              ))}
              <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, interest: [...taxReturn.interest, { payer: "", box1: 0, box3: 0, box4: 0 }] })}>Add a 1099-INT</button>
            </section>
            <section>
              <h2>Robinhood and other 1099s</h2>
              <div className="grid">
                <Field label="Ordinary dividends (1a)" type="number" value={taxReturn.investments.ordinaryDividends} onChange={(value) => setInvest({ ordinaryDividends: num(value) })} />
                <Field label="Qualified dividends (1b)" type="number" value={taxReturn.investments.qualifiedDividends} onChange={(value) => setInvest({ qualifiedDividends: num(value) })} />
                <Field label="Capital gain distributions (2a)" type="number" value={taxReturn.investments.capitalGainDistributions} onChange={(value) => setInvest({ capitalGainDistributions: num(value) })} />
                <Field label="Foreign tax (box 7)" type="number" value={taxReturn.other.foreignTax} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, foreignTax: num(value) } })} />
                <Field label="1099-MISC other income" type="number" value={taxReturn.other.miscIncome} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, miscIncome: num(value) } })} />
                <Field label="Net short-term gain, if you are not listing sales" type="number" value={taxReturn.investments.shortTermGain} onChange={(value) => setInvest({ shortTermGain: num(value) })} />
                <Field label="Net long-term gain, if you are not listing sales" type="number" value={taxReturn.investments.longTermGain} onChange={(value) => setInvest({ longTermGain: num(value) })} />
              </div>
              <p>Individual sales replace the two net-gain boxes. A wash-sale amount is the disallowed loss.</p>
              {taxReturn.sales.map((sale, index) => (
                <div className="grid w2" key={index}>
                  <Field label="Description" value={sale.description} onChange={(value) => updateSale(index, { description: value })} />
                  <Field label="Acquired" type="date" value={sale.dateAcquired} onChange={(value) => updateSale(index, { dateAcquired: value })} />
                  <Field label="Sold" type="date" value={sale.dateSold} onChange={(value) => updateSale(index, { dateSold: value })} />
                  <Field label="Proceeds" type="number" value={sale.proceeds} onChange={(value) => updateSale(index, { proceeds: num(value) })} />
                  <Field label="Cost" type="number" value={sale.cost} onChange={(value) => updateSale(index, { cost: num(value) })} />
                  <Field label="Wash-sale loss disallowed" type="number" value={sale.washSale} onChange={(value) => updateSale(index, { washSale: num(value) })} />
                  <Check label="Basis reported to the IRS" checked={sale.basisReported} onChange={(value) => updateSale(index, { basisReported: value })} />
                  <Check label="Digital asset" checked={sale.digitalAsset} onChange={(value) => updateSale(index, { digitalAsset: value })} />
                  <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, sales: taxReturn.sales.filter((_, i) => i !== index) })}>Remove</button>
                </div>
              ))}
              <div className="actions">
                <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, sales: [...taxReturn.sales, emptySale()] })}>Add a sale</button>
                <label className="row">
                  Broker CSV
                  <input type="file" accept=".csv,text/csv" onChange={(event) => onCsv(event.target.files?.[0])} />
                </label>
              </div>
            </section>
            <section>
              <h2>Tours / Schedule C</h2>
              <ScheduleCForm taxReturn={taxReturn} patch={patch} />
            </section>
          </>
        ) : null}

        {section === "deductions" ? (
          <>
            <section>
              <h2>Charitable gifts</h2>
              <p>Cash and non-cash are Schedule A. Non-cash over $500 needs Form 8283, which this app does not fill in.</p>
              {taxReturn.charity.map((gift, index) => (
                <div className="grid w2" key={index}>
                  <Field label="Organization" value={gift.name} onChange={(value) => updateGift(index, { name: value })} />
                  <Field label="Date" type="date" value={gift.date} onChange={(value) => updateGift(index, { date: value })} />
                  <Field label="Amount" type="number" value={gift.amount} onChange={(value) => updateGift(index, { amount: num(value) })} />
                  <Check label="Cash or check" checked={gift.cash} onChange={(value) => updateGift(index, { cash: value })} />
                  <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, charity: taxReturn.charity.filter((_, i) => i !== index) })}>Remove</button>
                </div>
              ))}
              <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, charity: [...taxReturn.charity, { name: "", date: "", cash: true, amount: 0 }] })}>Add a gift</button>
            </section>
            <section>
              <h2>Mortgage 1098</h2>
              <div className="grid">
                <Field label="Lender" value={taxReturn.mortgage.lender} onChange={(value) => patch({ ...taxReturn, mortgage: { ...taxReturn.mortgage, lender: value } })} />
                <Field label="Box 1 interest" type="number" value={taxReturn.mortgage.interest} onChange={(value) => patch({ ...taxReturn, mortgage: { ...taxReturn.mortgage, interest: num(value) } })} />
                <Field label="Box 6 points" type="number" value={taxReturn.mortgage.points} onChange={(value) => patch({ ...taxReturn, mortgage: { ...taxReturn.mortgage, points: num(value) } })} />
                <Field label="Property tax from escrow" type="number" value={taxReturn.mortgage.propertyTax} onChange={(value) => patch({ ...taxReturn, mortgage: { ...taxReturn.mortgage, propertyTax: num(value) } })} />
                <Field label="Mortgage insurance (not deducted)" type="number" value={taxReturn.mortgage.mortgageInsurance} onChange={(value) => patch({ ...taxReturn, mortgage: { ...taxReturn.mortgage, mortgageInsurance: num(value) } })} />
              </div>
              <p>Utah withholding plus property tax is the SALT amount. OpenTaxSolver applies the 2025 cap and picks the larger of standard and itemized.</p>
            </section>
            <section>
              <h2>HSA, IRA, student loan</h2>
              <div className="grid">
                <label>
                  HSA coverage
                  <select
                    value={taxReturn.hsa.coverage}
                    onChange={(event) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, coverage: event.target.value as TaxReturn["hsa"]["coverage"] } })}
                  >
                    <option value="none">None</option>
                    <option value="self">Self-only</option>
                    <option value="family">Family</option>
                  </select>
                </label>
                <Field label="HSA contributions you made" type="number" value={taxReturn.hsa.contributions} onChange={(value) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, contributions: num(value) } })} />
                <Field label="Employer HSA (or use W-2 box 12)" type="number" value={taxReturn.hsa.employerContributions} onChange={(value) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, employerContributions: num(value) } })} />
                <Field label="HSA distributions" type="number" value={taxReturn.hsa.distributions} onChange={(value) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, distributions: num(value) } })} />
                <Field label="Qualified medical expenses" type="number" value={taxReturn.hsa.qualifiedMedical} onChange={(value) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, qualifiedMedical: num(value) } })} />
                <Field label="Deductible traditional IRA" type="number" value={taxReturn.other.traditionalIraDeduction} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, traditionalIraDeduction: num(value) } })} />
                <Field label="Roth IRA contribution (not deducted)" type="number" value={taxReturn.other.rothIraContribution} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, rothIraContribution: num(value) } })} />
                <Field label="Student loan interest paid" type="number" value={taxReturn.other.studentLoanInterest} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, studentLoanInterest: num(value) } })} />
              </div>
              <Check label="Age 55 or older (HSA catch-up)" checked={taxReturn.hsa.age55OrOlder} onChange={(value) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, age55OrOlder: value } })} />
              <Check label="HSA distribution has an exception to the additional tax" checked={taxReturn.hsa.distributionException} onChange={(value) => patch({ ...taxReturn, hsa: { ...taxReturn.hsa, distributionException: value } })} />
              <p>The IRA phase-out worksheet is not computed. Enter the deductible traditional amount only.</p>
            </section>
          </>
        ) : null}

        {section === "credits" ? (
          <section>
            <h2>Credits</h2>
            <p>The child tax credit and the credit for other dependents are calculated from the dependent list when you press Calculate.</p>
            <div className="grid">
              <Field label="Child and dependent care expenses (not yet supported)" type="number" value={taxReturn.other.childCareExpenses} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, childCareExpenses: num(value) } })} />
              <Field label="Utah my529 contribution (not yet supported)" type="number" value={taxReturn.other.my529Contribution} onChange={(value) => patch({ ...taxReturn, other: { ...taxReturn.other, my529Contribution: num(value) } })} />
            </div>
            <p>Form 2441 and the Utah my529 credit are not prepared. Amounts you type here are kept so the review can say so.</p>
          </section>
        ) : null}

        {section === "payments" ? (
          <section>
            <h2>Estimated payments</h2>
            <p>Dates are stored. Form 2210 is not prepared. If you add rows here, they replace the single estimate totals.</p>
            {taxReturn.estimates.map((row, index) => (
              <div className="grid w2" key={index}>
                <Field label="Date" type="date" value={row.date} onChange={(value) => updateEstimate(index, { date: value })} />
                <Field label="Federal" type="number" value={row.federal} onChange={(value) => updateEstimate(index, { federal: num(value) })} />
                <Field label="Utah" type="number" value={row.utah} onChange={(value) => updateEstimate(index, { utah: num(value) })} />
                <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, estimates: taxReturn.estimates.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => patch({ ...taxReturn, estimates: [...taxReturn.estimates, { date: "", federal: 0, utah: 0 }] })}>Add a payment</button>
            <div className="grid" style={{ marginTop: "0.8rem" }}>
              <Field label="Federal estimates, if you are not listing dates" type="number" value={taxReturn.payments.federalEstimated} onChange={(value) => patch({ ...taxReturn, payments: { ...taxReturn.payments, federalEstimated: num(value) } })} />
              <Field label="Utah estimates, if you are not listing dates" type="number" value={taxReturn.payments.utahPrepayments} onChange={(value) => patch({ ...taxReturn, payments: { ...taxReturn.payments, utahPrepayments: num(value) } })} />
              <Field label="Extra Utah withholding" type="number" value={taxReturn.payments.utahWithholdingExtra} onChange={(value) => patch({ ...taxReturn, payments: { ...taxReturn.payments, utahWithholdingExtra: num(value) } })} />
            </div>
          </section>
        ) : null}

        {section === "prior" ? (
          <section>
            <h2>Last year's return</h2>
            <div className="grid">
              <Field label="Prior AGI" type="number" value={taxReturn.lastYear.agi} onChange={(value) => setPrior({ agi: num(value) })} />
              <Field label="Prior total tax" type="number" value={taxReturn.lastYear.totalTax} onChange={(value) => setPrior({ totalTax: num(value) })} />
              <Field label="Short-term loss carryover" type="number" value={taxReturn.lastYear.shortTermLossCarryover} onChange={(value) => setPrior({ shortTermLossCarryover: num(value) })} />
              <Field label="Long-term loss carryover" type="number" value={taxReturn.lastYear.longTermLossCarryover} onChange={(value) => setPrior({ longTermLossCarryover: num(value) })} />
              <Field label="State refund (1099-G)" type="number" value={taxReturn.lastYear.stateRefund} onChange={(value) => setPrior({ stateRefund: num(value) })} />
              <Field label="Overpayment applied to this year" type="number" value={taxReturn.lastYear.overpaymentApplied} onChange={(value) => setPrior({ overpaymentApplied: num(value) })} />
            </div>
            <Check label="Last year was itemized, so the state refund is taxable" checked={taxReturn.lastYear.itemized} onChange={(value) => setPrior({ itemized: value })} />
            {summary?.comparison ? (
              <p>
                This year AGI {money(summary.comparison.agi)} versus last year {money(summary.comparison.priorAgi)}.
                This year total tax {money(summary.comparison.totalTax)} versus last year {money(summary.comparison.priorTax)}.
              </p>
            ) : null}
            {summary?.safeHarbor ? <p>{summary.safeHarbor.note}</p> : null}
          </section>
        ) : null}

        {section === "review" ? (
          <section>
            <h2>Review & print</h2>
            <div className="actions">
              <label className="row">
                PDF with a text layer
                <input type="file" accept="application/pdf,.pdf,image/png,image/jpeg" onChange={(event) => onPdf(event.target.files?.[0])} />
              </label>
              <label className="row">
                Page image for browser OCR
                <input type="file" accept="image/png,image/jpeg" onChange={(event) => onOcr(event.target.files?.[0])} />
              </label>
            </div>
            {ocrNote ? <p>{ocrNote}</p> : null}
            {review ? (
              <>
                <p>Confirm these boxes before they touch the form. The file stays on this server until you delete it, and it is not sent anywhere else.</p>
                <table className="review-table">
                  <thead><tr><th>Source</th><th>Value</th></tr></thead>
                  <tbody>
                    {review.fields.length === 0 ? (
                      <tr><td colSpan={2}>No boxes were found.</td></tr>
                    ) : review.fields.map((field) => (
                      <tr key={field.id}><td>{field.source}<br />{field.label}</td><td>{field.value}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="actions">
                  <button type="button" onClick={confirmExtract} disabled={review.fields.length === 0}>Use these values</button>
                  <button type="button" className="secondary" onClick={deleteUpload}>Delete the file</button>
                </div>
              </>
            ) : null}
            {summary ? <SummaryView summary={summary} /> : <p>Calculate to fill the forms.</p>}
          </section>
        ) : null}
      </main>
    </div>
  );

  function updateDependent(index: number, partial: Partial<Dependent>) {
    const dependents = taxReturn.dependents.map((row, i) => (i === index ? { ...row, ...partial } : row));
    patch({ ...taxReturn, dependents });
  }
  function updateW2(index: number, partial: Partial<W2>) {
    const w2s = taxReturn.w2s.map((row, i) => (i === index ? { ...row, ...partial } : row));
    patch({ ...taxReturn, w2s });
  }
  function updateInterest(index: number, partial: Partial<Interest1099>) {
    const interest = taxReturn.interest.map((row, i) => (i === index ? { ...row, ...partial } : row));
    patch({ ...taxReturn, interest });
  }
  function updateSale(index: number, partial: Partial<Sale>) {
    const sales = taxReturn.sales.map((row, i) => (i === index ? { ...row, ...partial } : row));
    patch({ ...taxReturn, sales });
  }
  function updateGift(index: number, partial: Partial<CharityGift>) {
    const charity = taxReturn.charity.map((row, i) => (i === index ? { ...row, ...partial } : row));
    patch({ ...taxReturn, charity });
  }
  function updateEstimate(index: number, partial: Partial<EstimatePayment>) {
    const estimates = taxReturn.estimates.map((row, i) => (i === index ? { ...row, ...partial } : row));
    patch({ ...taxReturn, estimates });
  }
  function setInvest(partial: Partial<TaxReturn["investments"]>) {
    patch({ ...taxReturn, investments: { ...taxReturn.investments, ...partial } });
  }
  function setPrior(partial: Partial<TaxReturn["lastYear"]>) {
    patch({ ...taxReturn, lastYear: { ...taxReturn.lastYear, ...partial } });
  }
}

function ScheduleCForm({ taxReturn, patch }: { taxReturn: TaxReturn; patch: (next: TaxReturn) => void }) {
  const c = taxReturn.scheduleC;
  function set(partial: Partial<TaxReturn["scheduleC"]>) {
    patch({ ...taxReturn, scheduleC: { ...c, ...partial } });
  }
  return (
    <div className="grid">
      <Field label="Business name" value={c.businessName} onChange={(value) => set({ businessName: value })} />
      <Field label="Principal business" value={c.principalBusiness} onChange={(value) => set({ principalBusiness: value })} />
      <Field label="EIN" value={c.ein} onChange={(value) => set({ ein: value })} />
      <Field label="Gross receipts" type="number" value={c.grossReceipts} onChange={(value) => set({ grossReceipts: num(value) })} />
      <Field label="Advertising" type="number" value={c.advertising} onChange={(value) => set({ advertising: num(value) })} />
      <Field label="Insurance" type="number" value={c.insurance} onChange={(value) => set({ insurance: num(value) })} />
      <Field label="Office" type="number" value={c.office} onChange={(value) => set({ office: num(value) })} />
      <Field label="Supplies" type="number" value={c.supplies} onChange={(value) => set({ supplies: num(value) })} />
      <Field label="Travel" type="number" value={c.travel} onChange={(value) => set({ travel: num(value) })} />
      <Field label="Deductible meals" type="number" value={c.deductibleMeals} onChange={(value) => set({ deductibleMeals: num(value) })} />
      <Field label="Utilities" type="number" value={c.utilities} onChange={(value) => set({ utilities: num(value) })} />
      <Field label="Other expenses" type="number" value={c.otherExpenses} onChange={(value) => set({ otherExpenses: num(value) })} />
      <Field label="Other description" value={c.otherDescription} onChange={(value) => set({ otherDescription: value })} />
    </div>
  );
}

function SummaryView({ summary }: { summary: ReturnSummary }) {
  const federal = summary.federal;
  const utah = summary.utah;
  return (
    <>
      <div className="summary">
        <div>
          <h2>Federal</h2>
          <table>
            <tbody>
              <tr><td>AGI</td><td className="num">{money(federal.agi)}</td></tr>
              <tr><td>{federal.deductionChoice === "itemized" ? "Itemized deduction" : "Standard deduction"}</td><td className="num">{money(federal.standardOrItemized)}</td></tr>
              <tr><td>Schedule A total</td><td className="num">{money(federal.itemizedAmount)}</td></tr>
              <tr><td>QBI deduction</td><td className="num">{money(federal.qbiDeduction)}</td></tr>
              <tr><td>Taxable income</td><td className="num">{money(federal.taxableIncome)}</td></tr>
              <tr><td>Income tax</td><td className="num">{money(federal.incomeTax)}</td></tr>
              <tr><td>Self-employment tax</td><td className="num">{money(federal.seTax)}</td></tr>
              <tr><td>Child tax credit</td><td className="num">{money(federal.childTaxCredit)}</td></tr>
              <tr><td>Additional child tax credit</td><td className="num">{money(federal.additionalChildTaxCredit)}</td></tr>
              <tr><td>Total tax</td><td className="num">{money(federal.totalTax)}</td></tr>
              <tr><td>Payments</td><td className="num">{money(federal.payments)}</td></tr>
              <tr><td className={federal.refund > 0 ? "refund" : "owed"}>{federal.refund > 0 ? "Refund" : "Amount owed"}</td><td className="num">{money(federal.refund > 0 ? federal.refund : federal.amountOwed)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Utah</h2>
          <table>
            <tbody>
              {utah.lines.map((line) => (
                <tr key={line.line}><td>Line {line.line} {line.label}</td><td className="num">{money(line.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {summary.safeHarbor ? <p>{summary.safeHarbor.note}</p> : null}
      <ul className="notes">
        {summary.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      <div className="files">
        {summary.files.map((name) => (
          <a key={name} href={`/api/download?file=${encodeURIComponent(name)}`}>{name}</a>
        ))}
      </div>
    </>
  );
}
