#!/bin/sh
# Usage: [TERM_SNAP=xterm-ghostty] tools/snap.sh <columns> <outdir> — plays the mod in the test bench and writes PNGs of the arena.
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
COLS=${1:-78}
OUT=${2:-$DIR/.snaps}
mkdir -p "$OUT"
sed -e "s/__COLS__/$COLS/" -e "s/__TERM__/${TERM_SNAP:-xterm-256color}/" "$DIR/tools/snap.test.ts.txt" > "$DIR/tests/snap.test.ts"
claude plugin test "$DIR" > "$OUT/run.log" 2>&1 || true
rm -f "$DIR/tests/snap.test.ts"
node "$DIR/tools/snap-png.mjs" "$OUT/run.log" "$OUT"
grep "^TEXT" "$OUT/run.log" | cut -c1-400 || true
grep -E "\(fail\)|error" "$OUT/run.log" | head -5 || true
