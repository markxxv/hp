# Handpan Player

A browser handpan with 27 genuine acoustic FreePats recordings, ABC playback and a playlist in `localStorage`. Built using **Vite 8** and vanilla JavaScript.

## Local development

Node.js 20.19+ (Node.js 22 recommended):

```bash
git clone https://github.com/markxxv/hp.git
cd hp
npm ci
npm run dev
```

Development server: **http://localhost:5173/**. Vite provides instant hot reloading.

## Production

```bash
npm run build
npm run preview
```

The production output is **`dist/`**, previewed at **http://localhost:4173/**. Deploy the contents of `dist/` to Nginx, GitHub Pages, Netlify, Cloudflare Pages, S3 or any static HTTP host. Vite is configured with `base: './'`, so the same build works in the root or a subdirectory (e.g. `/hp/`).

Additional commands: `npm run check`, `npm test`, `npm run verify` (run after building).

## GitHub Pages

[Online demo](https://markxxv.github.io/hp/) · [CI and deployment](https://github.com/markxxv/hp/actions)

Pushes to `main` automatically run the Node.js checks, tests, `vite build`, verify the build contains all 27 recordings and publish the resulting **`dist/`** folder. GitHub Pages source is **GitHub Actions**.

## File layout

- `index.html` — Vite HTML entry.
- `src/main.js` — player, editor, keyboard and playlist.
- `src/abc.js` — local ABC parser.
- `src/audio.js` — sampled Web Audio engine.
- `src/library.js` — example tunes and `localStorage`.
- `src/style.css` — UI styles.
- `public/samples/` — **27 authentic MP3s committed to Git**; Vite copies these unmodified to `dist/samples/`.
- `vite.config.js` — portable relative deployment base.
- `scripts/verify-dist.mjs` — check built assets and recordings.
- `scripts/prepare-samples.sh` — optional regeneration (requires git and FFmpeg).
- `.github/workflows/pages.yml` — CI / GitHub Pages deployment.

No separate downloading or audio transcoding is needed to develop, test or build this project.

## Instrument

- Nine sampled notes: A3, D4, E4, F4, G4, A4, Bb4, C5, D5; three natural takes per note.
- Keys: **A S D F G H J K L**; **; ' \\** repeat the first three notes.
- ABC playback, pause/resume, seeking, next/previous, volume and reverb.
- Edit, paste or import ABC scores; store multiple compositions in browser `localStorage`.
- Supports standard note durations, rests, chords, accidentals, tuplets, simple repeat blocks and broken rhythm. Unsupported ABC constructs show an error.

## Credits

Recordings: [FreePats Hang D minor](https://github.com/freepats/hang-D-minor), **Creative Commons CC0 1.0**. Application code: MIT.
