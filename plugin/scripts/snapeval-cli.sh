#!/bin/bash
# Ensures npx snapeval is available
if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Install Node.js first."
  exit 2
fi
npx snapeval "$@"
