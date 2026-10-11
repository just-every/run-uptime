import { ridge, type Point } from '../landing/hero/art/ridge';

/* Drawn in the hero still's units (1536 across), widened to 2400 so a wide window still has hills at its edges. The band is
   1.5 headers tall and the lake's horizon sits at 0.88 of a header, so the hills stand behind the header row. */
const HORIZON = 94;
const SUN = { x: 1028, y: 60 };

/** A paler range far off, and a nearer one; both dip where the sun is. */
const BACK: readonly Point[] = [[-432, 72], [-200, 71], [0, 70], [200, 70], [300, 68], [390, 56], [440, 54], [490, 59], [580, 56], [640, 60], [700, 66], [790, 60], [850, 63], [920, 74], [990, 86], [1060, 90], [1140, 83], [1200, 73], [1300, 69], [1380, 61], [1450, 55], [1500, 52], [1560, 53], [1700, 58], [1968, 64]];
const FRONT: readonly Point[] = [[-432, 86], [-150, 82], [0, 79], [120, 77], [220, 74], [300, 72], [380, 76], [460, 80], [560, 78], [640, 80], [720, 79], [800, 82], [880, 81], [960, 89], [1010, 94], [1080, 92], [1160, 88], [1240, 85], [1320, 83], [1420, 80], [1536, 78], [1700, 82], [1968, 86]];

/**
 * The docs pages' dawn: far hills and mist across the top of the page behind the header, a barely-there sun with its
 * glow and a glint on the water, all fading into the page before the title. Decoration only.
 */
export function DocsDawn() {
  const floor = HORIZON + 1;
  return (
    <svg className="docs-dawn" viewBox="-432 0 2400 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="docs-dawn-glow" cx={SUN.x} cy={SUN.y + 14} r="320" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fde4c6" stopOpacity=".8" /><stop offset=".35" stopColor="#fce0cc" stopOpacity=".35" /><stop offset="1" stopColor="#fce0cc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="docs-dawn-hill" gradientUnits="userSpaceOnUse" x1="-432" y1="0" x2="1968" y2="0">
          <stop offset="0" stopColor="#b3bdea" /><stop offset=".35" stopColor="#b4bbea" /><stop offset=".52" stopColor="#c9c3e2" /><stop offset=".61" stopColor="#ebccd0" /><stop offset=".72" stopColor="#e6cdd8" stopOpacity=".7" /><stop offset=".86" stopColor="#cdc6e3" stopOpacity=".8" /><stop offset="1" stopColor="#bcc0e6" />
        </linearGradient>
        <linearGradient id="docs-dawn-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8f1f3" stopOpacity="0" /><stop offset="1" stopColor="#f8f1f3" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id="docs-dawn-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8f5f8" stopOpacity=".9" /><stop offset="1" stopColor="#f8f5f8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="docs-dawn-path" cy="0">
          <stop offset="0" stopColor="#fde2c6" stopOpacity=".8" /><stop offset="1" stopColor="#fde2c6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={SUN.x} cy={SUN.y + 14} r="320" fill="url(#docs-dawn-glow)" />
      <circle className="docs-dawn-sun" cx={SUN.x} cy={SUN.y} r="17" fill="#fff5e6" opacity=".6" />
      <g id="docs-dawn-hills" fill="url(#docs-dawn-hill)">
        <path d={ridge(BACK, floor)} opacity=".5" />
        <path d={ridge(FRONT, floor)} opacity=".45" />
      </g>
      <rect x="-432" y="48" width="2400" height={floor - 48} fill="url(#docs-dawn-mist)" />
      <rect x="-432" y={floor} width="2400" height={160 - floor} fill="url(#docs-dawn-water)" />
      <use href="#docs-dawn-hills" transform={`matrix(1 0 0 -1 0 ${floor * 2})`} opacity=".1" />
      <rect x={SUN.x - 26} y={floor} width="52" height="80" fill="url(#docs-dawn-path)" />
      <path d={`M${SUN.x - 22} ${floor + 7}h18m10 0h16M${SUN.x - 12} ${floor + 15}h26M${SUN.x - 30} ${floor + 24}h20m12 0h22`} stroke="#fff6e8" strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
      <rect x="-432" y={HORIZON - 0.3} width="2400" height=".8" fill="#fff8f1" opacity=".45" />
      <ellipse cx={SUN.x} cy={floor} rx="30" ry="1.3" fill="#fffaf2" opacity=".85" />
    </svg>
  );
}
