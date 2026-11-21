#!/usr/bin/env bash
# Fallback DMG builder for machines where `hdiutil create -srcfolder` (used by Tauri's bundler) fails.
# usage: scripts/make-dmg.sh  -> src-tauri/target/release/bundle/dmg/WanWan-chan_<version>_aarch64.dmg
set -euo pipefail
cd "$(dirname "$0")/.."
B=src-tauri/target/release/bundle
APP="$B/macos/WanWan-chan.app"
VER=$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed -E 's/.*: *"([^"]+)".*/\1/')
OUT="$B/dmg/WanWan-chan_${VER}_aarch64.dmg"
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
