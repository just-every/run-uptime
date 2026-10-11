import { Marked } from 'marked';
import type { DocsTocEntry } from '../types.ts';
import { createSlugger } from './slug.ts';

// One Markdown page to static HTML, at build time. Raw HTML in the Markdown is shown as text, never passed through.
// Headings get GitHub-style ids, and the page's h2s and h3s become its contents list. Code blocks become the navy code
// card, labelled with their language. Tables scroll inside a focusable region when they cannot fit.

export type RenderedPage = { html: string; toc: DocsTocEntry[]; ids: string[]; links: string[]; problems: string[] };

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const decodeHtml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

const languageNames: Record<string, string> = {
  sh: 'Shell', bash: 'Shell', shell: 'Shell', zsh: 'Shell', console: 'Shell', json: 'JSON', jsonc: 'JSON', js: 'JavaScript',
  javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', yaml: 'YAML', yml: 'YAML', toml: 'TOML', ini: 'INI',
  http: 'HTTP', sql: 'SQL', diff: 'Diff', text: 'Text', txt: 'Text', html: 'HTML', css: 'CSS',
};

export function renderMarkdown(markdown: string): RenderedPage {
  const slug = createSlugger();
  const toc: DocsTocEntry[] = [];
  const ids: string[] = [];
  const links: string[] = [];
  const problems: string[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        if (depth === 1) problems.push('has a level-1 heading; the page title comes from docs/site.json');
        const text = collapse(decodeHtml(this.parser.parseInline(tokens, this.parser.textRenderer)));
        const id = slug(text);
        ids.push(id);
        if (depth === 2 || depth === 3) toc.push({ depth, id, text });
        const level = Math.max(2, depth);
        return `<h${level} id="${id}">${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      code({ text, lang }) {
        const language = (lang ?? '').trim().split(/\s+/)[0].toLowerCase();
        if (!language) problems.push('has a code block without a language');
        const name = languageNames[language] ?? language.toUpperCase();
        const head = `<div class="docs-code-head"><span class="docs-code-lang">${escapeHtml(name || 'Code')}</span><button type="button" class="docs-copy" hidden>Copy</button></div>`;
        const className = language ? ` class="language-${escapeHtml(language)}"` : '';
        return `<div class="docs-code">${head}<pre><code${className}>${escapeHtml(text.replace(/\n$/, ''))}</code></pre></div>\n`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      link({ href, title, tokens }) {
        links.push(href);
        const titled = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(href)}"${titled}>${this.parser.parseInline(tokens)}</a>`;
      },
      image({ href }) {
        problems.push(`has an image (${href}); the docs publish text only`);
        return '';
      },
    },
  });
  const html = (marked.parse(markdown, { async: false }) as string)
    .replace(/<table>/g, '<div class="docs-table" role="region" tabindex="0" aria-label="Table"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return { html, toc, ids, links, problems };
}
