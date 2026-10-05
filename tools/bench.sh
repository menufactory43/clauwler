#!/bin/sh
# Plays the mod in a headless Claude Code under a fake Ghostty; the player's save is put back after.
# BENCH_CWD: a folder Claude Code already trusts (defaults to the repo).
cd "$(dirname "$0")"; mkdir -p ../.snaps; cd ../.snaps; cp ../tools/drive.py .
S=$(ls ~/.claude/plugins/store/clauwler_inline-*.json)
cp "$S" store.bak
python3 drive.py "${1:-run}"
cp "$S" store.after; cp store.bak "$S"
F=$(ls -t ../.perf/*.log | head -1)
tail -5 "$F"; rm -f "$F"
