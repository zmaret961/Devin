#!/bin/bash
# Double-click to start the Devin Oncall Simulator (macOS).
cd "$(dirname "$0")" || exit 1
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download it from https://nodejs.org (LTS), install it, then double-click this file again."
  open "https://nodejs.org"
  read -r -p "Press Enter to close..."
  exit 1
fi
if ! git --version >/dev/null 2>&1; then
  echo "The demo needs git, part of Apple's free developer tools. Opening the installer..."
  xcode-select --install >/dev/null 2>&1
  echo "Click Install in the box that pops up. When it finishes, double-click Start Demo again."
  read -r -p "Press Enter to close..."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First run: installing (this takes about a minute)..."
  npm install || { read -r -p "Install failed. Press Enter to close..."; exit 1; }
fi
(sleep 8 && open "http://localhost:4100") &
echo "Starting... the dashboard will open in your browser. Close this window to stop the demo."
npm run demo
