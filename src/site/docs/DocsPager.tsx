import { Icon } from '../shell/Icon';
import { docsPath } from '../shell/links';
import type { DocsPageMeta } from './types';

/** The previous and next pages in reading order, as two cards. */
export function DocsPager({ previous, next }: { previous?: DocsPageMeta; next?: DocsPageMeta }) {
  if (!previous && !next) return null;
  return (
    <nav className="docs-pager" aria-label="Previous and next pages">
      {previous && (
        <a className="ut-card docs-pager-card docs-pager-card--previous" href={docsPath(previous.slug)} rel="prev">
          <span className="docs-pager-label"><Icon name="arrow" />Previous</span>
          <span className="docs-pager-title">{previous.title}</span>
        </a>
      )}
      {next && (
        <a className="ut-card docs-pager-card docs-pager-card--next" href={docsPath(next.slug)} rel="next">
          <span className="docs-pager-label">Next<Icon name="arrow" /></span>
          <span className="docs-pager-title">{next.title}</span>
        </a>
      )}
    </nav>
  );
}
