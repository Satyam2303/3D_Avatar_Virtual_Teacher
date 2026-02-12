import React from "react";
import PdfTeacher from "./components/PdfTeacher.jsx";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <h1 className="text-xl font-semibold tracking-tight">Virtual Teacher</h1>
          <p className="mt-1 text-sm text-slate-300">
            PDF text-layer → TTS boundary sync → avatar stick points at the spoken word.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <PdfTeacher />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        Tip: Chrome/Edge work best for <code>speechSynthesis.onboundary</code>.
      </footer>
    </div>
  );
}
