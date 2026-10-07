# Taxes

A one-person worksheet for a simple US federal return and a Utah full-year
resident return. You enter the numbers, OpenTaxSolver calculates the federal
forms, and you download the output to print and mail. There is no e-file.

Tax year **2025**, OpenTaxSolver **23.07** (`OpenTaxSolver2025_23.07_linux64`).
That is the current OTS release for the year being filed.

## What it calculates

Federal, via the vendored OpenTaxSolver engine compiled to WebAssembly:

- Form 1040
- Schedule 1 (business income, the deductible half of self-employment tax, a taxable state refund)
- Schedule B amounts (ordinary and qualified dividends go on Form 1040 lines 3a and 3b)
- Schedule C
- Schedule SE
- Schedule D totals (net short-term and long-term gain, not a sale-by-sale Form 8949)
- Form 8995 (simplified qualified business income deduction)

Utah TC-40 is **not** in OpenTaxSolver 23.07. The states OTS ships are Ohio,
New Jersey, Virginia, Pennsylvania, Massachusetts, North Carolina, Arizona,
Michigan, New York, Oregon, and California. Utah is a small worksheet in
`src/lib/ots/utah.ts`: full-year resident, 4.5% rate, the taxpayer tax credit,
withholding, and prepayments. It is not a filled Utah PDF.

Not calculated: itemized deductions, the earned income credit, the
estimated-tax penalty, specified-service or W-2/property limits on Form 8995,
TC-40A additions and subtractions beyond a prior-year state refund, and
part-year or nonresident Utah returns. Someone 65 or older should compare
OTS line 12 with Schedule 1-A; the extra standard deduction for age may have
moved for 2025, and the sample return is under 65.

This is a filing aid, not tax advice.

## Stack

Next.js (App Router) and TypeScript on Node 20. The sign-in gate is
`src/proxy.ts`: an HMAC cookie checked on every page and API, with the
username and password taken from `TAXES_AUTH_USER` and `TAXES_AUTH_PASSWORD`.
No analytics.

OpenTaxSolver stays in `vendor/opentaxsolver/` as C source. The programs the
app runs are prebuilt to WebAssembly in `wasm/` and executed from Node with
Emscripten's `NODERAWFS`, so they read and write real files on the server.
The browser never sees the engine or the PDF backgrounds. Hostinger cannot
compile C and its glibc is too old for a native Linux build of OTS, so the
`.wasm` files are committed and `npm run build` does not compile them.

The adapter that writes OTS input files is `src/lib/ots/`. How to drop in next
year's release is `src/lib/ots/ADAPTER.md`.

## Local development

```bash
cp .env.example .env
# set TAXES_AUTH_USER and TAXES_AUTH_PASSWORD
npm install
npm run dev
```

Open http://localhost:3000 and sign in. With no saved return, the form shows
clearly fake sample data (Alex Sample). Nothing is written until you save.

```bash
npm run smoke   # runs the committed WASM on the sample return
npm run build   # next build --webpack, same command Hostinger uses
npm run start   # next start --hostname 0.0.0.0
```

Saved data goes to `TAXES_DATA_PATH`, or to a sibling folder named `taxes-data`
when that variable is unset. The file is `return.json`. The last calculation
is `last-run/` next to it.

## Hostinger

Target: https://taxes.zionexperiences.com, same shared-hosting account as
finance.zionexperiences.com. Hostinger builds from GitHub. Do not add a
GitHub Actions deploy.

In hPanel, for the Node.js website:

| Setting | Value |
| --- | --- |
| Node version | 20 |
| Build command | `npm run build` |
| Start command | `npm run start` |
| Root | this repository |

Do not set the build command to `npm run build:wasm`.

Environment variables (hPanel, not the repo):

| Name | Purpose |
| --- | --- |
| `TAXES_AUTH_USER` | Sign-in username |
| `TAXES_AUTH_PASSWORD` | Sign-in password, and the key for the session cookie |
| `TAXES_DATA_PATH` | Absolute directory **outside** the app folder. Each deploy replaces the app directory. Example: `/home/USER/taxes-data` |

Create that data directory on the server before the first save. If
`TAXES_DATA_PATH` is unset, the app creates `../taxes-data` next to the
application directory, which only works when the process can write there.

Point `taxes.zionexperiences.com` at the new site and turn on SSL the same
way the finance site is set up. The app sends `noindex` and does not load
third-party scripts.

## Rebuilding the WebAssembly

On a machine with the Emscripten SDK (this tree was built with emsdk 6.0.11):

```bash
source /path/to/emsdk/emsdk_env.sh
npm run build:wasm
```

`scripts/build-wasm.sh` compiles the five programs the app calls and writes
`wasm/*.js`, `wasm/*.wasm`, and `wasm/BUILD.txt`. Commit those files.
`NODERAWFS` is required so the solvers can open the input files and the PDF
backgrounds by ordinary paths.

## Updating OpenTaxSolver each year

See `src/lib/ots/ADAPTER.md`. Short version: replace the vendor tree with the
new year's source and federal templates, bump `src/lib/ots/version.ts`, adjust
any renamed labels in `write-inputs.ts`, update `utah.ts` if Utah's rate or
credit changed, rebuild the wasm, and run `npm run smoke`.

## Broker CSV

The investment section accepts a small CSV and replaces the dividend and
capital-gain totals. Recognized layouts:

- `kind,amount` with kinds `ordinary_dividends`, `qualified_dividends`, `capital_gain_distributions`, `short_term_gain`, `long_term_gain`
- `form,box,amount` for 1099-DIV boxes 1a, 1b, and 2a, and 1099-B amounts with a `term` column
- 1099-B lots with `proceeds` and `cost` (or `gain`) plus `term` or acquired and sold dates

`samples/fake-1099.csv` is fake and matches the sample return. A Robinhood
composite PDF is not imported.

## Downloads

After Calculate, the page links to the OTS text output, the Utah worksheet,
and filled PDFs when the overlay succeeds. The PDF filler paints OTS's form
images. Checkboxes and the identity block still need a look before mailing.
If an overlay fails, the page says so and the text output remains the way to
copy amounts onto the official IRS forms. Utah is always the text worksheet.

## License

OpenTaxSolver is GPL-2.0. Its license is `vendor/opentaxsolver/OTS_2025_23.07/COPYING`.
The PDF filler upstream notes as LGPL; its source is
`vendor/opentaxsolver/OTS_2025_23.07/src/universal_pdf_file_modifier.c`.
The TypeScript in this repository is the application that runs that engine.
