import React, { useId } from "react";

type FramePoint = readonly [u: number, v: number, depth?: number];

// Every face shares the same oblique projection, including the recessed joints.
function point([u, v, depth = 0]: FramePoint) {
  const x = 125 + 392 * u + 112 * v + 8 * u * v + 46 * depth;
  const y = 144 - 90 * u + 338 * v - 6 * u * v - 26 * depth;
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function face(points: readonly FramePoint[]) {
  return `M${points.map(point).join(" L")} Z`;
}

const frontContour: FramePoint[] = [
  [0, 0], [0.79, 0], [0.79, 0.15], [0.15, 0.15], [0.15, 0.85],
  [0.85, 0.85], [0.85, 0.23], [1, 0.23], [1, 1], [0, 1]
];
const rearOuter: FramePoint[] = [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const rearAperture: FramePoint[] = [[0.18, 0.18, 1], [0.82, 0.18, 1], [0.82, 0.82, 1], [0.18, 0.82, 1]];

/** A conceptual machined assembly, deliberately separate from actual NFT media. */
export function OpenFrameSculpture() {
  const id = useId().replace(/:/g, "");
  const material = (name: string) => `url(#${id}-${name})`;

  return (
    <figure className="open-frame-scene">
      <div className="open-frame-marker" aria-hidden="true">
        <span>OPEN FRAME</span>
        <span>Spatial study / 01</span>
      </div>
      <svg viewBox="70 0 690 560" className="open-frame-sculpture" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-aluminum`} x1="165" y1="115" x2="610" y2="420" gradientUnits="userSpaceOnUse">
            <stop stopColor="#D1D8DF" />
            <stop offset="0.3" stopColor="#8F9BA7" />
            <stop offset="0.59" stopColor="#56636F" />
            <stop offset="0.83" stopColor="#A6B1BB" />
            <stop offset="1" stopColor="#62707D" />
          </linearGradient>
          <linearGradient id={`${id}-graphite`} x1="230" y1="90" x2="600" y2="420" gradientUnits="userSpaceOnUse">
            <stop stopColor="#414B55" />
            <stop offset="1" stopColor="#131B23" />
          </linearGradient>
          <linearGradient id={`${id}-return`} x1="220" y1="170" x2="570" y2="390" gradientUnits="userSpaceOnUse">
            <stop stopColor="#17212B" />
            <stop offset="0.64" stopColor="#35434F" />
            <stop offset="1" stopColor="#657684" />
          </linearGradient>
          <filter id={`${id}-cast-softness`} x="-15%" y="-35%" width="140%" height="175%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <clipPath id={`${id}-front-contour`}>
            <path d={face(frontContour)} />
          </clipPath>
        </defs>

        <g className="frame-cast-shadow">
          <path d="M222 478 588 393 744 465 352 546 193 510Z" fill="#00050A" opacity="0.42" filter={material("cast-softness")} />
          <path d="M237 482 620 391 680 435 292 512Z" fill="#03070B" opacity="0.45" />
          <path d="M237 482 327 461 350 474 256 496Z" fill="#000000" opacity="0.65" />
        </g>

        <g className="frame-assembly-entrance">
          <g className="frame-assembly">
            <g className="frame-rear-plane">
              <path d={`${face(rearOuter)} ${face(rearAperture)}`} fill={material("graphite")} fillRule="evenodd" />
              <path d={face([[1, 0, 1], [1, 1, 1], [1, 1, 1.18], [1, 0, 1.18]])} fill="#101820" />
              <path d={face([[0, 0, 1], [1, 0, 1], [1, 0.018, 1], [0.018, 0.018, 1]])} fill="#70808E" />
              <path d={face([[0.18, 0.18, 1], [0.82, 0.18, 1], [0.8, 0.2, 1], [0.2, 0.2, 1]])} fill="#121B24" />
              <path d={face([[0.18, 0.82, 1], [0.82, 0.82, 1], [0.8, 0.8, 1], [0.2, 0.8, 1]])} fill="#5C6B79" />
            </g>

            <g className="frame-material-returns">
              <path d={face([[1, 0.23], [1, 1], [1, 1, 1], [1, 0.23, 1]])} fill="#1D2934" />
              <path d={face([[0, 1], [1, 1], [1, 1, 1], [0, 1, 1]])} fill="#364550" />
              <path d={face([[0.15, 0.15], [0.15, 0.85], [0.18, 0.82, 1], [0.18, 0.18, 1]])} fill={material("return")} />
              <path d={face([[0.15, 0.85], [0.85, 0.85], [0.82, 0.82, 1], [0.18, 0.82, 1]])} fill="#596B79" />
              <path d={face([[0.85, 0.23], [0.85, 0.85], [0.82, 0.82, 1], [0.82, 0.23, 1]])} fill="#1B2731" />
              <path d={`M${point([0.18, 0.18, 1])} L${point([0.18, 0.82, 1])} L${point([0.82, 0.82, 1])}`} fill="none" stroke="#09121B" strokeWidth="4" />
            </g>

            <g className="frame-machined-face">
              <path d={face(frontContour)} fill={material("aluminum")} />

              <g className="frame-outer-bevel">
                <path d={face([[0, 0], [0.79, 0], [0.79, 0.022], [0.025, 0.022]])} fill="#E3E8ED" />
                <path d={face([[0, 0], [0.025, 0.022], [0.025, 0.978], [0, 1]])} fill="#B5C2CC" />
                <path d={face([[0, 1], [0.025, 0.978], [0.975, 0.978], [1, 1]])} fill="#DEE6EC" />
                <path d={face([[1, 0.23], [0.975, 0.245], [0.975, 0.978], [1, 1]])} fill="#465663" />
              </g>

              <g className="frame-inner-bevel">
                <path d={face([[0.13, 0.13], [0.79, 0.13], [0.79, 0.15], [0.15, 0.15]])} fill="#465561" />
                <path d={face([[0.13, 0.13], [0.15, 0.15], [0.15, 0.85], [0.13, 0.87]])} fill="#D1DAE2" />
                <path d={face([[0.13, 0.87], [0.15, 0.85], [0.85, 0.85], [0.87, 0.87]])} fill="#394A58" />
                <path d={face([[0.85, 0.23], [0.87, 0.23], [0.87, 0.87], [0.85, 0.85]])} fill="#C0CCD6" />
              </g>

              <g className="frame-reflection" fill="#F0F5FA">
                <path d={face([[0.038, 0.045], [0.063, 0.045], [0.063, 0.95], [0.038, 0.95]])} opacity="0.18" />
                <path d={face([[0.075, 0.043], [0.77, 0.043], [0.77, 0.052], [0.075, 0.052]])} opacity="0.35" />
                <path d={face([[0.2, 0.915], [0.94, 0.915], [0.94, 0.925], [0.2, 0.925]])} opacity="0.12" />
              </g>
              <g className="frame-light-mask" clipPath={material("front-contour")}>
                <path className="frame-light-pass" d="M140 50 166 44 325 515 299 523Z" fill="#E2F2FF" />
              </g>
            </g>

            <g className="frame-cut-edges">
              <path d={face([[0.79, 0], [0.79, 0.15], [0.79, 0.15, 0.34], [0.79, 0, 0.34]])} fill="#FF8052" />
              <path d={face([[0.85, 0.23], [1, 0.23], [1, 0.23, 0.34], [0.85, 0.23, 0.34]])} fill="#AF4B2D" />
              <path d={`M${point([0.79, 0])} L${point([0.79, 0.15])}`} fill="none" stroke="#FFC2A5" strokeWidth="1.2" />
            </g>
          </g>
        </g>
      </svg>
      <figcaption>Conceptual artwork · demonstration only</figcaption>
    </figure>
  );
}
