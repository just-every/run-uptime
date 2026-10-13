import { HydrationUnit } from '../../base/hydration/unit';
import { Icon } from '../shell/Icon';
import { docsPath, type SiteVariant } from '../shell/links';
import { SiteFooter } from '../shell/SiteFooter';
import { SiteFrame } from '../shell/SiteFrame';
import { SiteHeader } from '../shell/SiteHeader';
import { DocsDawn } from './DocsDawn';
import { DocsSidebar } from './DocsNav';
import { docsLead, docsSections } from './pages';
import { TitleDots } from './TitleDots';
import './styles';

/**
 * The docs home at /docs, laid out like every docs page: the section sidebar, then the title, a short lead and each
 * section's pages as even cards in reading order. It has no "On this page" column, and on phones no menu: the page itself
 * is the full list.
 */
export function DocsIndex({ variant = 'instance' }: { variant?: SiteVariant }) {
  return (
    <SiteFrame className="ut-docs">
      <DocsDawn />
      <HydrationUnit><SiteHeader current="docs" variant={variant} /></HydrationUnit>
      <div className="ut-wrap docs-shell docs-shell--index">
        <HydrationUnit><DocsSidebar /></HydrationUnit>
        <main id="main" className="docs-main">
          <HydrationUnit>
            <header className="docs-page-head">
              <p className="ut-eyebrow docs-eyebrow">Uptime</p>
              <h1 className="docs-title">Docs</h1>
              <TitleDots />
            </header>
          </HydrationUnit>
          <HydrationUnit><p className="docs-lead">{docsLead}</p></HydrationUnit>
          {docsSections.map((section, index) => (
            <HydrationUnit key={section.title}>
            <section className="docs-index-section" aria-labelledby={`docs-section-${index}`}>
              <h2 className="ut-eyebrow docs-index-section-title" id={`docs-section-${index}`}>{section.title}</h2>
              <ul className="docs-index-grid">
                {section.pages.map(page => (
                  <li key={page.slug}>
                    <a className="ut-card docs-index-card" href={docsPath(page.slug)}>
                      <h3>{page.title}<Icon name="arrow" /></h3>
                      <p>{page.summary}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
            </HydrationUnit>
          ))}
        </main>
      </div>
      <HydrationUnit><SiteFooter variant={variant} /></HydrationUnit>
    </SiteFrame>
  );
}
