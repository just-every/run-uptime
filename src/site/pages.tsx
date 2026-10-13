import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site';
import { identity } from '../identity';
import { DocsArticle } from './docs/DocsArticle';
import { DocsIndex } from './docs/DocsIndex';
import { docsHead, docsPages } from './docs/pages';
import { Landing } from './landing/Landing';
import { run } from './run';

/** The run site (run-uptime.com), built by `rer build --site`: the approved homepage, the Run page, the docs and a 404. */
export function sitePages({ styles }: SiteContext): SiteBuild {
  const document = (title: string, description: string | undefined, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}</body>
    </html>,
  );
  const head = (slug?: string) => {
    const rows = (docsHead(slug) as { meta?: Record<string, string>[] }).meta ?? [];
    return [rows.find(row => row.title)?.title ?? 'Docs · Uptime', rows.find(row => row.name === 'description')?.content] as const;
  };
  return {
    pages: [
      { path: '/', html: document('Uptime — Sleep through the night', identity.tagline, <Landing />) },
      { path: '/run', html: runPageHtml(identity, run) },
      { path: '/docs', html: document(...head(), <DocsIndex variant="site" />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(...head(page.slug), <DocsArticle slug={page.slug} variant="site" />) })),
      { path: '/404', html: siteNotFoundHtml(identity, run) },
    ],
    assets: ['rer-theme.css', 'brand', 'design-assets', 'favicon.svg'],
  };
}
