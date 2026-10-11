/** Where the public pages point. Plain document links: every public page is rendered on the server. */
export const links = {
  home: '/',
  docs: '/docs',
  install: '/docs/install',
  limits: '/docs/limits',
  source: 'https://github.com/just-every/uptime-monitor',
  signIn: '/login',
} as const;

export const docsPath = (slug: string) => `/docs/${slug}`;
