import { notFound } from '@tanstack/react-router';
import { HydrationUnit } from '../../base/hydration/unit';
import type { SiteVariant } from '../shell/links';
import { SiteFooter } from '../shell/SiteFooter';
import { SiteFrame } from '../shell/SiteFrame';
import { SiteHeader } from '../shell/SiteHeader';
import { DocsDawn } from './DocsDawn';
import { DocsMenu, DocsSidebar } from './DocsNav';
import { DocsPager } from './DocsPager';
import { DocsToc, DocsTocCompact } from './DocsToc';
import { docsNeighbours, getDocsPage } from './pages';
import { TitleDots } from './TitleDots';
import { useCopyButtons } from './useCopyButtons';
import './styles';

/**
 * One docs page: the section sidebar, the article rendered from Markdown at build time, and "On this page". Previous and
 * next cards close the article. An unknown slug is a 404 (the route checks hasDocsPage first).
 */
export function DocsArticle({ slug, variant = 'instance' }: { slug: string; variant?: SiteVariant }) {
  const page = getDocsPage(slug);
  const copyButtons = useCopyButtons();
  if (!page) throw notFound();
  const { previous, next } = docsNeighbours(slug);
  return (
    <SiteFrame className="ut-docs">
      <DocsDawn />
      <HydrationUnit><SiteHeader current="docs" variant={variant} /></HydrationUnit>
      <div className="ut-wrap docs-shell">
        <HydrationUnit><DocsSidebar current={slug} /></HydrationUnit>
        <main id="main" className="docs-main">
          <HydrationUnit><DocsMenu current={slug} label={page.title} /></HydrationUnit>
          <HydrationUnit>
          <article className="docs-article" aria-labelledby="docs-title">
            <header className="docs-page-head">
              <p className="ut-eyebrow docs-eyebrow">{page.section}</p>
              <h1 id="docs-title" className="docs-title">{page.title}</h1>
              <TitleDots />
            </header>
            <DocsTocCompact toc={page.toc} />
            <div className="docs-prose" ref={copyButtons} dangerouslySetInnerHTML={{ __html: page.html }} />
          </article>
          </HydrationUnit>
          <HydrationUnit><DocsPager previous={previous} next={next} /></HydrationUnit>
        </main>
        <HydrationUnit><DocsToc toc={page.toc} /></HydrationUnit>
      </div>
      <HydrationUnit><SiteFooter variant={variant} /></HydrationUnit>
    </SiteFrame>
  );
}
