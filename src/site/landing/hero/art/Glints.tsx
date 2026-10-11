import { BOTTOM, HORIZON, SUN, n, seeded, wideBox } from './frame'

/** Short bright strokes scattered down the sun's path, wider apart and longer as the water comes closer. */
const GLINTS = (() => {
  const rnd = seeded(23)
  const out: string[] = []
  for (let i = 0; i < 22; i++) {
    const t = Math.pow(i / 21, 1.25)
    const y = HORIZON + 3 + t * (BOTTOM - HORIZON - 6)
    const spread = 14 + t * 70
    const len = 4 + rnd() * (6 + t * 24)
    const x = SUN.x + (rnd() - 0.5) * 2 * spread - len / 2
    out.push(`M${n(x)} ${n(y)}h${n(len)}`)
  }
  return out.join('')
})()

/** The glints on the sun's path: a layer of its own, so its slow shimmer runs on the compositor. */
export function Glints() {
  return <svg className="ut-dawn-wide ut-dawn-glints" viewBox={wideBox} aria-hidden="true">
    <ellipse cx={SUN.x} cy={HORIZON + 1.5} rx="34" ry="2.2" fill="#fffaf0" opacity=".9" />
    <path d={GLINTS} stroke="#fff8e8" strokeWidth="1.4" strokeLinecap="round" opacity=".6" fill="none" />
  </svg>
}
