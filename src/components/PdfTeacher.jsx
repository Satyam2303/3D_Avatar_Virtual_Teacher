import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import AvatarPointer from "./AvatarPointer.jsx";
import WordHighlightOverlay from "./WordHighlightOverlay.jsx";

// IMPORTANT for Vite: set pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function binarySearchWordIndex(starts, charIndex) {
  // greatest i where starts[i] <= charIndex
  let lo = 0,
    hi = starts.length - 1,
    ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= charIndex) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

function getFirstTextNode(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) return n;
  }
  return null;
}

/**
 * Build a word-level map from react-pdf TextLayer spans:
 * each word: { index, word, spanEl, textNode, startOffset, endOffset }
 */
function extractWordSegments(textLayerEl) {
  const segments = [];
  const spans = Array.from(textLayerEl.querySelectorAll("span"));

  let index = 0;
  for (const span of spans) {
    const textNode = getFirstTextNode(span);
    if (!textNode) continue;

    const s = textNode.textContent ?? "";
    if (!/\S/.test(s)) continue;

    const re = /\S+/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const word = m[0];
      const startOffset = m.index;
      const endOffset = startOffset + word.length;

      segments.push({
        index,
        word,
        spanEl: span,
        textNode,
        startOffset,
        endOffset
      });
      index++;
    }
  }
  return segments;
}

function rectForSegment(seg) {
  // Prefer a precise range rect
  try {
    const range = document.createRange();
    range.setStart(seg.textNode, seg.startOffset);
    range.setEnd(seg.textNode, seg.endOffset);
    const r = range.getBoundingClientRect();
    if (typeof range.detach === "function") range.detach();

    // Sometimes rect can be 0x0 due to layout timing; fallback to span rect
    if (!r || (r.width === 0 && r.height === 0)) {
      return seg.spanEl.getBoundingClientRect();
    }
    return r;
  } catch {
    return seg.spanEl.getBoundingClientRect();
  }
}

export default function PdfTeacher() {
  const [pdfUrl, setPdfUrl] = useState("/sample.pdf");
  const [numPages, setNumPages] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.25);

  // speech controls
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [voiceURI, setVoiceURI] = useState("");

  // NEW: auto-advance toggles
  const [autoPageTurn, setAutoPageTurn] = useState(true);
  const [autoContinue, setAutoContinue] = useState(false);

  const [status, setStatus] = useState("idle"); // idle | speaking | paused
  const utterRef = useRef(null);

  // mapping
  const pageWrapRef = useRef(null);
  const scrollAreaRef = useRef(null);

  const [segments, setSegments] = useState([]);
  const [wordStarts, setWordStarts] = useState([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);

  // overlay target + highlight
  const [target, setTarget] = useState(null);
  const [highlightRect, setHighlightRect] = useState(null);

  // auto-continue handshake (wait until next page words exist)
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);

  // Refs to avoid stale closure inside utter.onend
  const pageRef = useRef(page);
  const numPagesRef = useRef(numPages);
  const autoPageTurnRef = useRef(autoPageTurn);
  const autoContinueRef = useRef(autoContinue);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);

  useEffect(() => {
    autoPageTurnRef.current = autoPageTurn;
  }, [autoPageTurn]);

  useEffect(() => {
    autoContinueRef.current = autoContinue;
  }, [autoContinue]);

  const voices = useMemo(() => {
    if (typeof window === "undefined") return [];
    return window.speechSynthesis?.getVoices?.() ?? [];
  }, []);

  // Some browsers load voices async; update on voiceschanged
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const handler = () => forceRerender((x) => x + 1);
    synth.addEventListener?.("voiceschanged", handler);
    return () => synth.removeEventListener?.("voiceschanged", handler);
  }, []);

  const selectedVoice = useMemo(() => {
    if (!voices.length) return null;
    if (!voiceURI) return voices[0] ?? null;
    return voices.find((v) => v.voiceURI === voiceURI) ?? voices[0] ?? null;
  }, [voices, voiceURI]);

  const utteranceText = useMemo(() => {
    // join words with spaces so charIndex mapping is deterministic
    return segments.map((s) => s.word).join(" ");
  }, [segments]);

  // recompute word start indices for boundary mapping
  useEffect(() => {
    const starts = [];
    let pos = 0;
    for (const seg of segments) {
      starts.push(pos);
      pos += seg.word.length + 1; // + space
    }
    setWordStarts(starts);
  }, [segments]);

  const cancelSpeech = useCallback(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setStatus("idle");
    setCurrentWordIndex(-1);
  }, []);

  // Cancel on page/pdf change (and clear overlays)
  useEffect(() => {
    cancelSpeech();
    setTarget(null);
    setHighlightRect(null);
    setPendingAutoSpeak(false);
  }, [page, pdfUrl, cancelSpeech]);

  const updateTargetAndHighlightForIndex = useCallback(
    (idx) => {
      if (idx < 0 || idx >= segments.length) return;
      const seg = segments[idx];

      const r = rectForSegment(seg);
      if (!r || (r.width === 0 && r.height === 0)) return;

      // pointer aims at center of the word rect
      setTarget({
        x: r.left + r.width / 2,
        y: r.top + r.height / 2
      });

      // highlight draws over the rect (with small padding)
      const pad = 2;
      setHighlightRect({
        left: r.left - pad,
        top: r.top - pad,
        width: clamp(r.width + pad * 2, 6, 2000),
        height: clamp(r.height + pad * 2, 10, 2000)
      });
    },
    [segments]
  );

  // Keep pointer + highlight stable on scroll/resize (window + pdf scroll container)
  useEffect(() => {
    if (currentWordIndex < 0) return;

    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        updateTargetAndHighlightForIndex(currentWordIndex)
      );
    };

    const scrollEl = scrollAreaRef.current;

    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    scrollEl?.addEventListener("scroll", recompute, { passive: true });

    return () => {
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
      scrollEl?.removeEventListener("scroll", recompute);
      cancelAnimationFrame(raf);
    };
  }, [currentWordIndex, updateTargetAndHighlightForIndex]);

  const startSpeech = useCallback(() => {
    if (!window.speechSynthesis) return;
    if (!utteranceText.trim() || segments.length === 0) return;

    // Reset
    window.speechSynthesis.cancel();
    setStatus("speaking");

    const utter = new SpeechSynthesisUtterance(utteranceText);
    utter.rate = rate;
    utter.pitch = pitch;

    if (selectedVoice) utter.voice = selectedVoice;

    utter.onboundary = (e) => {
      if (typeof e.charIndex !== "number") return;
      if (!wordStarts.length) return;

      const idx = binarySearchWordIndex(wordStarts, e.charIndex);
      setCurrentWordIndex(idx);
      updateTargetAndHighlightForIndex(idx);
    };

    utter.onend = () => {
      setStatus("idle");
      setCurrentWordIndex(-1);

      // AUTO PAGE TURN
      const ap = autoPageTurnRef.current;
      const ac = autoContinueRef.current;
      const n = numPagesRef.current;
      const p = pageRef.current;

      if (ap && n && p < n) {
        setPage((prev) => prev + 1);
        setTarget(null);
        setHighlightRect(null);

        if (ac) {
          // wait until next page text layer is ready, then auto-speak
          setPendingAutoSpeak(true);
        } else {
          setPendingAutoSpeak(false);
        }
      }
    };

    utter.onerror = () => {
      setStatus("idle");
      setCurrentWordIndex(-1);
      setPendingAutoSpeak(false);
    };

    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, [
    utteranceText,
    segments.length,
    rate,
    pitch,
    selectedVoice,
    wordStarts,
    updateTargetAndHighlightForIndex
  ]);

  // If we turned the page and autoContinue is enabled:
  // when segments become available again, start speech.
  useEffect(() => {
    if (!pendingAutoSpeak) return;
    if (status !== "idle") return;
    if (segments.length === 0) return;

    // start speaking next page
    setPendingAutoSpeak(false);
    startSpeech();
  }, [pendingAutoSpeak, status, segments.length, startSpeech]);

  const pauseSpeech = useCallback(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const resumeSpeech = useCallback(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setStatus("speaking");
  }, []);

  const onLoadSuccess = useCallback(({ numPages: n }) => {
    setNumPages(n);
    setPage((p) => Math.min(Math.max(1, p), n));
  }, []);

  const onRenderTextLayerSuccess = useCallback(() => {
    const wrap = pageWrapRef.current;
    if (!wrap) return;

    const textLayer = wrap.querySelector(".react-pdf__Page__textContent");
    if (!textLayer) return;

    const segs = extractWordSegments(textLayer);
    setSegments(segs);
  }, []);

  const onPickFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setPdfUrl(url);
    setPage(1);
  }, []);

  const canPrev = page > 1;
  const canNext = numPages != null && page < numPages;
      const isPlaying = status === "speaking";           // ✅ stick only when speaking
const isAvatarVisible = status === "speaking" || status === "paused";
  const speakDisabled = segments.length === 0 || !utteranceText.trim();

  return (
    <div className="relative">
      {/* highlight should be above pdf and below/around avatar; it's fixed */}
      <WordHighlightOverlay
        rect={highlightRect}
        active={status === "speaking" || status === "paused"}
      />


<AvatarPointer
  target={target}
  active={isAvatarVisible}
  paused={status === "paused"}
  showStick={isPlaying}   // ✅ NEW
  bubbleText={currentWordIndex >= 0 ? segments[currentWordIndex]?.word : ""}
/>

{/* 
      <AvatarPointer
        target={target}
        active={status === "speaking" || status === "paused"}
        label="Virtual teacher avatar pointing to the spoken word"
        bubbleText={currentWordIndex >= 0 ? segments[currentWordIndex]?.word : ""}
      /> */}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Controls */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow">
          <h2 className="text-base font-semibold">Controls</h2>

          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm text-slate-300" htmlFor="pdfFile">
                Load PDF
              </label>
              <input
                id="pdfFile"
                type="file"
                accept="application/pdf"
                onChange={onPickFile}
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/30 p-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Or place a PDF at <code>public/sample.pdf</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev}
                aria-label="Previous page"
              >
                Prev
              </button>
              <button
                className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
                onClick={() =>
                  setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))
                }
                disabled={!canNext}
                aria-label="Next page"
              >
                Next
              </button>

              <div className="ml-auto text-sm text-slate-300">
                Page <span className="font-semibold">{page}</span>
                {numPages ? <span className="text-slate-500"> / {numPages}</span> : null}
              </div>
            </div>

            {/* NEW: auto-advance toggles */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <div className="flex items-start gap-3">
                <input
                  id="autoTurn"
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={autoPageTurn}
                  onChange={(e) => setAutoPageTurn(e.target.checked)}
                />
                <div>
                  <label htmlFor="autoTurn" className="text-sm font-medium">
                    Auto page-turn
                  </label>
                  <p className="text-xs text-slate-400">
                    When the page finishes reading, move to the next page.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-3">
                <input
                  id="autoContinue"
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={autoContinue}
                  onChange={(e) => setAutoContinue(e.target.checked)}
                  disabled={!autoPageTurn}
                />
                <div>
                  <label htmlFor="autoContinue" className="text-sm font-medium">
                    Auto continue reading
                  </label>
                  <p className="text-xs text-slate-400">
                    After turning the page, automatically start speaking the next page.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300" htmlFor="scale">
                Zoom ({scale.toFixed(2)}×)
              </label>
              <input
                id="scale"
                type="range"
                min="0.75"
                max="2.0"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-300" htmlFor="voice">
                Voice
              </label>
              <select
                id="voice"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/30 p-2 text-sm"
                value={voiceURI}
                onChange={(e) => setVoiceURI(e.target.value)}
              >
                <option value="">Default</option>
                {(window.speechSynthesis?.getVoices?.() ?? []).map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-300" htmlFor="rate">
                  Rate ({rate.toFixed(2)})
                </label>
                <input
                  id="rate"
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.05"
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300" htmlFor="pitch">
                  Pitch ({pitch.toFixed(2)})
                </label>
                <input
                  id="pitch"
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.05"
                  value={pitch}
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:opacity-90 disabled:opacity-50"
                onClick={startSpeech}
                disabled={speakDisabled || status === "speaking"}
                aria-label="Start reading the current page"
              >
                Speak
              </button>

              <button
                className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
                onClick={pauseSpeech}
                disabled={status !== "speaking"}
                aria-label="Pause reading"
              >
                Pause
              </button>

              <button
                className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
                onClick={resumeSpeech}
                disabled={status !== "paused"}
                aria-label="Resume reading"
              >
                Resume
              </button>

              <button
                className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-950/60"
                onClick={cancelSpeech}
                aria-label="Stop reading"
              >
                Stop
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="font-semibold">{status}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Words detected</span>
                <span className="font-semibold">{segments.length}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>Current word</span>
                <span className="font-semibold">
                  {currentWordIndex >= 0 ? segments[currentWordIndex]?.word : "—"}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              If the pointer/highlight doesn’t move: your browser may not emit{" "}
              <code>onboundary</code> word events. Try Chrome/Edge.
            </div>
          </div>
        </section>

        {/* PDF stage */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow">
          <h2 className="text-base font-semibold">PDF</h2>

          <div
            ref={scrollAreaRef}
            className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-slate-950/30 p-3"
          >
            <div ref={pageWrapRef} className="flex justify-center">
              <Document
                file={pdfUrl}
                onLoadSuccess={onLoadSuccess}
                loading={<div className="p-6 text-sm text-slate-300">Loading PDF…</div>}
                error={<div className="p-6 text-sm text-red-300">Failed to load PDF.</div>}
              >
                <Page
                  pageNumber={page}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={false}
                  onRenderTextLayerSuccess={onRenderTextLayerSuccess}
                />
              </Document>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Word highlight uses a DOM <code>Range</code> over the exact span substring and
            draws a fixed overlay rect in viewport coordinates.
          </div>
        </section>
      </div>
    </div>
  );
}


// import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// import { Document, Page, pdfjs } from "react-pdf";
// import AvatarPointer from "./AvatarPointer.jsx";

// // IMPORTANT for Vite: set pdf.js worker
// pdfjs.GlobalWorkerOptions.workerSrc = new URL(
//   "pdfjs-dist/build/pdf.worker.min.mjs",
//   import.meta.url
// ).toString();

// function binarySearchWordIndex(starts, charIndex) {
//   // returns greatest i where starts[i] <= charIndex
//   let lo = 0, hi = starts.length - 1, ans = 0;
//   while (lo <= hi) {
//     const mid = (lo + hi) >> 1;
//     if (starts[mid] <= charIndex) {
//       ans = mid;
//       lo = mid + 1;
//     } else {
//       hi = mid - 1;
//     }
//   }
//   return ans;
// }

// function getFirstTextNode(el) {
//   for (const n of el.childNodes) {
//     if (n.nodeType === Node.TEXT_NODE) return n;
//   }
//   return null;
// }

// /**
//  * Build a word-level map from react-pdf TextLayer spans:
//  * each word knows: { index, word, spanEl, textNode, startOffset, endOffset }
//  */
// function extractWordSegments(textLayerEl) {
//   const segments = [];
//   const spans = Array.from(textLayerEl.querySelectorAll("span"));

//   let index = 0;
//   for (const span of spans) {
//     const textNode = getFirstTextNode(span);
//     if (!textNode) continue;

//     const s = textNode.textContent ?? "";
//     if (!/\S/.test(s)) continue;

//     // match non-whitespace chunks as "words" (includes punctuation attached)
//     const re = /\S+/g;
//     let m;
//     while ((m = re.exec(s)) !== null) {
//       const word = m[0];
//       const startOffset = m.index;
//       const endOffset = startOffset + word.length;

//       segments.push({
//         index,
//         word,
//         spanEl: span,
//         textNode,
//         startOffset,
//         endOffset
//       });
//       index++;
//     }
//   }
//   return segments;
// }

// function rectForSegment(seg) {
//   const range = document.createRange();
//   range.setStart(seg.textNode, seg.startOffset);
//   range.setEnd(seg.textNode, seg.endOffset);
//   const rect = range.getBoundingClientRect();
//   // range.detach() is deprecated, but harmless if exists
//   if (typeof range.detach === "function") range.detach();
//   return rect;
// }

// export default function PdfTeacher() {
//   const [pdfUrl, setPdfUrl] = useState("/sample.pdf");
//   const [numPages, setNumPages] = useState(null);
//   const [page, setPage] = useState(1);
//   const [scale, setScale] = useState(1.25);

//   // speech controls
//   const [rate, setRate] = useState(1.0);
//   const [pitch, setPitch] = useState(1.0);
//   const [voiceURI, setVoiceURI] = useState("");

//   const [status, setStatus] = useState("idle"); // idle | speaking | paused
//   const utterRef = useRef(null);

//   // mapping
//   const pageWrapRef = useRef(null);
//   const [segments, setSegments] = useState([]);
//   const [wordStarts, setWordStarts] = useState([]);
//   const [currentWordIndex, setCurrentWordIndex] = useState(-1);

//   // avatar target
//   const [target, setTarget] = useState(null);

//   const voices = useMemo(() => {
//     if (typeof window === "undefined") return [];
//     return window.speechSynthesis?.getVoices?.() ?? [];
//   }, []);

//   // Some browsers load voices async; update on voiceschanged
//   const [, forceRerender] = useState(0);
//   useEffect(() => {
//     const synth = window.speechSynthesis;
//     if (!synth) return;
//     const handler = () => forceRerender((x) => x + 1);
//     synth.addEventListener?.("voiceschanged", handler);
//     return () => synth.removeEventListener?.("voiceschanged", handler);
//   }, []);

//   const selectedVoice = useMemo(() => {
//     if (!voices.length) return null;
//     if (!voiceURI) return voices[0] ?? null;
//     return voices.find((v) => v.voiceURI === voiceURI) ?? voices[0] ?? null;
//   }, [voices, voiceURI]);

//   const utteranceText = useMemo(() => {
//     // join words with single spaces to make charIndex math deterministic
//     return segments.map((s) => s.word).join(" ");
//   }, [segments]);

//   // recompute word start indices for boundary mapping
//   useEffect(() => {
//     const starts = [];
//     let pos = 0;
//     for (const seg of segments) {
//       starts.push(pos);
//       pos += seg.word.length + 1; // + space
//     }
//     setWordStarts(starts);
//   }, [segments]);

//   const cancelSpeech = useCallback(() => {
//     if (!window.speechSynthesis) return;
//     window.speechSynthesis.cancel();
//     utterRef.current = null;
//     setStatus("idle");
//     setCurrentWordIndex(-1);
//   }, []);

//   // Cancel on page/pdf change
//   useEffect(() => {
//     cancelSpeech();
//     setTarget(null);
//   }, [page, pdfUrl, cancelSpeech]);

//   const updateTargetForIndex = useCallback(
//     (idx) => {
//       if (idx < 0 || idx >= segments.length) return;
//       const seg = segments[idx];

//       const r = rectForSegment(seg);
//       if (!r || r.width === 0 || r.height === 0) return;

//       setTarget({
//         x: r.left + r.width / 2,
//         y: r.top + r.height / 2
//       });
//     },
//     [segments]
//   );

//   // Keep pointer stable on scroll/resize (recompute from last spoken word)
//   useEffect(() => {
//     if (currentWordIndex < 0) return;

//     let raf = 0;
//     const onMove = () => {
//       cancelAnimationFrame(raf);
//       raf = requestAnimationFrame(() => updateTargetForIndex(currentWordIndex));
//     };

//     window.addEventListener("scroll", onMove, { passive: true });
//     window.addEventListener("resize", onMove);
//     return () => {
//       window.removeEventListener("scroll", onMove);
//       window.removeEventListener("resize", onMove);
//       cancelAnimationFrame(raf);
//     };
//   }, [currentWordIndex, updateTargetForIndex]);

//   const startSpeech = useCallback(() => {
//     if (!window.speechSynthesis) return;
//     if (!utteranceText.trim() || segments.length === 0) return;

//     // Reset
//     window.speechSynthesis.cancel();
//     setStatus("speaking");

//     const utter = new SpeechSynthesisUtterance(utteranceText);
//     utter.rate = rate;
//     utter.pitch = pitch;

//     if (selectedVoice) utter.voice = selectedVoice;

//     utter.onboundary = (e) => {
//       // Most useful: word boundaries (Chrome/Edge)
//       // e.charIndex is the index in utteranceText
//       if (typeof e.charIndex !== "number") return;
//       if (!wordStarts.length) return;

//       const idx = binarySearchWordIndex(wordStarts, e.charIndex);
//       setCurrentWordIndex(idx);
//       updateTargetForIndex(idx);
//     };

//     utter.onend = () => {
//       setStatus("idle");
//       setCurrentWordIndex(-1);
//     };

//     utter.onerror = () => {
//       setStatus("idle");
//       setCurrentWordIndex(-1);
//     };

//     utterRef.current = utter;
//     window.speechSynthesis.speak(utter);
//   }, [utteranceText, segments.length, rate, pitch, selectedVoice, wordStarts, updateTargetForIndex]);

//   const pauseSpeech = useCallback(() => {
//     if (!window.speechSynthesis) return;
//     window.speechSynthesis.pause();
//     setStatus("paused");
//   }, []);

//   const resumeSpeech = useCallback(() => {
//     if (!window.speechSynthesis) return;
//     window.speechSynthesis.resume();
//     setStatus("speaking");
//   }, []);

//   const onLoadSuccess = useCallback(({ numPages: n }) => {
//     setNumPages(n);
//     setPage((p) => Math.min(Math.max(1, p), n));
//   }, []);

//   const onRenderTextLayerSuccess = useCallback(() => {
//     // Find the latest text layer inside this page wrapper
//     const wrap = pageWrapRef.current;
//     if (!wrap) return;

//     const textLayer = wrap.querySelector(".react-pdf__Page__textContent");
//     if (!textLayer) return;

//     const segs = extractWordSegments(textLayer);
//     setSegments(segs);
//   }, []);

//   const onPickFile = useCallback((e) => {
//     const f = e.target.files?.[0];
//     if (!f) return;
//     const url = URL.createObjectURL(f);
//     setPdfUrl(url);
//     setPage(1);
//   }, []);

//   const canPrev = page > 1;
//   const canNext = numPages != null && page < numPages;

//   const speakDisabled = segments.length === 0 || !utteranceText.trim();

//   return (
//     <div className="relative">
//       <AvatarPointer
//         target={target}
//         active={status === "speaking" || status === "paused"}
//         label="Virtual teacher avatar pointing to the spoken word"
//       />

//       <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
//         {/* Controls */}
//         <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow">
//           <h2 className="text-base font-semibold">Controls</h2>

//           <div className="mt-3 space-y-3">
//             <div>
//               <label className="block text-sm text-slate-300" htmlFor="pdfFile">
//                 Load PDF
//               </label>
//               <input
//                 id="pdfFile"
//                 type="file"
//                 accept="application/pdf"
//                 onChange={onPickFile}
//                 className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950/30 p-2 text-sm"
//               />
//               <p className="mt-1 text-xs text-slate-500">
//                 Or place a PDF at <code>public/sample.pdf</code>.
//               </p>
//             </div>

//             <div className="flex items-center gap-2">
//               <button
//                 className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
//                 onClick={() => setPage((p) => Math.max(1, p - 1))}
//                 disabled={!canPrev}
//                 aria-label="Previous page"
//               >
//                 Prev
//               </button>
//               <button
//                 className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
//                 onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
//                 disabled={!canNext}
//                 aria-label="Next page"
//               >
//                 Next
//               </button>

//               <div className="ml-auto text-sm text-slate-300">
//                 Page <span className="font-semibold">{page}</span>
//                 {numPages ? <span className="text-slate-500"> / {numPages}</span> : null}
//               </div>
//             </div>

//             <div>
//               <label className="block text-sm text-slate-300" htmlFor="scale">
//                 Zoom ({scale.toFixed(2)}×)
//               </label>
//               <input
//                 id="scale"
//                 type="range"
//                 min="0.75"
//                 max="2.0"
//                 step="0.05"
//                 value={scale}
//                 onChange={(e) => setScale(parseFloat(e.target.value))}
//                 className="mt-1 w-full"
//               />
//             </div>

//             <div>
//               <label className="block text-sm text-slate-300" htmlFor="voice">
//                 Voice
//               </label>
//               <select
//                 id="voice"
//                 className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/30 p-2 text-sm"
//                 value={voiceURI}
//                 onChange={(e) => setVoiceURI(e.target.value)}
//               >
//                 <option value="">Default</option>
//                 {(window.speechSynthesis?.getVoices?.() ?? []).map((v) => (
//                   <option key={v.voiceURI} value={v.voiceURI}>
//                     {v.name} ({v.lang})
//                   </option>
//                 ))}
//               </select>
//             </div>

//             <div className="grid grid-cols-2 gap-3">
//               <div>
//                 <label className="block text-sm text-slate-300" htmlFor="rate">
//                   Rate ({rate.toFixed(2)})
//                 </label>
//                 <input
//                   id="rate"
//                   type="range"
//                   min="0.6"
//                   max="1.4"
//                   step="0.05"
//                   value={rate}
//                   onChange={(e) => setRate(parseFloat(e.target.value))}
//                   className="mt-1 w-full"
//                 />
//               </div>
//               <div>
//                 <label className="block text-sm text-slate-300" htmlFor="pitch">
//                   Pitch ({pitch.toFixed(2)})
//                 </label>
//                 <input
//                   id="pitch"
//                   type="range"
//                   min="0.6"
//                   max="1.4"
//                   step="0.05"
//                   value={pitch}
//                   onChange={(e) => setPitch(parseFloat(e.target.value))}
//                   className="mt-1 w-full"
//                 />
//               </div>
//             </div>

//             <div className="flex flex-wrap gap-2 pt-2">
//               <button
//                 className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:opacity-90 disabled:opacity-50"
//                 onClick={startSpeech}
//                 disabled={speakDisabled || status === "speaking"}
//                 aria-label="Start reading the current page"
//               >
//                 Speak
//               </button>

//               <button
//                 className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
//                 onClick={pauseSpeech}
//                 disabled={status !== "speaking"}
//                 aria-label="Pause reading"
//               >
//                 Pause
//               </button>

//               <button
//                 className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-950/60 disabled:opacity-50"
//                 onClick={resumeSpeech}
//                 disabled={status !== "paused"}
//                 aria-label="Resume reading"
//               >
//                 Resume
//               </button>

//               <button
//                 className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm hover:bg-slate-950/60"
//                 onClick={cancelSpeech}
//                 aria-label="Stop reading"
//               >
//                 Stop
//               </button>
//             </div>

//             <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-xs text-slate-300">
//               <div className="flex items-center justify-between">
//                 <span>Status</span>
//                 <span className="font-semibold">{status}</span>
//               </div>
//               <div className="mt-1 flex items-center justify-between">
//                 <span>Words detected</span>
//                 <span className="font-semibold">{segments.length}</span>
//               </div>
//               <div className="mt-1 flex items-center justify-between">
//                 <span>Current word</span>
//                 <span className="font-semibold">
//                   {currentWordIndex >= 0 ? segments[currentWordIndex]?.word : "—"}
//                 </span>
//               </div>
//             </div>

//             <div className="text-xs text-slate-500">
//               If the pointer doesn’t move: your browser may not emit <code>onboundary</code> word events.
//               Try Chrome/Edge and ensure the system voice engine is enabled.
//             </div>
//           </div>
//         </section>

//         {/* PDF stage */}
//         <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow">
//           <h2 className="text-base font-semibold">PDF</h2>

//           <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-slate-950/30 p-3">
//             <div ref={pageWrapRef} className="flex justify-center">
//               <Document
//                 file={pdfUrl}
//                 onLoadSuccess={onLoadSuccess}
//                 loading={<div className="p-6 text-sm text-slate-300">Loading PDF…</div>}
//                 error={<div className="p-6 text-sm text-red-300">Failed to load PDF.</div>}
//               >
//                 <Page
//                   pageNumber={page}
//                   scale={scale}
//                   renderTextLayer={true}
//                   renderAnnotationLayer={false}
//                   onRenderTextLayerSuccess={onRenderTextLayerSuccess}
//                 />
//               </Document>
//             </div>
//           </div>

//           <div className="mt-3 text-xs text-slate-500">
//             Text layer is enabled; words are extracted from the DOM spans in{" "}
//             <code>.react-pdf__Page__textContent</code>.
//           </div>
//         </section>
//       </div>
//     </div>
//   );
// }
