const drawings = {
  left: { land: "/design-assets/dawn/left.74dafaacb610.svg", clouds: "/design-assets/dawn/left-clouds.a68fcb006c91.svg" },
  right: { land: "/design-assets/dawn/right.743eda2631ae.svg", clouds: "/design-assets/dawn/right-clouds.69e26545f5a0.svg" },
} as const

/** Each shore keeps its original box; clouds remain a separate layer to hide on phones. */
export function Shore({ side }: { side: 'left' | 'right' }) {
  const art = drawings[side]
  return <div className={`ut-dawn-shore ut-dawn-shore--${side}`} aria-hidden="true">
    <img className="ut-dawn-cloud" src={art.clouds} alt="" width="600" height="614" loading="lazy" decoding="async" />
    <img src={art.land} alt="" width="600" height="614" loading="lazy" decoding="async" />
  </div>
}
