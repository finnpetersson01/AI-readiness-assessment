#!/bin/bash
cd "$(dirname "$0")/.."
echo "Starting AI Project Readiness prototype..."
echo

if command -v python3 >/dev/null 2>&1; then
  python3 server.py
elif command -v python >/dev/null 2>&1; then
  python server.py
else
  echo "Python 3 was not found. Install it from python.org or with 'brew install python3'."
fi

echo
echo "The prototype stopped. Press Enter to close this window."
read -r
