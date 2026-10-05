#!/bin/sh
# Rebuilds helper/engine.mjs (the picture process) from hooks/: run after editing render.ts, png.ts, art.ts or sim.ts.
cd "$(dirname "$0")/.." && npx -y esbuild helper/src/main.ts --bundle --platform=node --format=esm --target=node18 --outfile=helper/engine.mjs --log-level=warning && echo "helper/engine.mjs rebuilt"
