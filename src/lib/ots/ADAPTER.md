# OpenTaxSolver adapter

Federal tax is calculated by the vendored OpenTaxSolver programs under
`vendor/opentaxsolver/`. This folder is the only TypeScript that knows how to
talk to them. A yearly update should be a source drop plus a small edit here,
not a rewrite.

## What runs

`run-return.ts` calls the committed WebAssembly builds in `wasm/`, in order:

1. `taxsolve_US_1040_Sched_C_2025` — Schedule C net profit (line 31).
2. `taxsolve_US_1040_Sched_SE_2025` — self-employment tax. Line 2 is the
   Schedule C profit. Line 8a is W-2 Social Security wages (box 3, or box 1
   when box 3 was left blank).
3. `taxsolve_US_1040_2025` with the QBI deduction still zero.
4. `taxsolve_f8995_2025` when there is business income. It reads the pass-1
   1040 output and the Schedule C output. Line `L1_i_c` is set to 0 so OTS
   computes qualified business income itself. The deduction it prints is `L15`.
5. `taxsolve_US_1040_2025` again with `L13a` set to that deduction.
   The 2025 Form 8995 template has a stray `;` on `L1_iii_a`. OTS treats any
   non-empty name plus a zero amount as another auto-calculated Schedule C,
   which would count the business twice. `writeForm8995` clears that name.
6. `universal_pdf_file_modifier` for each form that has a metadata file and a
   PDF background in `src/formdata`. A failed overlay is not fatal.

Utah is not one of these programs. `utah.ts` is a full-year resident TC-40
worksheet that takes federal AGI (`L11a`) and the federal deduction (`L12`).

## How inputs are written

OTS reads labels in order and stops if one is missing. `fill-template.ts`
copies the official template and replaces values on the existing lines.
`write-inputs.ts` is the list of labels this app sets. If a label is gone
after a yearly drop, the filler throws and names the label.

Output files are `<input stem>_out.txt`. Parsed lines look like `L11a = 12345.67`.

## Yearly update

1. Download the newest OpenTaxSolver package for the tax year being filed.
2. Replace `vendor/opentaxsolver/OTS_<year>_<version>/` with the new `src/`
   (solvers, routines, Makefile) and the federal templates this app uses:
   US 1040, Schedule C, Schedule SE, Form 8995, plus their `formdata` files.
   Leave the GTK GUI and prebuilt Linux binaries out. Keep `COPYING`.
3. Update `src/lib/ots/version.ts` and the program names in
   `scripts/build-wasm.sh` and `run-return.ts` if the filenames gained a year.
4. Diff the templates against `write-inputs.ts`. Rename labels that moved.
   Re-check standard-deduction and self-employment constants only if you touch
   `utah.ts` or if Schedule SE's wage base changed and you need the smoke
   ranges updated. The federal constants live in the C code.
5. If Utah published a new rate, exemption, or phase-out, edit `utah.ts` and
   say so in the README. OTS still will not have shipped Utah.
6. Rebuild with `npm run build:wasm` on a machine that has Emscripten, commit
   `wasm/`, and run `npm run smoke`.

Do not compile OTS during `npm run build`. Hostinger has no C compiler.
