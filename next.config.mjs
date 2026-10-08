/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pdfjs-dist"],
  // The committed OpenTaxSolver wasm glue is loaded from disk at runtime
  // (see loadFactory in run-solver.ts) so the .wasm file stays next to its .js.
};

export default nextConfig;
