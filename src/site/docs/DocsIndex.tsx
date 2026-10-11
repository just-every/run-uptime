import { Icon } from '../shell/Icon';
import { docsPath } from '../shell/links';
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
export function DocsIndex() {
  return (
    <SiteFrame className="ut-docs">
      <DocsDawn />
      <SiteHeader current="docs" />
      <div className="ut-wrap docs-shell docs-shell--index">
        <DocsSidebar />
        <main id="main" className="docs-main">
          <header className="docs-page-head">
            <p className="ut-eyebrow docs-eyebrow">Uptime</p>
            <h1 className="docs-title">Docs</h1>
            <TitleDots />
          </header>
          <p className="docs-lead">{docsLead}</p>
          {docsSections.map((section, index) => (
            <section className="docs-index-section" key={section.title} aria-labelledby={`docs-section-${index}`}>
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
          ))}
        </main>
      </div>
      <SiteFooter />
    </SiteFrame>
  );
}
