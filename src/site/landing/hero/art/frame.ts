/** The scene is drawn in the units of the approved 1536 × 1024 hero still, so its shapes can be read straight off it. The landscape box is the still's lower part, y 520–1024; the far shore meets the lake at y 894. dawn-scene.css sizes every layer from these numbers. */
export const TOP = 520
export const HEIGHT = 504
export const BOTTOM = TOP + HEIGHT
export const HORIZON = 894

/** The far layers (sun, mountains, lake) run well past both edges of the still, so a very wide screen never runs out of lake. */
export const WIDE_X = -1200
export const WIDE_W = 3936

/** Lake drawn on below the still's bottom edge, so a page can let the water run past the fold before it fades out (dawn-scene.css `--ut-dawn-apron`). Enough for about 70px at the smallest landscape scale. */
export const APRON = 110

/** The low sun on the right of the still, partly behind the far ridge. */
export const SUN = { x: 1222, y: 835, r: 36 }

export const wideBox = `${WIDE_X} ${TOP} ${WIDE_W} ${HEIGHT}`

/** Rounds to one decimal so server and client print identical path data. */
export const n = (value: number) => Math.round(value * 10) / 10

/** A small seeded generator: the same seed always draws the same trees and ripples, so hydration matches the server. */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
