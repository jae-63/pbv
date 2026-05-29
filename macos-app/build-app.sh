#!/bin/bash
set -e
cd "$(dirname "$0")"

swift build

APP=".build/debug/PBV.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

cp .build/debug/PBV "$APP/Contents/MacOS/PBV"
cp Info.plist "$APP/Contents/Info.plist"

# compiled.json is bundled into the binary by SPM; no separate copy needed.

# Ad-hoc sign so macOS privacy dialogs work without a developer certificate.
codesign --force --deep --sign - "$APP"

echo "Built: $APP"
echo "Run:   open $APP"
