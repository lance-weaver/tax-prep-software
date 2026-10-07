#!/usr/bin/env bash
# Rebuild the OpenTaxSolver WebAssembly binaries committed under wasm/.
#
# Hostinger's build machine has no C compiler and a glibc older than 2.29,
# so this script is run on a developer machine (or CI) and the .js/.wasm
# outputs are committed. Deploy never compiles OTS.
#
# Requires the Emscripten SDK (https://emscripten.org/). This repo was built
# with emsdk 6.0.11. Activate it first, for example:
#   source /path/to/emsdk/emsdk_env.sh
#   npm run build:wasm
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/vendor/opentaxsolver/OTS_2025_23.07/src"
OUT="$ROOT/wasm"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found. Install emsdk and run: source emsdk_env.sh" >&2
  exit 1
fi

mkdir -p "$OUT"

# Programs the app actually invokes. Other vendored solvers stay as source
# for the yearly drop-in; they are not compiled until the adapter uses them.
SOLVERS=(
  taxsolve_US_1040_2025
  taxsolve_US_1040_Sched_C_2025
  taxsolve_US_1040_Sched_SE_2025
  taxsolve_f8995_2025
  universal_pdf_file_modifier
)

# NODERAWFS makes fopen/fwrite use Node's real filesystem, so the adapter
# can pass ordinary absolute paths (input templates, the big PDF backgrounds,
# and the filled PDFs) without packing them into the wasm module.
COMMON=(
  -O2
  -sMODULARIZE=1
  -sEXPORT_NAME=createOtsModule
  -sENVIRONMENT=node
  -sINVOKE_RUN=0
  -sEXIT_RUNTIME=1
  -sNODERAWFS=1
  -sALLOW_MEMORY_GROWTH=1
  -sINITIAL_MEMORY=33554432
  -sSTACK_SIZE=1048576
  -sEXPORTED_RUNTIME_METHODS=callMain
)

for name in "${SOLVERS[@]}"; do
  echo "compiling $name"
  emcc "${COMMON[@]}" -I "$SRC" "$SRC/$name.c" -lm -o "$OUT/$name.js"
done

{
  echo "emcc $(emcc --version | head -n 1)"
  echo "built $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$OUT/BUILD.txt"

echo "wrote $OUT"
ls -lh "$OUT"
