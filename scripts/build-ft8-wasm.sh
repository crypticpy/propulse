#!/bin/bash
# =============================================================================
# build-ft8-wasm.sh — Compile ft8_lib (MIT) to WebAssembly via Emscripten
#
# Prerequisites: Emscripten SDK (emcc) must be installed and in PATH
#   macOS: brew install emscripten
#   Other: https://emscripten.org/docs/getting_started/downloads.html
#
# Output: public/wasm/ft8.js + public/wasm/ft8.wasm
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/public/wasm"
FT8_DIR="/tmp/ft8_lib"

# Clone ft8_lib if not already present
if [ ! -d "$FT8_DIR" ]; then
  echo "Cloning ft8_lib..."
  git clone --depth 1 https://github.com/kgoba/ft8_lib.git "$FT8_DIR"
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo "Compiling ft8_lib to WebAssembly..."

# Source files
SOURCES=(
  "$FT8_DIR/wasm_wrapper.c"
  "$FT8_DIR/ft8/constants.c"
  "$FT8_DIR/ft8/crc.c"
  "$FT8_DIR/ft8/decode.c"
  "$FT8_DIR/ft8/encode.c"
  "$FT8_DIR/ft8/ldpc.c"
  "$FT8_DIR/ft8/message.c"
  "$FT8_DIR/ft8/text.c"
  "$FT8_DIR/common/monitor.c"
  "$FT8_DIR/fft/kiss_fft.c"
  "$FT8_DIR/fft/kiss_fftr.c"
)

# Exported functions (the WASM API surface)
EXPORTED_FUNCTIONS='[
  "_ft8_init",
  "_ft8_process",
  "_ft8_decode",
  "_ft8_reset",
  "_ft8_free",
  "_ft8_get_block_size",
  "_ft8_get_decode_count",
  "_ft8_get_decode_message",
  "_ft8_get_decode_freq",
  "_ft8_get_decode_time",
  "_ft8_get_decode_snr",
  "_ft8_get_decode_ldpc_errors",
  "_ft8_get_decode_score",
  "_ft8_alloc_float_buffer",
  "_ft8_free_buffer",
  "_malloc",
  "_free"
]'

# Exported runtime methods for JS interop
EXPORTED_RUNTIME='["ccall","cwrap","UTF8ToString","HEAPF32","HEAPU8"]'

emcc "${SOURCES[@]}" \
  -I"$FT8_DIR" \
  -O2 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createFT8Module" \
  -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS" \
  -s EXPORTED_RUNTIME_METHODS="$EXPORTED_RUNTIME" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=2097152 \
  -s MAXIMUM_MEMORY=16777216 \
  -s STACK_SIZE=65536 \
  -s NO_EXIT_RUNTIME=1 \
  -s FILESYSTEM=0 \
  -s ENVIRONMENT='web,worker' \
  -s SINGLE_FILE=0 \
  -o "$OUTPUT_DIR/ft8.js"

echo ""
echo "Build complete!"
echo "  JS glue:  $OUTPUT_DIR/ft8.js"
echo "  WASM:     $OUTPUT_DIR/ft8.wasm"
echo ""
ls -lh "$OUTPUT_DIR/ft8.js" "$OUTPUT_DIR/ft8.wasm"
