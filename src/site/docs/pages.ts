import { bodies, sections } from 'virtual:uptime-docs';
import type { DocsPage, DocsPageMeta, DocsSection } from './types';

// The published docs, parsed from docs/site.json and rendered at build time (build/plugin.ts), and lookups over them.

export const docsSections: DocsSection[] = sections;
export const docsPages: DocsPageMeta[] = sections.flatMap(section => section.pages);

/** Whether `slug` is a published page; the docs route answers 404 for anything else. */
export function hasDocsPage(slug: string): boolean {
  return Object.hasOwn(bodies, slug);
}

/** The page with its body and contents list, or undefined for an unknown slug. */
export function getDocsPage(slug: string): DocsPage | undefined {
  const meta = docsPages.find(page => page.slug === slug);
  return meta && hasDocsPage(slug) ? { ...meta, ...bodies[slug] } : undefined;
}

/** The pages before and after `slug` in reading order, across sections. */
export function docsNeighbours(slug: string): { previous?: DocsPageMeta; next?: DocsPageMeta } {
  const index = docsPages.findIndex(page => page.slug === slug);
  return index === -1 ? {} : { previous: docsPages[index - 1], next: docsPages[index + 1] };
}

/** Document title and description for a docs route's head(): the docs home without a slug, a page with one. */
export function docsHead(slug?: string) {
  const page = slug === undefined ? undefined : docsPages.find(entry => entry.slug === slug);
  if (slug !== undefined && !page) return {};
  return {
    meta: page
      ? [{ title: `${page.title} · Uptime docs` }, { name: 'description', content: page.summary }]
      : [{ title: 'Docs · Uptime' }, { name: 'description', content: docsLead }],
  };
}

export const docsLead = 'Install Uptime, run its private runner, and read the evidence it keeps, from your first local install to your own Cloudflare account.';
