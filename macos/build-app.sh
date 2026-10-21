#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/build"
BUNDLE_PATH="$OUTPUT_DIR/T3rm1nal.app"

if command -v xcodebuild >/dev/null 2>&1 && xcodebuild -version >/dev/null 2>&1; then
  xcodebuild \
    -project "$SCRIPT_DIR/T3rm1nal.xcodeproj" \
    -scheme T3rm1nal \
    -configuration Release \
    -destination 'platform=macOS' \
    -derivedDataPath "$OUTPUT_DIR/DerivedData" \
    CODE_SIGNING_ALLOWED=NO \
    build
  mkdir -p "$OUTPUT_DIR"
  ditto "$OUTPUT_DIR/DerivedData/Build/Products/Release/T3rm1nal.app" "$BUNDLE_PATH"
else
  REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  SDK_PATH="$(xcrun --show-sdk-path)"
  CONTENTS_PATH="$BUNDLE_PATH/Contents"
  RESOURCES_PATH="$CONTENTS_PATH/Resources"

  if ! command -v swiftc >/dev/null 2>&1; then
    echo "Install Xcode or the Apple command-line tools to build the macOS app." >&2
    exit 1
  fi

  mkdir -p "$CONTENTS_PATH/MacOS" "$RESOURCES_PATH"
  swiftc \
    -parse-as-library \
    -O \
    -target arm64-apple-macosx14.0 \
    -sdk "$SDK_PATH" \
    -framework AppKit \
    -framework Combine \
    -framework SwiftUI \
    -framework WebKit \
    "$SCRIPT_DIR/Sources/T3rm1nalApp.swift" \
    -o "$CONTENTS_PATH/MacOS/T3rm1nal"
  cp "$SCRIPT_DIR/Sources/Info.plist" "$CONTENTS_PATH/Info.plist"
  ditto "$REPOSITORY_ROOT/site" "$RESOURCES_PATH/site"
  cp "$SCRIPT_DIR/Resources/AppIcon.icns" "$RESOURCES_PATH/AppIcon.icns"
fi

echo "Built $BUNDLE_PATH"
