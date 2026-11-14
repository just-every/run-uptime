import { readFileSync } from 'node:fs';
import { startLine, runRequirements } from '../../../base/run-site';
import { run } from '../../run';
import { join } from 'node:path';
import type { DocsBody, DocsSection } from '../types.ts';
import { docsDirectory, manifestPath, readManifest } from './manifest.ts';
import { renderMarkdown } from './render.ts';
import { MONITOR_LIMIT } from '../../../domain/monitor-cap.ts';

// The whole docs site from the tree as it is: every page in docs/site.json rendered, every link to another docs page and
// every anchor checked, and nothing that names a build machine's paths. Any problem fails the build with the full list.

export type DocsSite = { sections: DocsSection[]; bodies: Record<string, DocsBody>; files: string[] };

/** An absolute path on the build machine must never reach a published page. */
const machinePath = /(?<![\w.@~-])\/(?:Users|home|private|tmp|var|Volumes|root)\/[^\s"'`<\\]*/g;

export function buildDocs(root: string): DocsSite {
  // Read the actual editor choices, so the docs include exactly what an owner
  // can select. Watch the template and admission policy alongside the Markdown.
  const editorFile = join(root, 'src/ui/editor.html');
  const editor = readFileSync(editorFile, 'utf8');
  const choices = /<select\b[^>]*name="checkType"[^>]*>([\s\S]*?)<\/select>/.exec(editor)?.[1];
  const kinds = [...(choices ?? '').matchAll(/<option\b[^>]*>([^<]+)<\/option>/g)].map(match => match[1]);
  if (!kinds.length) throw new Error('Docs: monitor editor choices are missing');
  const productValues = (text: string) => text
    .replaceAll('{{monitorKindCount}}', String(kinds.length))
    .replaceAll('{{monitorKinds}}', kinds.join(', '))
    .replaceAll('{{monitorLimit}}', String(MONITOR_LIMIT));
  const sections = readManifest(root).map(section => ({ ...section,
    pages: section.pages.map(page => ({ ...page, summary: productValues(page.summary) })),
  }));
  const pages = sections.flatMap(section => section.pages);
  const files = [join(root, manifestPath), editorFile, join(root, 'src/domain/monitor-cap.ts')];
  const rendered = new Map(pages.map(page => {
    const file = join(root, docsDirectory, page.file);
    files.push(file);
    return [page.slug, renderMarkdown(productValues(readFileSync(file, 'utf8')).replaceAll('{{runStart}}', startLine(run)).replaceAll('{{runAlternative}}', run.clone).replaceAll('{{runRequirements}}', runRequirements))] as const;
  }));
  const problems: string[] = [];
  for (const page of pages) {
    const { html, links, problems: own } = rendered.get(page.slug)!;
    const report = (problem: string) => problems.push(`${docsDirectory}/${page.file}: ${problem}`);
    own.forEach(report);
    for (const href of links) {
      if (/^(?:https?:|mailto:)/i.test(href)) continue;
      const local = /^\/docs(?:\/([^#?/]+))?\/?(?:#(.+))?$/.exec(href);
      const inPage = /^#(.+)$/.exec(href);
      if (inPage) {
        if (!rendered.get(page.slug)!.ids.includes(inPage[1])) report(`links to ${href}, which is not a heading on this page`);
      } else if (!local) report(`links to ${href}; link to other pages as /docs/<slug>, or use a full https:// address`);
      else if (local[1] && !rendered.has(local[1])) report(`links to ${href}, but docs/site.json has no page "${local[1]}"`);
      else if (local[2] && !(local[1] ? rendered.get(local[1])!.ids : []).includes(local[2])) report(`links to ${href}, which is not a heading on that page`);
    }
    for (const leak of new Set(html.match(machinePath) ?? [])) report(`contains ${leak}, a build machine path`);
  }
  if (problems.length) throw new Error(`Docs: ${problems.length} problem(s) in the Markdown:\n- ${problems.join('\n- ')}`);
  const bodies = Object.fromEntries(pages.map(page => {
    const { html, toc } = rendered.get(page.slug)!;
    return [page.slug, { html, toc }];
  }));
  return { sections, bodies, files };
}
