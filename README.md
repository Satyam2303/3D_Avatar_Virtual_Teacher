# 3D Avatar Virtual Teacher

This project is a React + Vite web app where a virtual teacher reads PDF text aloud and points to each spoken word in real time.

## What Is Implemented
- PDF rendering with `react-pdf` (single-page view with page navigation and zoom).
- Text-layer word extraction from PDF spans.
- Text-to-speech playback using `SpeechSynthesisUtterance`.
- Word-level sync using `speechSynthesis.onboundary` + binary search mapping.
- Live viewport highlight overlay on the currently spoken word.
- Animated 3D-style avatar pointer with speaking/paused states.
- Auto page-turn and optional auto-continue reading.
- Voice, rate, and pitch controls with runtime status panel.
- GitHub Pages deployment setup (`gh-pages`, Vite `base`, `homepage`).

## Project Figures
- `5` source `.jsx` files and `2` source `.css` files in `src/`.
- `3` custom core components: `PdfTeacher`, `AvatarPointer`, `WordHighlightOverlay`.
- `9` direct npm dependencies (`3` runtime + `6` dev).
- `~1,550` lines across source (`.jsx/.js/.css`, including comments).
- Latest production build transformed `72` modules in `2.42s`.
- Latest bundle output:
  - `535.93 kB` main JS (`162.78 kB` gzip)
  - `21.90 kB` CSS (`5.14 kB` gzip)
  - `1,369.81 kB` PDF worker asset

## Run Locally
```bash
npm install
npm run dev
```

## Build and Deploy
```bash
npm run build
npm run deploy
```
