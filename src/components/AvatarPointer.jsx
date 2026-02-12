import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * 3D-ish Dark Avatar Pointer
 * Requirement change:
 * - Stick is ONLY shown when audio is actively playing (showStick=true).
 * - Stick is hidden when paused or stopped (showStick=false).
 */
export default function AvatarPointer({
  target, // {x,y} in viewport coordinates
  active = false, // avatar visible state (e.g., speaking or paused)
  paused = false,
  showStick = false, // ✅ NEW: stick visible only when speaking
  bubbleText = "",
  scale = 1.9,
  label = "Virtual teacher pointer"
}) {
  const avatarRef = useRef(null);

  // Stick origin inside the avatar container (in SVG px coords)
  const anchor = useMemo(() => ({ x: 160, y: 160 }), []);

  const [pose, setPose] = useState({ angleDeg: 0, length: 160 });
  const [mouthOpen, setMouthOpen] = useState(false);
  const [blink, setBlink] = useState(false);

  // Speaking mouth toggle
  useEffect(() => {
    if (!active || paused) {
      setMouthOpen(false);
      return;
    }
    const id = setInterval(() => setMouthOpen((m) => !m), 220);
    return () => clearInterval(id);
  }, [active, paused]);

  // Random blink
  useEffect(() => {
    let t;
    const schedule = () => {
      const delay = 1500 + Math.random() * 2500;
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 120);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(t);
  }, []);

  // Compute stick angle/length ONLY when stick is visible (speaking)
  useEffect(() => {
    if (!showStick || !target?.x || !target?.y || !avatarRef.current) return;

    const box = avatarRef.current.getBoundingClientRect();
    const baseX = box.left + anchor.x * scale;
    const baseY = box.top + anchor.y * scale;

    const dx = target.x - baseX;
    const dy = target.y - baseY;

    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const length = clamp(Math.hypot(dx, dy), 100, 1600);

    setPose({ angleDeg, length });
  }, [showStick, target?.x, target?.y, anchor.x, anchor.y, scale]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" role="img" aria-label={label}>
      {/* Target marker (ONLY while playing) */}
      {showStick && target?.x != null && target?.y != null && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: target.x, top: target.y }}
          aria-hidden="true"
        >
          <div className="h-3.5 w-3.5 rounded-full bg-cyan-300/90 border border-cyan-100/70 shadow-[0_0_22px_rgba(34,211,238,0.55)]" />
        </div>
      )}

      {/* Avatar */}
      <div
        ref={avatarRef}
        className={`absolute left-8 bottom-8 select-none ${
          active && !paused ? "animate-[vt3dFloat_3.2s_ease-in-out_infinite]" : ""
        }`}
        aria-hidden="true"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "left bottom"
        }}
      >
        <div className="relative">
          {/* Glass speech bubble (optional) */}
          {(active || paused) && bubbleText?.trim() && (
            <div className="absolute -top-14 left-16 max-w-[260px] rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-3 py-2 text-xs text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              <div className="text-[11px] text-cyan-200/90 font-semibold">
                {paused ? "Paused" : "Teaching"}
              </div>
              <div className="mt-0.5 text-slate-100/90 line-clamp-2">{bubbleText}</div>
              <div className="absolute -bottom-2 left-7 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-white/5" />
            </div>
          )}

          {/* Stick (ONLY while playing) */}
          {showStick && (
            <div
              className="absolute"
              style={{
                left: anchor.x,
                top: anchor.y,
                transformOrigin: "0% 50%",
                transform: `rotate(${pose.angleDeg}deg)`,
                transition: "transform 140ms linear"
              }}
            >
              <div
                className="h-[7px] rounded-full"
                style={{
                  width: `${pose.length}px`,
                  transition: "width 140ms linear",
                  background:
                    "linear-gradient(90deg, rgba(34,211,238,0.95), rgba(125,211,252,0.95))",
                  boxShadow: "0 0 16px rgba(34,211,238,0.35)"
                }}
              />
              <div
                className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full"
                style={{
                  background: "radial-gradient(circle at 30% 30%, #fff, rgba(251,113,133,0.95))",
                  boxShadow: "0 0 16px rgba(251,113,133,0.35)",
                  border: "1px solid rgba(255,255,255,0.35)"
                }}
              />
            </div>
          )}

          {/* Avatar SVG */}
          <svg width="320" height="240" viewBox="0 0 320 240" className="drop-shadow-[0_18px_36px_rgba(0,0,0,0.55)]">
            <defs>
              <radialGradient id="skin3d" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="40%" stopColor="rgba(226,232,240,0.95)" />
                <stop offset="100%" stopColor="rgba(148,163,184,0.90)" />
              </radialGradient>

              <radialGradient id="body3d" cx="30%" cy="20%" r="90%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
                <stop offset="40%" stopColor="rgba(148,163,184,0.35)" />
                <stop offset="100%" stopColor="rgba(30,41,59,0.55)" />
              </radialGradient>

              <linearGradient id="board3d" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(15,23,42,0.95)" />
                <stop offset="100%" stopColor="rgba(2,6,23,0.95)" />
              </linearGradient>

              <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>

            {/* board */}
            <g>
              <rect x="14" y="18" width="120" height="82" rx="16" fill="url(#board3d)" stroke="rgba(148,163,184,0.35)" />
              <path d="M30 52 H116" stroke="rgba(226,232,240,0.30)" strokeWidth="5" />
              <path d="M30 72 H100" stroke="rgba(226,232,240,0.22)" strokeWidth="5" />
              <path d="M18 26 C48 18, 92 18, 128 30 L128 40 C92 28, 48 28, 18 38 Z" fill="url(#shine)" />
            </g>

            {/* head */}
            <g>
              <circle cx="214" cy="80" r="38" fill="url(#skin3d)" />
              <ellipse cx="202" cy="68" rx="16" ry="12" fill="rgba(255,255,255,0.18)" />

              {/* eyes */}
              {!blink ? (
                <>
                  <circle cx="200" cy="78" r="5" fill="rgba(15,23,42,0.82)" />
                  <circle cx="228" cy="78" r="5" fill="rgba(15,23,42,0.82)" />
                  <circle cx="198" cy="76" r="2" fill="rgba(255,255,255,0.7)" />
                  <circle cx="226" cy="76" r="2" fill="rgba(255,255,255,0.7)" />
                </>
              ) : (
                <>
                  <path d="M192 78 Q200 82 208 78" stroke="rgba(15,23,42,0.8)" strokeWidth="4" strokeLinecap="round" fill="none" />
                  <path d="M220 78 Q228 82 236 78" stroke="rgba(15,23,42,0.8)" strokeWidth="4" strokeLinecap="round" fill="none" />
                </>
              )}

              {/* mouth */}
              {!active || paused ? (
                <path d="M196 98 Q214 112 232 98" fill="none" stroke="rgba(15,23,42,0.6)" strokeWidth="5" strokeLinecap="round" />
              ) : mouthOpen ? (
                <ellipse cx="214" cy="104" rx="10" ry="7" fill="rgba(15,23,42,0.55)" />
              ) : (
                <path d="M196 102 Q214 116 232 102" fill="none" stroke="rgba(15,23,42,0.6)" strokeWidth="5" strokeLinecap="round" />
              )}
            </g>

            {/* body */}
            <g>
              <rect x="172" y="124" width="86" height="74" rx="26" fill="url(#body3d)" stroke="rgba(226,232,240,0.18)" />
              <path d="M182 132 C198 122, 232 122, 252 136 C234 136, 204 140, 182 148 Z" fill="rgba(255,255,255,0.10)" />
            </g>

            {/* arm + hand */}
            <path
              d="M198 152 C178 146, 168 146, 160 160"
              fill="none"
              stroke="rgba(226,232,240,0.78)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx={anchor.x} cy={anchor.y} r="10" fill="rgba(226,232,240,0.92)" />
            <circle cx={anchor.x - 3} cy={anchor.y - 3} r="4" fill="rgba(255,255,255,0.25)" />

            {/* legs */}
            <path d="M200 198 v22" stroke="rgba(226,232,240,0.55)" strokeWidth="12" strokeLinecap="round" />
            <path d="M232 198 v22" stroke="rgba(226,232,240,0.55)" strokeWidth="12" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}



// import React, { useEffect, useMemo, useRef, useState } from "react";

// function clamp(n, a, b) {
//   return Math.max(a, Math.min(b, n));
// }

// /**
//  * 3D-ish Dark Avatar Pointer
//  * - Big by default (scale=1.9)
//  * - Neon pointer (cyan glow)
//  * - Floating + blinking + mouth animation while speaking
//  * - Optional speech bubble
//  */
// export default function AvatarPointer({
//   target, // {x,y} in viewport coordinates
//   active = false,
//   paused = false,
//   bubbleText = "",
//   scale = 1.9,
//   label = "Virtual teacher pointer"
// }) {
//   const avatarRef = useRef(null);

//   // Stick origin inside the avatar container (in SVG px coords)
//   const anchor = useMemo(() => ({ x: 160, y: 160 }), []);

//   const [pose, setPose] = useState({ angleDeg: 0, length: 160 });
//   const [mouthOpen, setMouthOpen] = useState(false);
//   const [blink, setBlink] = useState(false);

//   // Speaking mouth toggle
//   useEffect(() => {
//     if (!active || paused) {
//       setMouthOpen(false);
//       return;
//     }
//     const id = setInterval(() => setMouthOpen((m) => !m), 220);
//     return () => clearInterval(id);
//   }, [active, paused]);

//   // Random blink
//   useEffect(() => {
//     let t;
//     const schedule = () => {
//       const delay = 1500 + Math.random() * 2500;
//       t = setTimeout(() => {
//         setBlink(true);
//         setTimeout(() => setBlink(false), 120);
//         schedule();
//       }, delay);
//     };
//     schedule();
//     return () => clearTimeout(t);
//   }, []);

//   // Compute stick angle/length
//   useEffect(() => {
//     if (!active || !target?.x || !target?.y || !avatarRef.current) return;

//     const box = avatarRef.current.getBoundingClientRect();

//     // because we scale the container with CSS transform
//     const baseX = box.left + anchor.x * scale;
//     const baseY = box.top + anchor.y * scale;

//     const dx = target.x - baseX;
//     const dy = target.y - baseY;

//     const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
//     const length = clamp(Math.hypot(dx, dy), 100, 1600);

//     setPose({ angleDeg, length });
//   }, [active, target?.x, target?.y, anchor.x, anchor.y, scale]);

//   return (
//     <div className="fixed inset-0 z-50 pointer-events-none" role="img" aria-label={label}>
//       {/* Target marker (neon) */}
//       {active && target?.x != null && target?.y != null && (
//         <div
//           className="absolute -translate-x-1/2 -translate-y-1/2"
//           style={{ left: target.x, top: target.y }}
//           aria-hidden="true"
//         >
//           <div className="h-3.5 w-3.5 rounded-full bg-cyan-300/90 border border-cyan-100/70 shadow-[0_0_22px_rgba(34,211,238,0.55)]" />
//         </div>
//       )}

//       {/* Avatar */}
//       <div
//         ref={avatarRef}
//         className={`absolute left-8 bottom-8 select-none ${
//           active && !paused ? "animate-[vt3dFloat_3.2s_ease-in-out_infinite]" : ""
//         }`}
//         aria-hidden="true"
//         style={{
//           transform: `scale(${scale})`,
//           transformOrigin: "left bottom"
//         }}
//       >
//         <div className="relative">
//           {/* Glass speech bubble */}
//           {(active || paused) && bubbleText?.trim() && (
//             <div className="absolute -top-14 left-16 max-w-[260px] rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-3 py-2 text-xs text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
//               <div className="text-[11px] text-cyan-200/90 font-semibold">
//                 {paused ? "Paused" : "Teaching"}
//               </div>
//               <div className="mt-0.5 text-slate-100/90 line-clamp-2">{bubbleText}</div>
//               <div className="absolute -bottom-2 left-7 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-white/5" />
//             </div>
//           )}

//           {/* Neon stick */}
//           <div
//             className="absolute"
//             style={{
//               left: anchor.x,
//               top: anchor.y,
//               transformOrigin: "0% 50%",
//               transform: `rotate(${pose.angleDeg}deg)`,
//               transition: "transform 140ms linear"
//             }}
//           >
//             <div
//               className="h-[7px] rounded-full"
//               style={{
//                 width: `${pose.length}px`,
//                 transition: "width 140ms linear",
//                 background:
//                   "linear-gradient(90deg, rgba(34,211,238,0.95), rgba(125,211,252,0.95))",
//                 boxShadow: "0 0 16px rgba(34,211,238,0.35)"
//               }}
//             />
//             <div
//               className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full"
//               style={{
//                 background: "radial-gradient(circle at 30% 30%, #fff, rgba(251,113,133,0.95))",
//                 boxShadow: "0 0 16px rgba(251,113,133,0.35)",
//                 border: "1px solid rgba(255,255,255,0.35)"
//               }}
//             />
//           </div>

//           {/* 3D-ish Avatar SVG */}
//           <svg width="320" height="240" viewBox="0 0 320 240" className="drop-shadow-[0_18px_36px_rgba(0,0,0,0.55)]">
//             <defs>
//               <radialGradient id="skin3d" cx="35%" cy="30%" r="70%">
//                 <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
//                 <stop offset="40%" stopColor="rgba(226,232,240,0.95)" />
//                 <stop offset="100%" stopColor="rgba(148,163,184,0.90)" />
//               </radialGradient>

//               <radialGradient id="body3d" cx="30%" cy="20%" r="90%">
//                 <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
//                 <stop offset="40%" stopColor="rgba(148,163,184,0.35)" />
//                 <stop offset="100%" stopColor="rgba(30,41,59,0.55)" />
//               </radialGradient>

//               <linearGradient id="board3d" x1="0" y1="0" x2="1" y2="1">
//                 <stop offset="0%" stopColor="rgba(15,23,42,0.95)" />
//                 <stop offset="100%" stopColor="rgba(2,6,23,0.95)" />
//               </linearGradient>

//               <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
//                 <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
//                 <stop offset="100%" stopColor="rgba(255,255,255,0)" />
//               </linearGradient>
//             </defs>

//             {/* board */}
//             <g>
//               <rect
//                 x="14"
//                 y="18"
//                 width="120"
//                 height="82"
//                 rx="16"
//                 fill="url(#board3d)"
//                 stroke="rgba(148,163,184,0.35)"
//               />
//               <path d="M30 52 H116" stroke="rgba(226,232,240,0.30)" strokeWidth="5" />
//               <path d="M30 72 H100" stroke="rgba(226,232,240,0.22)" strokeWidth="5" />
//               {/* board shine */}
//               <path d="M18 26 C48 18, 92 18, 128 30 L128 40 C92 28, 48 28, 18 38 Z" fill="url(#shine)" />
//             </g>

//             {/* head */}
//             <g>
//               <circle cx="214" cy="80" r="38" fill="url(#skin3d)" />
//               {/* highlight */}
//               <ellipse cx="202" cy="68" rx="16" ry="12" fill="rgba(255,255,255,0.18)" />
//               {/* eyes */}
//               {!blink ? (
//                 <>
//                   <circle cx="200" cy="78" r="5" fill="rgba(15,23,42,0.82)" />
//                   <circle cx="228" cy="78" r="5" fill="rgba(15,23,42,0.82)" />
//                   <circle cx="198" cy="76" r="2" fill="rgba(255,255,255,0.7)" />
//                   <circle cx="226" cy="76" r="2" fill="rgba(255,255,255,0.7)" />
//                 </>
//               ) : (
//                 <>
//                   <path d="M192 78 Q200 82 208 78" stroke="rgba(15,23,42,0.8)" strokeWidth="4" strokeLinecap="round" fill="none" />
//                   <path d="M220 78 Q228 82 236 78" stroke="rgba(15,23,42,0.8)" strokeWidth="4" strokeLinecap="round" fill="none" />
//                 </>
//               )}

//               {/* mouth */}
//               {!active || paused ? (
//                 <path
//                   d="M196 98 Q214 112 232 98"
//                   fill="none"
//                   stroke="rgba(15,23,42,0.6)"
//                   strokeWidth="5"
//                   strokeLinecap="round"
//                 />
//               ) : mouthOpen ? (
//                 <ellipse cx="214" cy="104" rx="10" ry="7" fill="rgba(15,23,42,0.55)" />
//               ) : (
//                 <path
//                   d="M196 102 Q214 116 232 102"
//                   fill="none"
//                   stroke="rgba(15,23,42,0.6)"
//                   strokeWidth="5"
//                   strokeLinecap="round"
//                 />
//               )}
//             </g>

//             {/* body */}
//             <g>
//               <rect
//                 x="172"
//                 y="124"
//                 width="86"
//                 height="74"
//                 rx="26"
//                 fill="url(#body3d)"
//                 stroke="rgba(226,232,240,0.18)"
//               />
//               {/* body shine */}
//               <path
//                 d="M182 132 C198 122, 232 122, 252 136 C234 136, 204 140, 182 148 Z"
//                 fill="rgba(255,255,255,0.10)"
//               />
//             </g>

//             {/* arm to anchor */}
//             <path
//               d="M198 152 C178 146, 168 146, 160 160"
//               fill="none"
//               stroke="rgba(226,232,240,0.78)"
//               strokeWidth="12"
//               strokeLinecap="round"
//             />
//             {/* hand at anchor */}
//             <circle cx={anchor.x} cy={anchor.y} r="10" fill="rgba(226,232,240,0.92)" />
//             <circle cx={anchor.x - 3} cy={anchor.y - 3} r="4" fill="rgba(255,255,255,0.25)" />

//             {/* legs */}
//             <path d="M200 198 v22" stroke="rgba(226,232,240,0.55)" strokeWidth="12" strokeLinecap="round" />
//             <path d="M232 198 v22" stroke="rgba(226,232,240,0.55)" strokeWidth="12" strokeLinecap="round" />
//           </svg>
//         </div>
//       </div>
//     </div>
//   );
// }

