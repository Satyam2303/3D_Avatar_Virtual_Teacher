# 3D Avatar Virtual Teacher

This project is a React + Vite web app where a virtual teacher reads PDF text aloud and points to each spoken word in real time.

## Key Features
- Upload and render any PDF (or use `public/sample.pdf`) with page navigation.
- Extract words directly from the PDF text layer for precise word indexing.
- Read page content aloud using browser Text-to-Speech (`SpeechSynthesisUtterance`).
- Real-time word tracking using `onboundary` events and binary-search mapping.
- Highlight the exact spoken word using DOM `Range` + fixed overlay coordinates.
- Show a 3D-style animated teacher avatar that points to the current word.
- Speech controls: `Speak`, `Pause`, `Resume`, `Stop`.
- Learning controls: voice selection, speech rate, pitch, and zoom.
- Auto-reading flow with `Auto page-turn` and optional `Auto continue`.
- Live teaching status panel showing mode, words detected, and current word.

## Interview Explanation (Short Version)
1. User loads a PDF and the app renders one page at a time using `react-pdf`.
2. I parse the text-layer spans and create a word-by-word segment map.
3. I generate one utterance from those words and listen to TTS `charIndex` boundary events.
4. I map each boundary to the current word in `O(log n)` using binary search.
5. I compute the spoken word's DOM rectangle and sync both:
   avatar pointer target and highlight overlay.
6. At utterance end, the app can automatically turn pages and continue reading.

## Engineering Highlights (Good Interview Points)
- Real-time synchronization between visual UI state and TTS events.
- Robust word-rect detection with fallback logic when exact range rects fail.
- Scroll/resize-safe pointer updates with `requestAnimationFrame`.
- Clean component separation:
  `PdfTeacher` (logic), `AvatarPointer` (teaching avatar), `WordHighlightOverlay` (focus highlight).
- Deploy-ready setup for GitHub Pages (`base`, `homepage`, `gh-pages` script).

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
