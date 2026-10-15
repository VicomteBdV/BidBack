import React from "react";

/** A conceptual composition, deliberately separate from real NFT media. */
export function OpenFrameSculpture() {
  return (
    <figure className="open-frame-scene">
      <div className="open-frame-marker" aria-hidden="true">
        <span>OPEN FRAME</span>
        <span>Study 01</span>
      </div>
      <svg viewBox="0 0 620 500" className="open-frame-sculpture" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="frame-front" x1="80" y1="70" x2="440" y2="400" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C4CCD6" />
            <stop offset="0.22" stopColor="#586371" />
            <stop offset="0.53" stopColor="#252C35" />
            <stop offset="0.78" stopColor="#707E8E" />
            <stop offset="1" stopColor="#B6C1CF" />
          </linearGradient>
          <linearGradient id="frame-side" x1="440" y1="70" x2="476" y2="372" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7D8998" />
            <stop offset="1" stopColor="#20262E" />
          </linearGradient>
          <linearGradient id="frame-inner" x1="130" y1="120" x2="390" y2="350" gradientUnits="userSpaceOnUse">
            <stop stopColor="#151B22" />
            <stop offset="1" stopColor="#7D8998" />
          </linearGradient>
        </defs>
        <ellipse cx="320" cy="451" rx="190" ry="14" fill="#000000" opacity="0.35" />
        <g transform="translate(14 4) rotate(-12 280 240)">
          <path d="M80 70 116 42H476L440 70Z" fill="#C0CAD6" />
          <path d="M440 70 476 42V372L440 400Z" fill="url(#frame-side)" />
          <path d="M130 120 166 92H426L390 120Z" fill="#11161C" />
          <path d="M390 120 426 92V322L390 350Z" fill="url(#frame-inner)" />
          <path d="M130 350 166 322H426L390 350Z" fill="#7C8999" />
          <path d="M80 70H440V400H80ZM130 120V350H390V120Z" fill="url(#frame-front)" fillRule="evenodd" />
          <path d="M80 70H440M80 70V400H440" fill="none" stroke="#DCE5F0" strokeOpacity="0.6" />
          <path d="M130 120H390V350" fill="none" stroke="#B9CADA" strokeOpacity="0.4" />
          <path d="M440 70V400L476 372" fill="none" stroke="#FF8052" strokeWidth="3" />
          <path d="M80 70V104M80 366V400H114" fill="none" stroke="#F2F4F7" strokeWidth="2" />
        </g>
      </svg>
      <figcaption>Conceptual artwork · demonstration only</figcaption>
    </figure>
  );
}
