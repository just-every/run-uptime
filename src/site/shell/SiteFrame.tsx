import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import './styles';

const latinFont = '/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2';

/**
 * The root of every public page: the scoped .ut-site palette and type, a skip link, the self-hosted font preloaded and the
 * mark as the tab icon. React hoists the preload and the icon link into the document head.
 */
export function SiteFrame({ className, children }: { className?: string; children: ReactNode }) {
  preload(latinFont, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  return (
    <div className={className ? `ut-site ${className}` : 'ut-site'}>
      <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      <a className="ut-skip" href="#main">Skip to content</a>
      {children}
    </div>
  );
}
