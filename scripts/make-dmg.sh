#!/usr/bin/env bash
# Fallback DMG builder for machines where `hdiutil create -srcfolder` (used by Tauri's bundler) fails.
# usage: scripts/make-dmg.sh  -> src-tauri/target/release/bundle/dmg/WanWan-chan_<version>_<universal|aarch64>.dmg
set -euo pipefail
cd "$(dirname "$0")/.."
B=src-tauri/target/release/bundle
APP="$B/macos/WanWan-chan.app"
ARCH=aarch64
# prefer the universal (Apple Silicon + Intel) build when it exists
if [ -d "src-tauri/target/universal-apple-darwin/release/bundle/macos/WanWan-chan.app" ]; then
  APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/WanWan-chan.app"; ARCH=universal
fi
VER=$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed -E 's/.*: *"([^"]+)".*/\1/')
OUT="$B/dmg/WanWan-chan_${VER}_${ARCH}.dmg"
TMP=$(mktemp -d)
mkdir -p "$B/dmg"; rm -f "$OUT"
hdiutil create -size 40m -fs HFS+ -volname WanWan-chan "$TMP/rw.dmg" >/dev/null
MNT="$TMP/mnt"; mkdir -p "$MNT"
hdiutil attach "$TMP/rw.dmg" -mountpoint "$MNT" -nobrowse >/dev/null
trap 'hdiutil detach "$MNT" -force >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
ditto "$APP" "$MNT/WanWan-chan.app"
ln -s /Applications "$MNT/Applications"
sync
hdiutil detach "$MNT" >/dev/null
hdiutil convert "$TMP/rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$OUT" >/dev/null
echo "$OUT"
