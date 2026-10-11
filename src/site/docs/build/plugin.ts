import type { Plugin } from 'vite';
import { buildDocs } from './site.ts';

// The docs, rendered from docs/site.json and docs/*.md when Vite loads them, so neither the Worker nor the browser ever
// parses Markdown. `virtual:uptime-docs` exports the sections (with each page's title and summary) and every page's body
// HTML and contents list. A broken link, a missing file or a level-1 heading fails the build.

export const docsModuleId = 'virtual:uptime-docs';
const resolvedId = `\0${docsModuleId}`;

export function docsSite(): Plugin {
  let root = process.cwd();
  return {
    name: 'uptime:docs',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === docsModuleId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;
      const site = buildDocs(root);
      for (const file of site.files) this.addWatchFile(file);
      return `export const sections = ${JSON.stringify(site.sections)};\nexport const bodies = ${JSON.stringify(site.bodies)};\n`;
    },
  };
}
