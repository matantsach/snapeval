#!/usr/bin/env bash
# Validates output contains properly formatted markdown headers.
# Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

# Check for at least one H1
if ! grep -qE '^# ' "$OUTPUT_FILE"; then
  echo "FAIL: no H1 header found in output" >&2
  exit 1
fi

# Check that headers use proper markdown format (# not underline style)
if grep -qE '^[=-]+$' "$OUTPUT_FILE"; then
  echo "FAIL: found underline-style headers — use # prefix style" >&2
  exit 1
fi
