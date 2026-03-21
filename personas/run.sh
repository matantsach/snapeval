#!/usr/bin/env bash
# Run all 3 persona agents against their assigned skills.
# Each persona runs snapeval and produces structured feedback JSON.
#
# Usage: ./personas/run.sh [persona-name]
#   No args: run all personas in parallel
#   With arg: run a single persona (alex, jordan, or sam)
#
# Monitor progress: tail -f personas/progress.log

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
OUTPUT_DIR="$SCRIPT_DIR/results/$TIMESTAMP"
PROGRESS_LOG="$SCRIPT_DIR/progress.log"

ALL_PERSONAS=("alex" "jordan" "sam")

# If a persona name is passed, run only that one
if [ $# -gt 0 ]; then
  PERSONAS=("$1")
  if [[ ! " ${ALL_PERSONAS[*]} " =~ " $1 " ]]; then
    echo "Unknown persona: $1. Available: ${ALL_PERSONAS[*]}" >&2
    exit 1
  fi
else
  PERSONAS=("${ALL_PERSONAS[@]}")
fi

mkdir -p "$OUTPUT_DIR"
cd "$REPO_ROOT"

# Reset progress log
echo "=== Persona run started at $TIMESTAMP ===" > "$PROGRESS_LOG"
echo "Output dir: $OUTPUT_DIR" >> "$PROGRESS_LOG"
echo "Personas: ${PERSONAS[*]}" >> "$PROGRESS_LOG"
echo "---" >> "$PROGRESS_LOG"

run_persona() {
  local persona="$1"
  local prompt_file="$SCRIPT_DIR/$persona/AGENT_PROMPT.md"

  if [ ! -f "$prompt_file" ]; then
    echo "[$persona] ERROR: $prompt_file not found" >> "$PROGRESS_LOG"
    return 1
  fi

  echo "[$persona] started" >> "$PROGRESS_LOG"
  claude -p "$(cat "$prompt_file")" \
    --output-format text \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    > "$OUTPUT_DIR/$persona.txt" 2>&1 || true
  echo "[$persona] finished → $OUTPUT_DIR/$persona.txt" >> "$PROGRESS_LOG"
}

# Run personas in parallel
PIDS=()
for persona in "${PERSONAS[@]}"; do
  run_persona "$persona" &
  PID=$!
  PIDS+=($PID)
  echo "Launched $persona (PID $PID)"
done

echo ""
echo "All personas launched. Monitor progress:"
echo "  tail -f personas/progress.log"
echo ""

# Wait for all to complete
FAILED=0
for i in "${!PIDS[@]}"; do
  if ! wait "${PIDS[$i]}"; then
    echo "${PERSONAS[$i]} failed" >> "$PROGRESS_LOG"
    FAILED=$((FAILED + 1))
  fi
done

echo "---" >> "$PROGRESS_LOG"
echo "=== All done ($FAILED failures) ===" >> "$PROGRESS_LOG"
echo ""
echo "All done. Results in: $OUTPUT_DIR"
echo "Progress log: $PROGRESS_LOG"
