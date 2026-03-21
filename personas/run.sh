#!/usr/bin/env bash
# Run all 3 persona agents against their assigned skills.
# Each persona runs snapeval and produces structured feedback JSON.
#
# Usage: ./personas/run.sh [persona-name]
#   No args: run all personas sequentially
#   With arg: run a single persona (alex, jordan, or sam)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/results/$(date +%Y-%m-%d-%H%M%S)"

ALL_PERSONAS=("alex" "jordan" "sam")

# If a persona name is passed, run only that one
if [ $# -gt 0 ]; then
  PERSONAS=("$1")
  # Validate
  if [[ ! " ${ALL_PERSONAS[*]} " =~ " $1 " ]]; then
    echo "Unknown persona: $1. Available: ${ALL_PERSONAS[*]}" >&2
    exit 1
  fi
else
  PERSONAS=("${ALL_PERSONAS[@]}")
fi

mkdir -p "$OUTPUT_DIR"
cd "$REPO_ROOT"

for persona in "${PERSONAS[@]}"; do
  PROMPT_FILE="$SCRIPT_DIR/$persona/AGENT_PROMPT.md"
  if [ ! -f "$PROMPT_FILE" ]; then
    echo "ERROR: $PROMPT_FILE not found" >&2
    exit 1
  fi

  echo "=== Running $persona ==="
  claude -p "$(cat "$PROMPT_FILE")" \
    --output-format text \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    > "$OUTPUT_DIR/$persona.txt" 2>&1 || true
  echo "=== $persona done → $OUTPUT_DIR/$persona.txt ==="
done

echo ""
echo "All done. Results in: $OUTPUT_DIR"
