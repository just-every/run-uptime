import { SUN, wideBox } from './frame'

/** The low sun and its glow, behind the mountains. A layer of its own so it can lift on the compositor without repainting the landscape. */
export function Sun({ id }: { id: string }) {
  return <svg className="ut-dawn-wide ut-dawn-sun" viewBox={wideBox} aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-haze`}>
        <stop offset="0" stopColor="#fde2bd" stopOpacity=".75" />
        <stop offset=".55" stopColor="#fbdcc4" stopOpacity=".3" />
        <stop offset="1" stopColor="#fbdcc4" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-glow`} cx={SUN.x} cy={SUN.y} r="330" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fde6c3" />
        <stop offset=".12" stopColor="#fde4bf" stopOpacity=".95" />
        <stop offset=".3" stopColor="#fddcb9" stopOpacity=".6" />
        <stop offset=".66" stopColor="#fcdac4" stopOpacity=".18" />
        <stop offset="1" stopColor="#fcdcc4" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="1060" cy="880" rx="980" ry="190" fill={`url(#${id}-haze)`} />
    <circle cx={SUN.x} cy={SUN.y} r="330" fill={`url(#${id}-glow)`} />
    <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="#fff6df" />
  </svg>
}
