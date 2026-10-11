import { useCallback } from 'react';

// A card's arrival lives in its data-reveal attribute, which motion.css reads:
//   (none)  the card as drawn. Server HTML, no script, reduced motion, and any card already on screen when the page wakes up
//           stay here, so nothing is ever hidden waiting for a script, and nothing seen is hidden again.
//   wait    below the reveal line: the card holds its first frame (opacity and transform only, so nothing reflows).
//   play    it has been seen: it rises into place once.
const revealLine = 0.88;
let observer: IntersectionObserver | null = null;
const waiting = new Map<Element, () => void>();

function watch(node: Element, play: () => void) {
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const run = waiting.get(entry.target);
      waiting.delete(entry.target);
      observer?.unobserve(entry.target);
      run?.();
    }
  }, { rootMargin: `0px 0px -${Math.round((1 - revealLine) * 100)}% 0px` });
  waiting.set(node, play);
  observer.observe(node);
  return () => { waiting.delete(node); observer?.unobserve(node); };
}

const motionWelcome = () => typeof window.IntersectionObserver === 'function' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

/** A ref that lets a card rise into place once, the first time it scrolls into view. */
export function useReveal<T extends Element = HTMLElement>() {
  return useCallback((node: T | null) => {
    if (!node || node.hasAttribute('data-reveal') || !motionWelcome()) return;
    if (node.getBoundingClientRect().top < window.innerHeight * revealLine) return;
    node.setAttribute('data-reveal', 'wait');
    const stop = watch(node, () => node.setAttribute('data-reveal', 'play'));
    return () => { stop(); if (node.getAttribute('data-reveal') === 'wait') node.removeAttribute('data-reveal'); };
  }, []);
}
