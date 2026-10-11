import { APRON, BOTTOM, HORIZON, SUN, WIDE_W, WIDE_X, n, seeded, wideBox } from './frame'
import { ridge, type Point } from './ridge'

/** A hill: its skyline, and a gradient running `from` → `to` through its colour stops. */
type Hill = { line: Point[]; from: Point; to: Point; stops: [number, string][] }

/** Far mountains, cool on the left and warming toward the sun. */
const FAR: readonly Hill[] = [
  { // the big mountain behind the left shore
    line: [[-1200, 846], [-1020, 826], [-860, 800], [-720, 787], [-600, 796], [-470, 816], [-330, 820], [-200, 806], [-90, 776], [0, 750], [48, 742], [95, 733], [122, 737], [146, 747], [170, 757], [200, 764], [232, 771], [264, 784], [292, 797], [318, 804], [350, 812], [410, 826], [480, 842], [560, 862], [650, 882], [700, 894]],
    from: [-260, 880], to: [300, 740], stops: [[0, '#979dd2'], [0.55, '#a7abd8'], [1, '#b6b6dd']],
  },
  { // the softer peak left of centre
    line: [[290, 846], [336, 813], [384, 806], [432, 797], [470, 787], [500, 788], [528, 795], [576, 808], [624, 824], [672, 832], [720, 845], [760, 856], [810, 872], [860, 894]],
    from: [0, 786], to: [0, HORIZON], stops: [[0, '#bcb6d9'], [1, '#a8a8d5']],
  },
  { // the peak right of centre, catching the light
    line: [[690, 872], [744, 853], [792, 835], [840, 816], [870, 807], [896, 803], [922, 806], [960, 818], [1008, 828], [1056, 842], [1104, 850], [1150, 855], [1186, 859], [1216, 858], [1250, 866], [1300, 882], [1340, 894]],
    from: [700, 0], to: [1222, 0], stops: [[0, '#bbb3d6'], [0.4, '#c8bad4'], [0.78, '#dbbdcb'], [1, '#edcbc6']],
  },
  { // the long ridge on the right, rising behind the right shore
    line: [[1160, 872], [1200, 861], [1236, 852], [1272, 838], [1310, 826], [1344, 818], [1372, 806], [1402, 790], [1432, 773], [1466, 761], [1500, 756], [1536, 758], [1600, 770], [1700, 794], [1800, 810], [1900, 804], [2000, 798], [2150, 812], [2300, 830], [2500, 842], [2736, 850]],
    from: [1180, 0], to: [1720, 0], stops: [[0, '#e6c6c7'], [0.25, '#cab0ca'], [0.55, '#b3a8cf'], [1, '#a5a6d5']],
  },
]

/** Nearer, darker ridges in front of the far mountains. */
const MID: readonly Hill[] = [
  {
    line: [[-1200, 862], [-900, 850], [-600, 846], [-400, 840], [-250, 828], [-120, 806], [0, 789], [60, 786], [110, 792], [150, 806], [200, 821], [250, 834], [300, 843], [336, 838], [380, 838], [432, 852], [480, 860], [530, 873], [580, 881], [640, 887], [700, 894]],
    from: [0, 786], to: [0, HORIZON], stops: [[0, '#8a93cc'], [1, '#7581bd']],
  },
  {
    line: [[-1200, 882], [-500, 872], [-200, 860], [0, 824], [60, 836], [100, 843], [150, 842], [200, 846], [250, 846], [300, 858], [360, 865], [420, 873], [500, 885], [560, 894]],
    from: [0, 822], to: [0, HORIZON], stops: [[0, '#6f7cba'], [1, '#5f6cae']],
  },
  {
    line: [[520, 894], [560, 868], [592, 851], [614, 847], [642, 856], [690, 862], [744, 864], [800, 868], [850, 878], [900, 886], [940, 894]],
    from: [0, 846], to: [0, HORIZON], stops: [[0, '#9298cd'], [1, '#878fc8']],
  },
  {
    line: [[880, 894], [920, 882], [960, 863], [990, 857], [1030, 864], [1080, 868], [1120, 867], [1160, 864], [1200, 870], [1240, 877], [1280, 870], [1320, 856], [1370, 843], [1420, 832], [1470, 822], [1536, 812], [1640, 806], [1800, 820], [2000, 836], [2300, 848], [2736, 858]],
    from: [900, 0], to: [1700, 0], stops: [[0, '#9a9bd0'], [0.31, '#bea8c8'], [0.4, '#d0b1c5'], [0.54, '#a99ecb'], [0.69, '#9193ca'], [1, '#8a90c8']],
  },
]

/** Faint light streaks on the still water, closer together toward the horizon. */
const RIPPLES = (() => {
  const rnd = seeded(7)
  const out: string[] = []
  for (let i = 0; i < 46; i++) {
    const t = Math.pow(rnd(), 1.5)
    const y = HORIZON + 4 + t * (BOTTOM - HORIZON - 8)
    const x = -260 + rnd() * 2060
    const len = (18 + rnd() * 110) * (0.5 + t)
    out.push(`M${n(x)} ${n(y)}h${n(len)}`)
  }
  return out.join('')
})()

/** The sun's path on the water: `top` half-wide at the horizon and `bottom` half-wide `depth` below it. A path that reaches the still's bottom edge carries on through the apron at the same slope. */
const sunPath = (top: number, bottom: number, depth: number) => {
  const reach = depth >= BOTTOM - HORIZON ? depth + APRON : depth
  const half = top + ((bottom - top) * reach) / depth
  return `M${SUN.x - top} ${HORIZON}L${SUN.x + top} ${HORIZON}L${n(SUN.x + half)} ${HORIZON + reach}L${n(SUN.x - half)} ${HORIZON + reach}Z`
}

const stopsOf = (stops: [number, string][]) => stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)

/** The far landscape: mountains, the lake with their mirror image, ripples and the sun's path on the water. */
export function Range({ id }: { id: string }) {
  const grad = (kind: string, i: number) => `${id}-${kind}${i}`
  return <svg className="ut-dawn-wide ut-dawn-range" viewBox={wideBox} aria-hidden="true">
    <defs>
      {[...FAR.map((m, i) => [grad('f', i), m] as const), ...MID.map((m, i) => [grad('m', i), m] as const)].map(([key, m]) =>
        <linearGradient key={key} id={key} gradientUnits="userSpaceOnUse" x1={m.from[0]} y1={m.from[1]} x2={m.to[0]} y2={m.to[1]}>{stopsOf(m.stops)}</linearGradient>)}
      {/* The water's gradients run horizon → the still's bottom edge, so the apron below simply carries on the nearest water. */}
      <linearGradient id={`${id}-water`} gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2={BOTTOM}>
        <stop offset="0" stopColor="#d2c7dc" /><stop offset=".2" stopColor="#d5c8db" /><stop offset=".45" stopColor="#d0c6dc" />
        <stop offset=".72" stopColor="#c6c1df" /><stop offset="1" stopColor="#bcbbde" />
      </linearGradient>
      <linearGradient id={`${id}-depth`} gradientUnits="userSpaceOnUse" x1="0" y1={HORIZON} x2="0" y2={BOTTOM}>
        <stop offset="0" stopColor="#c9c3de" stopOpacity="0" /><stop offset=".6" stopColor="#c3c0de" stopOpacity=".3" /><stop offset="1" stopColor="#b3b6de" stopOpacity=".45" />
      </linearGradient>
      {/* Blue toward the shores, the left one most: the right side of the lake holds the sun's light. */}
      <linearGradient id={`${id}-edges`} gradientUnits="userSpaceOnUse" x1="-300" y1="0" x2="1836" y2="0">
        <stop offset="0" stopColor="#8492cc" stopOpacity=".85" /><stop offset=".3" stopColor="#8e98cf" stopOpacity="0" />
        <stop offset=".8" stopColor="#8e98cf" stopOpacity="0" /><stop offset="1" stopColor="#8e98cf" stopOpacity=".35" />
      </linearGradient>
      <linearGradient id={`${id}-mist`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f8e6e2" stopOpacity="0" /><stop offset="1" stopColor="#f8e6e2" stopOpacity=".15" />
      </linearGradient>
      <linearGradient id={`${id}-path`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff3d8" stopOpacity="0" /><stop offset=".5" stopColor="#fff3d8" /><stop offset="1" stopColor="#fff3d8" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${id}-pool`}>
        <stop offset="0" stopColor="#fde6c8" stopOpacity=".75" /><stop offset="1" stopColor="#fde6c8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-warm`}>
        <stop offset="0" stopColor="#fcdcc8" stopOpacity=".55" /><stop offset="1" stopColor="#fcdcc8" stopOpacity="0" />
      </radialGradient>
      {/* Softens the sun's path into a glow on the water instead of a beam with edges. */}
      <filter id={`${id}-soft`} x="-1" y="-.2" width="3" height="1.4">
        <feGaussianBlur stdDeviation="9" />
      </filter>
    </defs>

    <g id={`${id}-hills`}>
      {FAR.map((m, i) => <path key={i} d={ridge(m.line, HORIZON + 2)} fill={`url(#${grad('f', i)})`} />)}
      {MID.map((m, i) => <path key={i} d={ridge(m.line, HORIZON + 2)} fill={`url(#${grad('m', i)})`} />)}
    </g>
    <rect x={WIDE_X} y="836" width={WIDE_W} height={HORIZON - 836} fill={`url(#${id}-mist)`} />

    <rect x={WIDE_X} y={HORIZON} width={WIDE_W} height={BOTTOM + APRON - HORIZON} fill={`url(#${id}-water)`} />
    <use href={`#${id}-hills`} transform={`matrix(1 0 0 -1 0 ${HORIZON * 2})`} opacity=".55" />
    <rect x={WIDE_X} y={HORIZON} width={WIDE_W} height={BOTTOM + APRON - HORIZON} fill={`url(#${id}-depth)`} />
    <rect x={WIDE_X} y={HORIZON} width={WIDE_W} height={BOTTOM + APRON - HORIZON} fill={`url(#${id}-edges)`} />
    <rect x={WIDE_X} y={HORIZON - 0.8} width={WIDE_W} height="1.6" fill="#f8e9e6" opacity=".6" />
    <path d={RIPPLES} stroke="#f7eef3" strokeOpacity=".22" strokeWidth="1" strokeLinecap="round" fill="none" />

    <ellipse cx="1100" cy={HORIZON + 66} rx="480" ry="140" fill={`url(#${id}-warm)`} />
    <ellipse cx={SUN.x} cy={HORIZON + 10} rx="380" ry="40" fill={`url(#${id}-pool)`} />
    <g filter={`url(#${id}-soft)`}>
      <path d={sunPath(28, 100, BOTTOM - HORIZON)} fill={`url(#${id}-path)`} opacity=".35" />
      <path d={sunPath(22, 74, BOTTOM - HORIZON)} fill={`url(#${id}-path)`} opacity=".55" />
      <path d={sunPath(14, 34, 92)} fill={`url(#${id}-path)`} opacity=".8" />
    </g>
  </svg>
}
