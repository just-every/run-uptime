/// <reference types="vite/client" />
import { SiteFooter } from './SiteFooter';
import { SiteFrame } from './SiteFrame';
import { SiteHeader } from './SiteHeader';
import { links } from './links';
import fonts from './styles/fonts.css?raw';
import tokens from './styles/tokens.css?raw';
import base from './styles/base.css?raw';
import chrome from './styles/chrome.css?raw';

/* The site's shell styles, then the docs' faint dawn wash at the top of the page and one card (values from styles/tokens.css).
   The root route loads this page lazily, and a lazy chunk's stylesheets only arrive with its script, so the server sends
   them inline as hoisted <style> elements; React drops the duplicates once the chunk's own stylesheet loads alongside. */
const css = `.ut-not-found{position:relative;isolation:isolate;display:flex;flex-direction:column}
.ut-not-found::before{content:"";position:absolute;inset:0 0 auto;z-index:-1;height:520px;pointer-events:none;background:radial-gradient(70% 380px at 82% 0%,rgba(251,227,207,.6),rgba(251,227,207,0) 72%),linear-gradient(180deg,var(--sky-top) 0,rgba(239,234,243,.8) calc(var(--header-h)*.88),rgba(247,246,251,0) calc(var(--header-h)*1.6))}
.ut-not-found-main{flex:1;padding-top:clamp(24px,6vw,72px);padding-bottom:clamp(56px,8vw,112px)}
.ut-not-found-card{max-width:640px;padding:clamp(24px,4vw,44px)}
.ut-not-found-card .ut-eyebrow{margin-bottom:12px}
.ut-not-found-card h1{margin-bottom:14px;font-size:clamp(32px,4.4vw,48px);line-height:1.1;letter-spacing:-.03em}
.ut-not-found-card p:not(.ut-eyebrow){margin-bottom:28px}`;

/**
 * The public site's not-found page (an unknown docs slug): the site's header and footer around one card that points back to
 * the docs and home. The root route loads it lazily, so the site's styles never reach the console's documents.
 */
export function NotFound() {
  return (
    <SiteFrame className="ut-not-found">
      <style href="ut-site-shell" precedence="default">{fonts + tokens + base + chrome}</style>
      <style href="ut-not-found" precedence="default">{css}</style>
      <SiteHeader />
      <main id="main" className="ut-wrap ut-not-found-main">
        <div className="ut-card ut-not-found-card">
          <p className="ut-eyebrow">Error 404</p>
          <h1>Page not found</h1>
          <p>There is no page at this address. Check the link, or start again from the docs.</p>
          <div className="ut-actions">
            <a className="ut-pill" href={links.docs}>Browse the docs</a>
            <a className="ut-link" href={links.home}>Go to the home page</a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </SiteFrame>
  );
}
