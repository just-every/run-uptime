// The tooltip layer of the operator's documents: public/assets/tooltip.js, the H19 module carried from
// just-every/run-happytohelp 3710a4b4 (provenance in its header and in public/assets/tooltip-README.md). Like the console's
// other public modules it is imported by its full URL, which Vite's dev server leaves as it is, so the console's own
// modules (public/console-format.js tip()) and this loader share one instance.
export type Tooltips = (root: Document | ShadowRoot, container?: Element | ShadowRoot) => () => void
export const loadTooltips = async (): Promise<Tooltips> =>
  (await import(/* @vite-ignore */ new URL('/assets/tooltip.js', location.origin).href)).installTooltips
