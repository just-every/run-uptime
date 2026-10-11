import { BOTTOM, n } from './frame'

export type Point = readonly [x: number, y: number]

/** A smooth curve through the points (Catmull–Rom as cubic Béziers), as path commands after the first point. */
function through(points: readonly Point[]): string {
  let d = ''
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)]
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`
  }
  return d
}

/** A soft mountain or hill: a smooth skyline through the points, closed straight down to `floor` (the bottom of the scene by default). */
export function ridge(points: readonly Point[], floor = BOTTOM): string {
  const first = points[0], last = points[points.length - 1]
  return `M${n(first[0])} ${n(first[1])}${through(points)}L${n(last[0])} ${floor}L${n(first[0])} ${floor}Z`
}

/** A closed smooth shape through the points (used for shaded faces and clouds). */
export function blob(points: readonly Point[]): string {
  return `M${n(points[0][0])} ${n(points[0][1])}${through(points)}Z`
}
