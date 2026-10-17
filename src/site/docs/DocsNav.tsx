import { docsPath, links, type SiteVariant } from '../shell/links';
import { docsSections } from './pages';

/** The sections and their pages, the current one marked. `idPrefix` keeps the sidebar's and the phone menu's ids apart. */
export function DocsNavList({ current, idPrefix }: { current?: string; idPrefix: string }) {
  return (
    <>
      {docsSections.map((section, index) => (
        <div className="docs-nav-group" key={section.title}>
          <p className="docs-nav-section" id={`${idPrefix}-${index}`}>{section.title}</p>
          <ul aria-labelledby={`${idPrefix}-${index}`}>
            {section.pages.map(page => (
              <li key={page.slug}>
                <a href={docsPath(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** The section navigation beside the page on wide screens; it stays in view while the page scrolls. Without a current page it is the docs home's own sidebar, and "All docs" is the current one. */
export function DocsSidebar({ current, variant = 'instance' }: { current?: string; variant?: SiteVariant }) {
  return (
    <nav className="docs-sidebar" aria-label="Docs">
      <a className="docs-sidebar-home" href="/docs" aria-current={current ? undefined : 'page'}>All docs</a>
      <DocsNavList current={current} idPrefix="docs-sidebar" />
      {variant === 'site' && <a className="docs-sidebar-home docs-sidebar-contract" href={links.contract}>Contract</a>}
    </nav>
  );
}

/** The same navigation on phones and narrow windows: one pill that opens the whole list. */
export function DocsMenu({ current, label }: { current: string; label: string }) {
  return (
    <nav className="docs-menu" aria-label="Docs">
      <details>
        <summary><span>Docs menu</span><span className="docs-menu-current">{label}</span></summary>
        <div className="docs-menu-list"><DocsNavList current={current} idPrefix="docs-menu" /></div>
      </details>
    </nav>
  );
}
