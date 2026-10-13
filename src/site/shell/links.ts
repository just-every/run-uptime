/** Where the public pages point. Plain document links: every public page is rendered on the server. */
export const links = {
  home: '/',
  docs: '/docs',
  run: '/run',
  limits: '/docs/limits',
  source: 'https://github.com/just-every/run-uptime',
  signIn: '/login',
} as const;

/** Where a page is served: an installed instance, or the static run site, which links no instance-only route (Sign in). */
export type SiteVariant = 'instance' | 'site';

export const docsPath = (slug: string) => `/docs/${slug}`;
