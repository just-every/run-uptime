import { useId } from 'react';
import { ridge } from '../hero/art/ridge';

// One faint horizon across the page between Checks and Notifications: the same lake later in the morning, seen far off.
// Drawn in a 1920 × 120 box with the waterline at y 72; atmosphere.css sizes it and anchors it to the right, so on a phone
// the glint stays in view. No sun: only its light on the water, a soft glint with a faint column of light below it.
const LINE = 72;
const BACK = ridge([[0, 40], [120, 30], [260, 6], [340, 20], [460, 40], [600, 46], [760, 25], [900, 44], [1060, 50], [1200, 42], [1320, 26], [1440, 7], [1540, 24], [1680, 40], [1800, 22], [1920, 44]], LINE);
const FRONT = ridge([[0, 58], [160, 52], [300, 46], [420, 56], [560, 62], [700, 57], [860, 63], [1000, 59], [1140, 63], [1280, 55], [1380, 49], [1480, 56], [1620, 62], [1760, 53], [1920, 60]], LINE);

/** The horizon band: a soft back ridge, a front ridge, the waterline, their faint reflection and a warm glint on the right. */
export function Horizon() {
  const id = `ut-hz${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div className="ut-horizon" aria-hidden="true">
      <svg viewBox="0 0 1920 120" preserveAspectRatio="xMaxYMid slice" focusable="false">
        <defs>
          <linearGradient id={`${id}-b`}>
            <stop offset="0" stopColor="#c6c7e7" />
            <stop offset=".72" stopColor="#e3cdd9" />
            <stop offset="1" stopColor="#cfc9e6" />
          </linearGradient>
          <linearGradient id={`${id}-f`}>
            <stop offset="0" stopColor="#c3c6e6" />
            <stop offset=".74" stopColor="#d4c0d6" />
            <stop offset="1" stopColor="#bdbbe0" />
          </linearGradient>
          <linearGradient id={`${id}-l`} x2="1920" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".3" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity=".6" />
          </linearGradient>
          <linearGradient id={`${id}-d`} x1="0" y1={LINE} x2="0" y2="112" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity=".5" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-g`}>
            <stop offset="0" stopColor="#fde3c6" />
            <stop offset="1" stopColor="#fde3c6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-c`} cy="0">
            <stop offset="0" stopColor="#fbd9bc" stopOpacity=".6" />
            <stop offset="1" stopColor="#fbd9bc" stopOpacity="0" />
          </radialGradient>
          <mask id={`${id}-m`}><rect y={LINE} width="1920" height="48" fill={`url(#${id}-d)`} /></mask>
          <g id={`${id}-r`}>
            <path d={BACK} fill={`url(#${id}-b)`} opacity=".5" />
            <path d={FRONT} fill={`url(#${id}-f)`} />
          </g>
        </defs>
        <use href={`#${id}-r`} opacity=".62" />
        <g mask={`url(#${id}-m)`}><use href={`#${id}-r`} transform={`matrix(1 0 0 -1 0 ${LINE * 2})`} opacity=".62" /></g>
        <path d={`M0 ${LINE}H1920`} stroke={`url(#${id}-l)`} strokeWidth="1.2" />
        <rect x="1484" y={LINE} width="24" height="56" fill={`url(#${id}-c)`} />
        <ellipse cx="1496" cy={LINE + 1.5} rx="110" ry="5" fill={`url(#${id}-g)`} />
      </svg>
    </div>
  );
}
