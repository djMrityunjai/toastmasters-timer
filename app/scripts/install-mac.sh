#!/usr/bin/env bash
# Build the app for this Mac and install it into /Applications, replacing the old copy.
# Settings, OBS password, backgrounds and report history live in
# ~/Library/Application Support/Toastmasters Timer and are kept.
#
# Usage (from app/):  npm run install:mac
# Bump the version first if you like:  npm version patch --no-git-tag-version
set -euo pipefail

APP_NAME="Toastmasters Timer"
DEST="/Applications/${APP_NAME}.app"
cd "$(dirname "$0")/.."

case "$(uname -m)" in
  arm64) ARCH=arm64; OUT_DIR="dist/mac-arm64" ;;
  *)     ARCH=x64;   OUT_DIR="dist/mac" ;;
esac
VERSION="$(node -p "require('./package.json').version")"

echo "▸ Building ${APP_NAME} ${VERSION} (${ARCH})…"
npx electron-vite build
npx electron-builder --mac dir "--${ARCH}" -c.mac.identity=null >/dev/null

BUILT="${OUT_DIR}/${APP_NAME}.app"
[ -d "$BUILT" ] || { echo "Build output not found: $BUILT" >&2; exit 1; }

if pgrep -f "${APP_NAME}.app/Contents/MacOS/" >/dev/null; then
  echo "▸ Quitting the running app…"
  osascript -e "quit app \"${APP_NAME}\"" || true
  for _ in $(seq 1 20); do pgrep -f "${APP_NAME}.app/Contents/MacOS/" >/dev/null || break; sleep 0.5; done
fi

if [ -d "$DEST" ]; then
  OLD="$(defaults read "$DEST/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo '?')"
  echo "▸ Replacing installed version ${OLD} → ${VERSION}"
  rm -rf "$DEST"
else
  echo "▸ Installing ${VERSION}"
fi
ditto "$BUILT" "$DEST"

echo "▸ Launching…"
open "$DEST"
echo "✓ ${APP_NAME} ${VERSION} installed at ${DEST}"
