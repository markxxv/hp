#!/usr/bin/env bash
# Convert FreePats Hang D minor CC0 FLAC samples to browser-compatible MP3.
set -euo pipefail
OUT="${1:-public/samples}"
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
SOURCE="$(mktemp -d)"
trap 'rm -rf "$SOURCE"' EXIT
git clone --depth 1 --quiet https://github.com/freepats/hang-D-minor.git "$SOURCE/freepats"
for note in A3 D4 E4 F4 G4 A4 Bb4 C5 D5; do
  for variant in 01 02 03; do
    input="$SOURCE/freepats/samples/${note}_${variant}.flac"
    output="$OUT/${note}_${variant}.mp3"
    test -f "$input" || { echo "Missing original sample: $input" >&2; exit 1; }
    ffmpeg -nostdin -loglevel error -y -i "$input" -vn -c:a libmp3lame -q:a 4 "$output"
    test -s "$output" || { echo "Empty audio output: $output" >&2; exit 1; }
  done
done
echo "Prepared 27 original acoustic handpan samples in $OUT"
