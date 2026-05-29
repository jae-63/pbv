#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$SCRIPT_DIR/PBV.app"
BINARY="$SCRIPT_DIR/.build/debug/PBV"

# Build first
swift build 2>&1 | grep -v "xcrun: error"

# Create bundle structure
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources"

# Copy binary and plist
cp "$BINARY" "$APP/Contents/MacOS/PBV"
cp "$SCRIPT_DIR/Info.plist" "$APP/Contents/Info.plist"

# Ad-hoc sign so TCC trusts it
codesign --force --deep --sign - "$APP"

echo "Bundle created: $APP"
echo "Run with: open $APP"
