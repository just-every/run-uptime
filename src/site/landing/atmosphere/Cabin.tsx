import { useId } from 'react';
import { pinePath, type Pine } from '../hero/art/pines';
import { blob, ridge } from '../hero/art/ridge';

// A small lakeside cabin beside the terminal, mid-morning: a distant ridge, the sun a little higher than at dawn, a cabin
// whose windows only catch the daylight, a few pines, a short dock and the still water mirroring them. Drawn in pixels with
// the terminal's top right corner at 0,0; atmosphere.css places that point on the card and scales the whole for the room,
// and where the island stands on the card's top edge it lowers the sky (sun and ridge) to stand just behind the island.
const WATER = 130;
/** The far shore, just under the card's top edge: the ridge stands on it and shows above the card and beside it. */
const SHORE = 10;
const FAR = ridge([[-380, -2], [-300, -14], [-220, -9], [-140, -26], [-60, -38], [0, -33], [60, -16], [118, -24], [176, -8], [240, -2]], SHORE);
/** The island: the cabin with its pines standing close behind and to the right of the roof, all within the gutter. */
const LAND = blob([[-14, WATER], [10, 124], [52, 121], [96, 118], [128, 119], [150, WATER]]);
const PINES: readonly [Pine, string][] = [
  [[52, 120, 50, 16], '#8890c0'], [[68, 119, 60, 18], '#8890c0'], [[82, 118, 48, 16], '#8890c0'],
  [[60, 120, 72, 20], '#6c76aa'], [[75, 118, 62, 18], '#6c76aa'], [[88, 121, 26, 10], '#6c76aa'],
];
const TREES = PINES.map(([pine, color], i) => <path key={i} d={pinePath(pine, 31 + i)} fill={color} />);

/** The cabin vignette. Decorative only. */
export function Cabin() {
  const id = `ut-cb${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className="ut-cabin" viewBox="-380 -120 620 320" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-s`}>
          <stop offset=".25" stopColor="#fde6cc" stopOpacity=".55" />
          <stop offset="1" stopColor="#fde9cc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-r`} x1="-380" x2="240" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#cfd0ec" stopOpacity="0" />
          <stop offset=".3" stopColor="#cfd0ec" />
          <stop offset=".6" stopColor="#e2d0de" />
          <stop offset="1" stopColor="#c9cbea" />
        </linearGradient>
        <linearGradient id={`${id}-w`} x2="0" y2="1">
          <stop offset="0" stopColor="#f8ecdc" />
          <stop offset="1" stopColor="#cdd2ec" />
        </linearGradient>
        <linearGradient id={`${id}-d`} x1="0" y1={WATER} x2="0" y2="196" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="0" y1="-30" x2="0" y2={SHORE} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity=".15" />
        </linearGradient>
        <mask id={`${id}-v`}><rect x="-380" y="-60" width="620" height="80" fill={`url(#${id}-f)`} /></mask>
        <mask id={`${id}-m`}><rect x="-380" y={WATER} width="620" height="70" fill={`url(#${id}-d)`} /></mask>
        <g id={`${id}-g`}>
          <path d={LAND} fill="#9aa1cd" />
          {TREES}
          <path d="M14 98h52v24H14Z" fill="#8a92c1" />
          <path d="M7 101 40 77l33 24Z" fill="#646fa4" />
          <path d="M54 80h5v12h-5Z" fill="#646fa4" />
          <path d="M21 104h9v9h-9ZM50 104h9v9h-9Z" fill={`url(#${id}-w)`} />
          <path d="M36 108h8v14h-8Z" fill="#646fa4" />
          <path d="M-36 125.5h50v2.5h-50ZM-26 128h2v5h-2ZM-10 128h2v5h-2ZM6 128h2v5h-2Z" fill="#7780b3" />
        </g>
      </defs>
      <g className="ut-cabin-sky">
        <circle cx="-30" cy="-80" r="44" fill={`url(#${id}-s)`} />
        <circle cx="-30" cy="-80" r="12" fill="#fff4dc" />
        <path d={FAR} fill={`url(#${id}-r)`} opacity=".6" mask={`url(#${id}-v)`} />
      </g>
      <use href={`#${id}-g`} />
      <g mask={`url(#${id}-m)`}><use href={`#${id}-g`} transform={`matrix(1 0 0 -1 0 ${WATER * 2})`} /></g>
      <path d={`M-10 ${WATER}H240M16 ${WATER + 9}h40M72 ${WATER + 15}h56M36 ${WATER + 24}h44`} stroke="#fff" strokeWidth="1.2" opacity=".85" />
    </svg>
  );
}
