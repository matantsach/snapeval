#!/usr/bin/env bash
# Validates that output.txt contains valid JSON with required fields.
# Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

# Check valid JSON
if ! node -e "JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'))" 2>/dev/null; then
  echo "FAIL: output.txt is not valid JSON" >&2
  exit 1
fi

# Check required fields
node -e "
const obj = JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'));
if (!Array.isArray(obj.issues)) { console.error('FAIL: missing issues array'); process.exit(1); }
if (typeof obj.summary !== 'string') { console.error('FAIL: missing summary string'); process.exit(1); }
for (const [i, issue] of obj.issues.entries()) {
  for (const field of ['type','description','line','suggestion']) {
    if (typeof issue[field] !== 'string') {
      console.error('FAIL: issue[' + i + '] missing field: ' + field);
      process.exit(1);
    }
  }
}
"
