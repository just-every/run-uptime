import type { Token, Tokens } from 'marked';
import { headingSections } from '../../../base/modules/site/docs-search/sections';

// The exact tokens rendered by Marked, with the ids assigned during that render.
// Keep block boundaries so changing one paragraph invalidates only its chunk.
function text(token: Token): string {
  if (token.type === 'table') {
    const table = token as Tokens.Table;
    return [table.header, ...table.rows].map(row => row.map(cell => cell.tokens.map(text).join('')).join(' | ')).join('\n');
  }
  if (token.type === 'list') return (token as Tokens.List).items.map(item => item.tokens.map(text).join('\n')).join('\n');
  if ('tokens' in token && Array.isArray(token.tokens)) return token.tokens.map(text).join('');
  return 'text' in token ? String(token.text) : '';
}

export function searchSections(tokens: Token[], ids: Map<Token, string>, title: string) {
  return headingSections(tokens.map(token => ({
    type: 'element',
    ...(ids.has(token) ? { tagName: `h${(token as Tokens.Heading).depth}`, properties: { id: ids.get(token) } } : {}),
    children: [{ type: 'text', value: text(token) }],
  })), title, 'docs-title');
}
