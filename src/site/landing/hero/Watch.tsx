import type { CSSProperties } from 'react'

/** Checks across the night, evenly spaced from 23:00 to 07:00. Phones show every other one, which keeps the gap in the middle. */
const CHECKS = 13
const GAP = 6

const at = (i: number) => ({ '--i': i, '--at': `${(i * 100) / (CHECKS - 1)}%` }) as CSSProperties

/** The watched night across the horizon: a green dot for every check that ran and passed, and one hollow ring where no result arrived. Real text, so it can be read and selected; the scene's label carries it for screen readers. */
export function Watch() {
  return <div className="ut-dawn-watch">
    <span className="ut-dawn-rail" />
    {Array.from({ length: CHECKS }, (_, i) =>
      <span key={i} style={at(i)} className={i === GAP ? 'ut-dawn-check ut-dawn-check--gap' : `ut-dawn-check ut-dawn-check--ok${i % 2 ? ' ut-dawn-check--extra' : ''}`} />)}
    <span className="ut-dawn-note ut-dawn-note--start" style={at(0)}>
      <span className="ut-dawn-note-text"><span className="ut-dawn-note-title">api.example.com</span><span className="ut-dawn-note-line"><strong>200 OK</strong> · 142 ms</span></span>
    </span>
    <span className="ut-dawn-note ut-dawn-note--gap" style={at(GAP)}>
      <span className="ut-dawn-note-text"><span className="ut-dawn-note-title">Unknown</span><span className="ut-dawn-note-line">no check received</span></span>
    </span>
    <span className="ut-dawn-note ut-dawn-note--end" style={at(CHECKS - 1)}>
      <span className="ut-dawn-note-text"><span className="ut-dawn-note-line">200 OK · 137 ms</span></span>
    </span>
    <span className="ut-dawn-time" style={at(0)}>23:00</span>
    <span className="ut-dawn-time" style={at(CHECKS - 1)}>07:00</span>
  </div>
}
