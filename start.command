#!/bin/bash
# eEPUB Calibre Helper launcher (Mac)
# Double-click this file to set up (first run only) and start the helper.
# Closing the terminal window stops the helper
# (KFX/Kindle conversion in eEPUB stops working).

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "[ERROR] Node.js was not found."
  echo "Please install Node.js first, then double-click this file again."
  echo "  https://nodejs.org/"
  echo ""
  read -r -p "Press Enter to close this window..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo ""
  echo "First run: installing dependencies, this may take a moment..."
  echo ""
  if ! npm install; then
    echo ""
    echo "[ERROR] npm install failed. See the log above."
    echo ""
    read -r -p "Press Enter to close this window..."
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo " Starting eEPUB Calibre Helper"
echo " Keep this window open while you use it in eEPUB."
echo " Closing this window stops the helper."
echo "============================================================"
echo ""

npm start

echo ""
echo "Helper stopped."
read -r -p "Press Enter to close this window..."
