# HP — Handpan Studio

Static browser instrument with **real FreePats Hang recordings**, ABC notation, live music sheet, and a persistent local song library. No server, account, database, or synthesizer.

## Demo / GitHub Pages

1. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
2. Go to **Actions → Deploy Handpan Studio to GitHub Pages → Run workflow** (or push to main).
3. Visit **https://markxxv.github.io/hp/** when deployment succeeds.

**Note:** This repository was private when the demo was created. GitHub Pages for private repositories requires an eligible plan. If Pages is not available, switch the repo to **Public** in **Settings → General → Danger Zone → Change visibility**. GitHub Pages websites are publicly accessible even when the source repository is private.

## Local run

Requires git, ffmpeg, and Python 3:

~~~bash
bash scripts/prepare-samples.sh samples
python3 -m http.server 8000
~~~

Open http://localhost:8000. There is no package install or build step. The `npm test` command runs standalone Node.js checks.

## Features

- Original **9 recorded pitches**: A3, D4, E4, F4, G4, A4, Bb4, C5, D5.
- Three natural recording variations per note; no transposition of metallic overtones.
- Web Audio API sampler, subtle adjustable reverb, volume.
- Tap the instrument or press number keys **1–9** (outside text fields).
- Play / pause / stop ABC compositions, with musical notation and progress.
- Paste ABC, edit the text directly, or import an `.abc` / `.txt` file.
- Save multiple compositions locally. Load, edit, overwrite, create, and delete.
- Two included demo compositions, seeded only on the first visit.

All custom compositions remain in your browser's **localStorage**. Clearing site data deletes them. Back up by copying the ABC source.

## How audio is deployed

The GitHub Actions workflow fetches the [FreePats Hang D minor source recordings](https://github.com/freepats/hang-D-minor), transcodes 27 FLAC samples to MP3 with FFmpeg, and publishes the generated `samples/` folder with the static HTML/CSS/JavaScript. Audio files are not stored in this Git repository. The player deliberately ignores pitches not recorded by the original instrument.

### Licensing

- Handpan recordings: FreePats Hang D minor (2022-03-30), **Creative Commons CC0 1.0**.
- ABC notation/score rendering: [abcjs](https://www.abcjs.net/), **MIT** (loaded from pinned jsDelivr CDN).
- Application code: MIT.

## Files

- `index.html` — responsive interface.
- `assets/app.js` — ABC editor, playback, UI, library.
- `assets/audio.js` — acoustic Web Audio sampler.
- `assets/library.js` — example melodies and localStorage CRUD.
- `assets/style.css` — dark responsive styles.
- `scripts/prepare-samples.sh` — source-to-MP3 conversion.
- `.github/workflows/pages.yml` — Pages deployment.
