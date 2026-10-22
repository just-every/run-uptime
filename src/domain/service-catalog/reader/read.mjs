// DEPENDENCY-002: the one reader of catalog status sources, shared by the follow-time live check and every scheduled check of
// a followed service. It sends one read-only GET to an address the catalog names, through the transport it is given (the
// runner's pinned public sockets, or a hosted demo's Worker fetch), never follows a redirect, and streams the answer into the
// format's parser as it arrives. It stops at STATUS_SOURCE_READ_LIMIT: a longer document is never read past the bound and is a
// problem, as are a redirect, an answer other than 200 and a document without the expected shape. Only derived facts return.
import {reading} from './formats.mjs';
export const STATUS_SOURCE_READ_LIMIT = 1024 * 1024;
export const CATALOG_USER_AGENT = 'UptimeCatalogCheck/0.2 (+https://github.com/just-every/run-uptime; one read-only GET per catalog status source)';
export const CHECK_PROBLEMS = ['unreachable', 'moved', 'shape', 'too-large', 'component-missing'];
const ACCEPT = 'application/json, application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.1';
const REDIRECTS = [301, 302, 303, 307, 308];
const readableCategory = {timeout: 'did not answer in time', connection: 'refused the connection', unresolved: 'has no DNS address', dns: 'could not be looked up', network: 'resolves to a private address', redirect: 'redirected in a way that cannot be followed', encoding: 'compressed its answer', transport: 'broke the connection'};
export const problem = (kind, detail) => ({problem: kind, detail: detail.slice(0, 200)});
// read(url, format, want) -> {result, bytes} (result null: not the expected shape) or a problem. An abort of `signal` is rethrown;
// `timeoutMs` bounds one exchange, and running out of it is the source not answering.
export function statusSourceReader({transport, signal, timeoutMs = 8000}) {
  return async (url, format, want = {}) => {
    const {parser, result} = reading(format, want), decoder = new TextDecoder();
    let broken = false, response;
    const onChunk = chunk => {
      if (broken) return false;
      try { parser.write(decoder.decode(chunk, {stream: true})); return true; } catch { broken = true; return false; }
    };
    try {
      response = await transport(url, {signal, accept: ACCEPT, userAgent: CATALOG_USER_AGENT, maxBody: STATUS_SOURCE_READ_LIMIT, maxHops: 0, hopTimeoutMs: timeoutMs, followRedirect: () => false, onChunk});
    } catch (error) {
      if (signal?.aborted) throw error;
      return problem('unreachable', `The source ${readableCategory[error?.category] ?? 'did not answer'}.`);
    }
    if (response.redirect || REDIRECTS.includes(response.status)) return problem('moved', `The source answered ${response.status} and now points elsewhere.`);
    if (response.truncated) return problem('too-large', `The source is larger than the ${STATUS_SOURCE_READ_LIMIT / 1048576} MiB a check reads.`);
    if (response.status !== 200) return problem('unreachable', `The source answered ${response.status}.`);
    if (!broken) try { parser.write(decoder.decode()); parser.end(); } catch { broken = true; }
    return {result: broken ? null : result(), bytes: response.bytes};
  };
}
