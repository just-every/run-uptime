import { APRON, BOTTOM, HEIGHT, TOP, n, seeded } from './frame'
import { bushPath, litHalfPath, pinePath, type Pine } from './pines'
import { blob, type Point } from './ridge'

type ShoreArt = {
  /** Left edge of this shore's box in scene units; every shore box is 600 wide. */
  x: number
  /** Where the land meets the water, with a pale rim along it between these x. Reflections mirror a little above it, about the
   tree line, so the trees' images start at the shore as they do in the approved still. */
  water: number
  rim: [number, number]
  land: Point[]
  /** Trees from the farthest (lightest) row to the nearest. */
  rows: { color: string; pines: Pine[] }[]
  bushes: [x: number, base: number, w: number, h: number][]
  rocks: Point[][]
  clouds: { color: string; shape: Point[] }[]
}

const LEFT: ShoreArt = {
  x: 0, water: 929, rim: [-20, 336],
  land: [[-20, 864], [40, 872], [100, 882], [150, 889], [200, 896], [250, 905], [290, 914], [318, 922], [338, 928], [200, 931], [-20, 932]],
  rows: [
    { color: '#4b588d', pines: [[54, 884, 72, 34], [188, 902, 28, 16], [218, 904, 34, 18]] },
    { color: '#384572', pines: [[110, 896, 52, 28], [238, 908, 26, 15]] },
    { color: '#2d3965', pines: [[144, 898, 64, 34], [165, 898, 50, 28]] },
    { color: '#26315a', pines: [[22, 882, 148, 64], [76, 884, 102, 52]] },
  ],
  bushes: [[204, 904, 46, 30], [176, 903, 22, 14]],
  rocks: [
    [[266, 912], [272, 904], [282, 903], [290, 912]],
    [[332, 924], [344, 917], [358, 918], [366, 925]],
    [[380, 928], [388, 924], [396, 925], [402, 929]],
    [[400, 925], [414, 915], [432, 915], [444, 925]],
  ],
  clouds: [
    { color: '#dfd8ec', shape: [[-20, 584], [80, 584], [222, 583], [186, 579], [160, 576], [140, 568], [118, 564], [104, 552], [86, 545], [68, 547], [55, 553], [38, 556], [22, 565], [4, 568], [-20, 575]] },
    { color: '#e9dce8', shape: [[118, 690], [200, 690], [272, 690], [238, 687], [216, 683], [205, 675], [190, 670], [176, 673], [166, 681], [142, 684]] },
  ],
}

const RIGHT: ShoreArt = {
  x: 936, water: 924, rim: [1236, 1560],
  land: [[1232, 922], [1262, 918], [1300, 911], [1350, 904], [1400, 899], [1450, 894], [1500, 889], [1560, 884], [1560, 927], [1400, 926], [1240, 925]],
  rows: [
    { color: '#5a679d', pines: [[1403, 902, 40, 21], [1432, 900, 48, 24], [1467, 898, 62, 30], [1500, 896, 80, 36]] },
    { color: '#404c7e', pines: [[1352, 906, 22, 14], [1369, 905, 34, 19], [1390, 903, 42, 23], [1418, 901, 48, 26]] },
    { color: '#333f6c', pines: [[1445, 899, 62, 32], [1486, 896, 88, 42], [1521, 891, 106, 50]] },
  ],
  bushes: [[1336, 909, 26, 10], [1326, 912, 18, 7]],
  rocks: [],
  clouds: [
    { color: '#efdee3', shape: [[1290, 659], [1420, 660], [1560, 660], [1560, 620], [1520, 616], [1492, 610], [1466, 606], [1440, 609], [1420, 618], [1400, 622], [1380, 622], [1362, 630], [1340, 641], [1316, 651]] },
  ],
}

/** Faint gaps across a reflection where the water ripples, so mirrored trees read as water rather than glass. */
function rippleGaps(art: ShoreArt) {
  const rnd = seeded(art.x + 3)
  const out: string[] = []
  for (let i = 0; i < 16; i++) {
    const y = art.water + 4 + Math.pow(rnd(), 1.2) * (BOTTOM - art.water - 4)
    const x = art.x + rnd() * 560
    out.push(`M${n(x)} ${n(y)}h${n(30 + rnd() * 160)}`)
  }
  return out.join('')
}

/** Path data for one shore, drawn once per module: the seeds are fixed, so server and client print the same trees. */
function paint(art: ShoreArt) {
  let seed = art.x
  return {
    rows: art.rows.map((row) => {
      const seeds = row.pines.map(() => ++seed)
      return { color: row.color, d: row.pines.map((p, i) => pinePath(p, seeds[i])).join(''), lit: row.pines.map((p, i) => litHalfPath(p, seeds[i])).join('') }
    }),
    bushes: art.bushes.map(([x, base, w, h]) => bushPath(x, base, w, h)).join(''),
    land: blob(art.land),
    rocks: art.rocks.map((r) => blob(r)).join(''),
    clouds: art.clouds.map((c) => ({ color: c.color, d: blob(c.shape) })),
    gaps: rippleGaps(art),
  }
}

const SHORES = { left: { art: LEFT, paths: paint(LEFT) }, right: { art: RIGHT, paths: paint(RIGHT) } }

/** One shore: trees, land, rocks and clouds, mirrored in the lake. Each shore is its own layer, anchored to its edge of the page, so it frames the lake at any width. */
export function Shore({ id, side }: { id: string; side: 'left' | 'right' }) {
  const { art, paths } = SHORES[side]
  const key = `${id}-${side}`
  return <svg className={`ut-dawn-shore ut-dawn-shore--${side}`} viewBox={`${art.x} ${TOP} 600 ${HEIGHT}`} aria-hidden="true">
    <defs>
      <linearGradient id={`${key}-land`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6673aa" /><stop offset=".45" stopColor="#56649a" /><stop offset="1" stopColor="#4a5890" />
      </linearGradient>
      {/* The trees' reflection fades out a little way into the apron below the still, never at a hard line. */}
      <linearGradient id={`${key}-fade`} gradientUnits="userSpaceOnUse" x1="0" y1={art.water} x2="0" y2={BOTTOM + APRON * 0.7}>
        <stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".5" stopColor="#fff" stopOpacity=".7" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id={`${key}-mask`} maskUnits="userSpaceOnUse" x={art.x} y={art.water} width="600" height={BOTTOM + APRON - art.water}>
        <rect x={art.x} y={art.water} width="600" height={BOTTOM + APRON - art.water} fill={`url(#${key}-fade)`} />
        <path d={paths.gaps} stroke="#000" strokeWidth="1.8" opacity=".5" />
      </mask>
      <g id={`${key}-solid`}>
        {paths.rows.map((row, r) => <g key={r}><path d={row.d} fill={row.color} /><path d={row.lit} fill="#c9cff0" opacity=".07" /></g>)}
        <path d={paths.bushes} fill="#34416e" />
        <path d={paths.land} fill={`url(#${key}-land)`} />
      </g>
    </defs>
    {paths.clouds.map((c, i) => <path key={i} className="ut-dawn-cloud" d={c.d} fill={c.color} />)}
    <g mask={`url(#${key}-mask)`}>
      <use href={`#${key}-solid`} transform={`matrix(1 0 0 -1 0 ${(art.water - 24) * 2})`} />
    </g>
    <use href={`#${key}-solid`} />
    <path d={`M${art.rim[0]} ${art.water}H${art.rim[1]}`} stroke="#8f9bd0" strokeWidth="1.4" opacity=".5" />
    {paths.rocks ? <path d={paths.rocks} fill="#46538a" /> : null}
  </svg>
}
