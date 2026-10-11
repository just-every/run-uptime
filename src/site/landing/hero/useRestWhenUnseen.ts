import { useEffect, type RefObject } from 'react'

/** Holds the scene's CSS motion still while it is off screen or the tab is hidden, by marking the root `data-unseen` (dawn-scene.css pauses every animation under it). The night is then watched when someone is actually looking, and the water's slow shimmer never runs unseen. Without JavaScript nothing is marked and the CSS simply plays. */
export function useRestWhenUnseen(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    let inView = true
    const sync = () => el.toggleAttribute('data-unseen', !inView || document.hidden)
    const observer = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting
      sync()
    })
    observer.observe(el)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      el.removeAttribute('data-unseen')
    }
  }, [root])
}
