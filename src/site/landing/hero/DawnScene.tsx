import { useId, useRef } from 'react'
import { Glints } from './art/Glints'
import { Range } from './art/Range'
import { Shore } from './art/Shore'
import { Sun } from './art/Sun'
import { useRestWhenUnseen } from './useRestWhenUnseen'
import { Watch } from './Watch'
import './dawn-scene.css'

export type DawnVariant = 'night-watch' | 'risen'

const LABEL = 'Overnight checks from 23:00 to 07:00: every check passed except one with no result, shown as Unknown'

/**
 * The dawn lake behind the landing page: sky, a low sun, layered mountains, two wooded shores and a still lake, all inline SVG.
 *
 * It fills the width of its positioned container and is anchored to its bottom; its height is the container's, or `--ut-dawn-height` when set. The landscape takes the lower part (a third of the width tall on wide screens, up to 330px on phones, never over 560px, or `--ut-dawn-land` when the page sets it) and the sky above it fades into the page over the top `--ut-dawn-fade` of its height, so headline text belongs over the sky. With `--ut-dawn-apron` the landscape stands that far above the bottom on open lake, for the page to fade out below the fold.
 *
 * `night-watch` (the hero) runs the watched night across the horizon: checks from 23:00 to 07:00, all green but one hollow Unknown. With motion allowed the night is watched once after load; the markup itself is the finished dawn, which is what reduced motion and no-JS show.
 * `risen` (the closing band) is the same lake with the sun higher and warmer and no timeline: a calm, light sky for text.
 */
export function DawnScene({ variant = 'night-watch' }: { variant?: DawnVariant }) {
  const root = useRef<HTMLDivElement>(null)
  const id = `ut-dawn${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  useRestWhenUnseen(root)
  const watching = variant === 'night-watch'
  const art = <>
    <div className="ut-dawn-sky" />
    <Sun id={id} />
    {watching ? <div className="ut-dawn-dusk" /> : null}
    <Range id={id} />
    <Glints />
    <Shore id={id} side="left" />
    <Shore id={id} side="right" />
    {watching ? <div className="ut-dawn-veil" /> : null}
  </>
  return watching
    ? <figure ref={root} className="ut-dawn ut-dawn--night-watch" role="img" aria-label={LABEL}>{art}<Watch /></figure>
    : <div ref={root} className="ut-dawn ut-dawn--risen" aria-hidden="true">{art}</div>
}
