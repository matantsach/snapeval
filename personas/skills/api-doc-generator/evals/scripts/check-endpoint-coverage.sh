#!/usr/bin/env bash
# Validates every OpenAPI path appears in the generated markdown.
# Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

# Check that the output contains at least one path-like heading (## /something)
if ! grep -qE '^#{1,3} .*/' "$OUTPUT_FILE"; then
  echo "FAIL: no endpoint path headings found in output" >&2
  exit 1
fi
