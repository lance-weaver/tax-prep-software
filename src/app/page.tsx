"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReturnSummary, TaxReturn, W2 } from "@/lib/return-types";
import { sampleReturn } from "@/lib/sample-return";

const emptyW2 = (): W2 => ({
  employer: "",
  wages: 0,
  federalWithholding: 0,
  socialSecurityWages: 0,
  stateWages: 0,
  stateWithholding: 0,
});

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function HomePage() {
  const router = useRouter();
  const [taxReturn, setTaxReturn] = useState<TaxReturn>(sampleReturn);
  const [saved, setSaved] = useState(false);
  const [usingSample, setUsingSample] = useState(true);
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/return");
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { saved: boolean; taxReturn: TaxReturn };
      if (cancelled) return;
      setTaxReturn(body.taxReturn);
      setSaved(body.saved);
      setUsingSample(!body.saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function patch(next: TaxReturn) {
    setTaxReturn(next);
    setUsingSample(false);
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
    setSaved(true);
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
    setSaved(true);
    setStatus("Calculated and saved.");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function onCsv(file: File | undefined) {
    if (!file) return;
    setError("");
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
    };
    if (!response.ok) {
      setError(body.error ?? "The CSV was not recognized.");
      return;
    }
    patch({
      ...taxReturn,
      investments: {
        ordinaryDividends: body.ordinaryDividends ?? 0,
        qualifiedDividends: body.qualifiedDividends ?? 0,
        capitalGainDistributions: body.capitalGainDistributions ?? 0,
        shortTermGain: body.shortTermGain ?? 0,
        longTermGain: body.longTermGain ?? 0,
      },
    });
    setStatus("Investment totals replaced from the CSV.");
  }

  const person = taxReturn.personal;
  const scheduleC = taxReturn.scheduleC;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1>2025 federal and Utah return</h1>
          <p>One worksheet. Paper filing. OpenTaxSolver does the federal math.</p>
        </div>
        <button className="secondary" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      {usingSample || person.ssn.replace(/\D/g, "") === "999009999" ? (
        <p className="banner">
          These figures are the fake sample return (Alex Sample, SSN 999-00-9999).
          {saved
            ? " Replace them before you rely on a saved file."
            : " Nothing is saved until you click Save."}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {status ? <p className="banner">{status}</p> : null}

      <section>
        <h2>Filing status and identity</h2>
        <div className="grid">
          <label>
            Filing status
            <select
              value={person.filingStatus}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: {
                    ...person,
                    filingStatus: event.target.value as TaxReturn["personal"]["filingStatus"],
                  },
                })
              }
            >
              <option value="single">Single</option>
              <option value="mfj">Married filing jointly</option>
              <option value="mfs">Married filing separately</option>
              <option value="hoh">Head of household</option>
              <option value="qw">Qualifying surviving spouse</option>
            </select>
          </label>
          <label>
            First name
            <input
              value={person.firstName}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, firstName: event.target.value } })
              }
            />
          </label>
          <label>
            Last name
            <input
              value={person.lastName}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, lastName: event.target.value } })
              }
            />
          </label>
          <label>
            SSN
            <input
              value={person.ssn}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, ssn: event.target.value } })
              }
            />
          </label>
          <label>
            Spouse first name
            <input
              value={person.spouseFirstName}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, spouseFirstName: event.target.value },
                })
              }
            />
          </label>
          <label>
            Spouse last name
            <input
              value={person.spouseLastName}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, spouseLastName: event.target.value },
                })
              }
            />
          </label>
          <label>
            Spouse SSN
            <input
              value={person.spouseSsn}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, spouseSsn: event.target.value } })
              }
            />
          </label>
          <label>
            Occupation
            <input
              value={person.occupation}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, occupation: event.target.value } })
              }
            />
          </label>
          <label>
            Street
            <input
              value={person.street}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, street: event.target.value } })
              }
            />
          </label>
          <label>
            City
            <input
              value={person.city}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, city: event.target.value } })
              }
            />
          </label>
          <label>
            State
            <input
              value={person.state}
              maxLength={2}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, state: event.target.value } })
              }
            />
          </label>
          <label>
            ZIP
            <input
              value={person.zip}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, zip: event.target.value } })
              }
            />
          </label>
          <label>
            Dependents age 16 or under
            <input
              type="number"
              min={0}
              value={person.dependentsAge16OrUnder}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, dependentsAge16OrUnder: num(event.target.value) },
                })
              }
            />
          </label>
          <label>
            Other dependents
            <input
              type="number"
              min={0}
              value={person.otherDependents}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, otherDependents: num(event.target.value) },
                })
              }
            />
          </label>
          <label>
            Of those, born this year
            <input
              type="number"
              min={0}
              value={person.dependentsBornThisYear}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, dependentsBornThisYear: num(event.target.value) },
                })
              }
            />
          </label>
        </div>
        <div className="grid" style={{ marginTop: "0.7rem" }}>
          <label className="row">
            <input
              type="checkbox"
              checked={person.you65OrOlder}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, you65OrOlder: event.target.checked },
                })
              }
            />
            You were 65 or older
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={person.youBlind}
              onChange={(event) =>
                patch({ ...taxReturn, personal: { ...person, youBlind: event.target.checked } })
              }
            />
            You are blind
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={person.spouse65OrOlder}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, spouse65OrOlder: event.target.checked },
                })
              }
            />
            Spouse was 65 or older
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={person.digitalAssets}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  personal: { ...person, digitalAssets: event.target.checked },
                })
              }
            />
            Digital asset question is yes
          </label>
        </div>
      </section>

      <section>
        <h2>W-2 wages</h2>
        {taxReturn.w2s.map((w2, index) => (
          <div className="w2" key={index}>
            <div className="grid">
              <label>
                Employer
                <input
                  value={w2.employer}
                  onChange={(event) => {
                    const w2s = taxReturn.w2s.slice();
                    w2s[index] = { ...w2, employer: event.target.value };
                    patch({ ...taxReturn, w2s });
                  }}
                />
              </label>
              {(
                [
                  ["wages", "Box 1 wages"],
                  ["federalWithholding", "Box 2 federal withholding"],
                  ["socialSecurityWages", "Box 3 Social Security wages"],
                  ["stateWages", "Box 16 state wages"],
                  ["stateWithholding", "Box 17 Utah withholding"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    step="0.01"
                    value={w2[key]}
                    onChange={(event) => {
                      const w2s = taxReturn.w2s.slice();
                      w2s[index] = { ...w2, [key]: num(event.target.value) };
                      patch({ ...taxReturn, w2s });
                    }}
                  />
                </label>
              ))}
            </div>
            {taxReturn.w2s.length > 1 ? (
              <p>
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    patch({
                      ...taxReturn,
                      w2s: taxReturn.w2s.filter((_, item) => item !== index),
                    })
                  }
                >
                  Remove this W-2
                </button>
              </p>
            ) : null}
          </div>
        ))}
        <p>
          <button
            className="secondary"
            type="button"
            onClick={() => patch({ ...taxReturn, w2s: [...taxReturn.w2s, emptyW2()] })}
          >
            Add a W-2
          </button>
        </p>
      </section>

      <section>
        <h2>Schedule C</h2>
        <div className="grid">
          <label>
            Business name
            <input
              value={scheduleC.businessName}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  scheduleC: { ...scheduleC, businessName: event.target.value },
                })
              }
            />
          </label>
          <label>
            Principal business
            <input
              value={scheduleC.principalBusiness}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  scheduleC: { ...scheduleC, principalBusiness: event.target.value },
                })
              }
            />
          </label>
          <label>
            EIN
            <input
              value={scheduleC.ein}
              onChange={(event) =>
                patch({ ...taxReturn, scheduleC: { ...scheduleC, ein: event.target.value } })
              }
            />
          </label>
          <label>
            Activity code
            <input
              value={scheduleC.activityCode}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  scheduleC: { ...scheduleC, activityCode: event.target.value },
                })
              }
            />
          </label>
          {(
            [
              ["grossReceipts", "Gross receipts"],
              ["returnsAndAllowances", "Returns and allowances"],
              ["advertising", "Advertising"],
              ["carAndTruck", "Car and truck"],
              ["commissions", "Commissions"],
              ["insurance", "Insurance"],
              ["legalAndProfessional", "Legal and professional"],
              ["office", "Office"],
              ["supplies", "Supplies"],
              ["taxesAndLicenses", "Taxes and licenses"],
              ["travel", "Travel"],
              ["deductibleMeals", "Deductible meals (already 50%)"],
              ["utilities", "Utilities"],
              ["otherExpenses", "Other expenses"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step="0.01"
                value={scheduleC[key]}
                onChange={(event) =>
                  patch({
                    ...taxReturn,
                    scheduleC: { ...scheduleC, [key]: num(event.target.value) },
                  })
                }
              />
            </label>
          ))}
          <label>
            Other expense description
            <input
              value={scheduleC.otherDescription}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  scheduleC: { ...scheduleC, otherDescription: event.target.value },
                })
              }
            />
          </label>
        </div>
      </section>

      <section>
        <h2>Dividends and capital gains</h2>
        <p>
          Enter 1099-DIV and 1099-B totals. Ordinary dividends already include qualified
          dividends. Gains can be negative.
        </p>
        <div className="grid">
          {(
            [
              ["ordinaryDividends", "Ordinary dividends (1099-DIV box 1a)"],
              ["qualifiedDividends", "Qualified dividends (box 1b)"],
              ["capitalGainDistributions", "Capital gain distributions (box 2a)"],
              ["shortTermGain", "Net short-term gain or loss"],
              ["longTermGain", "Net long-term gain or loss"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step="0.01"
                value={taxReturn.investments[key]}
                onChange={(event) =>
                  patch({
                    ...taxReturn,
                    investments: { ...taxReturn.investments, [key]: num(event.target.value) },
                  })
                }
              />
            </label>
          ))}
          <label>
            Broker CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => onCsv(event.target.files?.[0])}
            />
          </label>
        </div>
      </section>

      <section>
        <h2>Payments</h2>
        <div className="grid">
          <label>
            Federal estimated payments
            <input
              type="number"
              step="0.01"
              value={taxReturn.payments.federalEstimated}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  payments: { ...taxReturn.payments, federalEstimated: num(event.target.value) },
                })
              }
            />
          </label>
          <label>
            Extra Utah withholding
            <input
              type="number"
              step="0.01"
              value={taxReturn.payments.utahWithholdingExtra}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  payments: {
                    ...taxReturn.payments,
                    utahWithholdingExtra: num(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            Utah prepayments
            <input
              type="number"
              step="0.01"
              value={taxReturn.payments.utahPrepayments}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  payments: { ...taxReturn.payments, utahPrepayments: num(event.target.value) },
                })
              }
            />
          </label>
          <label>
            Taxable state refund (Schedule 1)
            <input
              type="number"
              step="0.01"
              value={taxReturn.payments.stateTaxRefund}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  payments: { ...taxReturn.payments, stateTaxRefund: num(event.target.value) },
                })
              }
            />
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={taxReturn.payments.itemizedLastYear}
              onChange={(event) =>
                patch({
                  ...taxReturn,
                  payments: { ...taxReturn.payments, itemizedLastYear: event.target.checked },
                })
              }
            />
            Last year&apos;s federal return was itemized
          </label>
        </div>
      </section>

      <section>
        <div className="actions">
          <button type="button" onClick={calculate} disabled={pending}>
            {pending ? "Working…" : "Save and calculate"}
          </button>
          <button className="secondary" type="button" onClick={save} disabled={pending}>
            Save only
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setTaxReturn(sampleReturn);
              setUsingSample(true);
              setSummary(null);
              setStatus("Loaded the fake sample. It is not saved yet.");
            }}
          >
            Load fake sample
          </button>
        </div>
      </section>

      {summary ? <Summary summary={summary} /> : null}
    </main>
  );
}

function Summary({ summary }: { summary: ReturnSummary }) {
  const federal = summary.federal;
  const utah = summary.utah;
  return (
    <section>
      <h2>Computed return</h2>
      <div className="summary">
        <div>
          <h3>Federal Form 1040</h3>
          <table>
            <tbody>
              <Row label="Adjusted gross income" amount={federal.agi} />
              <Row label="Deduction" amount={federal.standardOrItemized} />
              <Row label="Qualified business income deduction" amount={federal.qbiDeduction} />
              <Row label="Taxable income" amount={federal.taxableIncome} />
              <Row label="Income tax" amount={federal.incomeTax} />
              <Row label="Self-employment tax" amount={federal.seTax} />
              <Row label="Total tax" amount={federal.totalTax} />
              <Row label="Payments" amount={federal.payments} />
              <Row label="Refund" amount={federal.refund} kind="refund" />
              <Row label="Amount owed" amount={federal.amountOwed} kind="owed" />
            </tbody>
          </table>
        </div>
        <div>
          <h3>Utah TC-40 worksheet</h3>
          <table>
            <tbody>
              <Row label="Federal AGI" amount={utah.federalAgi} />
              <Row label="Utah taxable income" amount={utah.utahTaxableIncome} />
              <Row label="Tax before credit" amount={utah.taxBeforeCredit} />
              <Row label="Taxpayer tax credit" amount={utah.taxpayerCredit} />
              <Row label="Utah income tax" amount={utah.utahIncomeTax} />
              <Row label="Withholding" amount={utah.withholding} />
              <Row label="Prepayments" amount={utah.prepayments} />
              <Row label="Refund" amount={utah.refund} kind="refund" />
              <Row label="Amount owed" amount={utah.amountOwed} kind="owed" />
            </tbody>
          </table>
        </div>
      </div>
      <h3>Downloads</h3>
      <div className="files">
        {summary.files.map((file) => (
          <a key={file} href={`/api/download?file=${encodeURIComponent(file)}`}>
            {file}
          </a>
        ))}
      </div>
      <ul className="notes">
        {summary.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  label,
  amount,
  kind,
}: {
  label: string;
  amount: number;
  kind?: "refund" | "owed";
}) {
  const className = kind && amount > 0 ? kind : "num";
  return (
    <tr>
      <td>{label}</td>
      <td className={className}>{money(amount)}</td>
    </tr>
  );
}
