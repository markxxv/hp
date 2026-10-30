# HP — Handpan Studio

Handpan player with **real FreePats Hang recordings**, ABC playback, a local playlist, keyboard pads and an ABC editor. No server, account, database, or synthesizer.

## Demo / GitHub Pages

1. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
2. In **Actions**, run **Deploy Handpan Studio to GitHub Pages** if necessary.
3. Visit **https://markxxv.github.io/hp/** after the deployment succeeds.

## Local run

All **27 acoustic MP3 samples are committed to `samples/`** and ship with the repository. You don't need to download or generate sounds separately.

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. The app is plain HTML, CSS, and JavaScript without a build step. `npm test` runs built-in Node.js checks.

## Features

- Nine physically recorded pitches: A3, D4, E4, F4, G4, A4, Bb4, C5, D5; three natural recordings per note (27 MP3 files).
- Audio playback through Web Audio API, adjustable reverb and volume. No pitch shifting.
- Click/tap instrument or press number keys **1–9** outside text fields.
- Parse and play ABC compositions with Web Audio clock scheduling, pause/resume, seeking, previous/next controls.
- Play with **A S D F G H J K L** (ascending notes). Additional keys **; ' \\** repeat A3, D4, E4.
- The ABC parser supports note lengths, rests, chords, key signatures, accidentals, tuplets, simple repeats and broken rhythms; alternate endings are explicitly rejected.
- Paste ABC, edit text, or import an `.abc`/`.txt` file.
- Save multiple compositions to `localStorage`; create, load, edit, overwrite, and delete.
- Two ready-to-play examples installed on first visit.

Data is stored only in that browser. Copy the ABC source as a backup before clearing browser storage.

## Sample provenance and deployment

Samples: [FreePats Hang D minor](https://github.com/freepats/hang-D-minor), CC0 public domain dedication.

The `samples/` folder **is tracked by Git**. On a clean repository without audio files, the Actions workflow downloads original FreePats FLAC recordings, converts three performances for each pitch to MP3 via FFmpeg, and **commits them back to `main`**. Subsequent Pages deployments use the committed MP3 files directly.

Manual sample regeneration:

```bash
bash scripts/prepare-samples.sh samples
```

Requires `git` and `ffmpeg`.

## Licenses

- Handpan recordings: FreePats Hang D minor (2022-03-30), **CC0 1.0**.
- ABC notation: [abcjs](https://www.abcjs.net/), **MIT**, served from pinned CDN.
- Application code: MIT.

## Structure

- `index.html` — instrument interface.
- `assets/app.js` — player, editor and controls.
- `assets/abc.js` — standalone ABC parser without CDN dependencies.
- `assets/audio.js` — genuine acoustic sampler.
- `assets/library.js` — localStorage melodies and presets.
- `assets/style.css` — responsive UI.
- `samples/` — **27 recorded MP3 files committed into Git**.
- `scripts/prepare-samples.sh` — audio conversion.
- `.github/workflows/pages.yml` — GitHub Pages deployment.
