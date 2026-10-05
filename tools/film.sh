#!/bin/sh
# Films a run the bot plays: tools/film.sh [out.mp4] [seed] [seconds]. FILM_LANG=en for English.
cd "$(dirname "$0")/.." && npx -y esbuild tools/film/main.ts --bundle --platform=node --format=esm --target=node18 --outfile=tools/film/film.mjs --log-level=warning && node tools/film/film.mjs "${1:-clauwler.mp4}" "${2:-74}" "${3:-75}"
