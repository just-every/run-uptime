import { n, seeded } from './frame'

/** A conifer standing at `x` on the ground at `base`: `h` tall to its tip, `w` across its lowest branches. */
export type Pine = readonly [x: number, base: number, h: number, w: number]

type Tier = { cx: number; cy: number; ox: number; oy: number; nx: number; ny: number }

/** One side of a pine from the tip down: each tier sweeps out and droops to a branch tip (`o`, through `c`), then the next tier starts tucked in just above it (`n`). */
function tiers([x, base, h, w]: Pine, dir: 1 | -1, rnd: () => number): Tier[] {
  const tip = base - h
  const crown = base - Math.max(2, h * 0.07)
  const count = Math.min(10, Math.max(5, Math.round(h / 14)))
  const out: Tier[] = []
  let prevY = tip
  for (let i = 1; i <= count; i++) {
    const t = i / count
    const y = tip + (crown - tip) * Math.pow(t, 0.9) + (rnd() - 0.5) * h * 0.03
    const reach = (w / 2) * (0.2 + 0.8 * Math.pow(t, 0.85)) * (0.84 + rnd() * 0.32)
    const step = y - prevY
    out.push({
      cx: x + dir * reach * 0.86, cy: y - step * 0.62,
      ox: x + dir * reach, oy: y,
      nx: x + dir * reach * (0.42 + rnd() * 0.14), ny: y - step * 0.3,
    })
    prevY = y
  }
  return out
}

/** One pine silhouette as path data, each side jittered on its own so no two trees are alike. */
export function pinePath(pine: Pine, seed: number): string {
  const [x, base, h, w] = pine
  const rnd = seeded(seed)
  const right = tiers(pine, 1, rnd)
  const left = tiers(pine, -1, rnd)
  const crown = base - Math.max(2, h * 0.07)
  const tw = Math.max(1, w * 0.04)
  const d = [`M${n(x)} ${n(base - h)}`]
  right.forEach((t, i) => {
    d.push(`Q${n(t.cx)} ${n(t.cy)} ${n(t.ox)} ${n(t.oy)}`)
    if (i < right.length - 1) d.push(`L${n(t.nx)} ${n(t.ny)}`)
  })
  d.push(`L${n(x + tw)} ${n(crown)}L${n(x + tw)} ${n(base)}L${n(x - tw)} ${n(base)}L${n(x - tw)} ${n(crown)}`)
  for (let i = left.length - 1; i >= 0; i--) {
    const t = left[i]
    const to = i > 0 ? left[i - 1] : null
    d.push(`L${n(t.ox)} ${n(t.oy)}`)
    d.push(`Q${n(t.cx)} ${n(t.cy)} ${to ? `${n(to.nx)} ${n(to.ny)}` : `${n(x)} ${n(base - h)}`}`)
  }
  return d.join('') + 'Z'
}

