#!/usr/bin/env bash
# Validates that all issues have a severity field with valid values.
# For use with SKILL-v2.md evals. Receives the outputs/ directory as $1.

OUTPUT_FILE="$1/output.txt"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "FAIL: output.txt not found at $OUTPUT_FILE" >&2
  exit 1
fi

node -e "
const obj = JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'));
const valid = ['critical','warning','info'];
for (const [i, issue] of (obj.issues || []).entries()) {
  if (!valid.includes(issue.severity)) {
    console.error('FAIL: issue[' + i + '].severity is \"' + issue.severity + '\" — expected one of: ' + valid.join(', '));
    process.exit(1);
  }
}
"
