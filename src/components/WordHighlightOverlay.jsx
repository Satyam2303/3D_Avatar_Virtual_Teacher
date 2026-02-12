import React from "react";

/**
 * Fixed overlay highlight in viewport coordinates.
 * rect: { left, top, width, height } in viewport px
 */
export default function WordHighlightOverlay({ rect, active = false }) {
  if (!active || !rect) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      <div
        className="absolute rounded-md border border-white/60 bg-white/20 shadow-sm animate-pulse"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }}
      />
    </div>
  );
}
