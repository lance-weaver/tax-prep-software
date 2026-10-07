# Agent notes

This app is deployed the same way as the finance dashboard on the same
Hostinger shared-hosting account.

- Node 20. Hostinger runs `npm run build` and `npm run start`.
- `npm run build` is `next build --webpack`. Turbopack fails on Hostinger's
  glibc (older than 2.29).
- The build machine has no `make` and no C compiler. Do not add a native
  module, `node-gyp`, or a compile step to `npm run build` or `npm run start`.
- OpenTaxSolver is already compiled to WebAssembly in `wasm/`. Rebuild it only
  with `npm run build:wasm` on a machine that has Emscripten, then commit the
  artifacts. See `src/lib/ots/ADAPTER.md`.
- Saved returns live outside the app directory (`TAXES_DATA_PATH`, default
  `../taxes-data`). A deploy replaces the app folder.
- Environment variables are set in hPanel. Do not commit `.env` or a real return.
- Every page and API is behind the sign-in gate in `src/proxy.ts`.
