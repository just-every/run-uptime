/** Authenticated-shell parent bridge. No credentials or remote script execution. */
import { normalizeLiveText, validLiveEditPath } from './live-edit-contracts';
import { connectLiveEdits } from './live-edit-runtime';
import { surfaceClip } from './editor-surface';
import { editorIconPaths, editorIconViewBox, editorIconStrokeWidth } from './editor-icons';
import { renderedText } from './live-edit-dom';
export type EditorConfig = { enabled: boolean; managementOrigin: string; installationId: string };
export {protocol} from './editor-protocol';
import {validMessage, trustedPeer, incompatibleHandshake, envelope, compatibilityMessage, type ConnectionStatus} from './editor-protocol';
export function validOrigin(value: string) {
  try { const url = new URL(value); return url.origin === value && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))); } catch { return false; }
}
export function acceptsMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, origin: string, source: Window | null, installationId: string) {
  return trustedPeer(event,origin,source) && validMessage(event.data,'editor') && event.data.installationId === installationId;
}
export function selectedElement(element: Element, reviewedText: string) {
  // Structural paths deliberately omit IDs, classes, attributes and DOM text.
  const parts: string[] = [];
  let cursor: Element | null = element;
  while (cursor && parts.length < 6) {
    const tag = cursor.tagName.toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(tag)) break;
    const index: number = cursor.parentElement ? Array.from(cursor.parentElement.children).indexOf(cursor) + 1 : 1;
    parts.unshift(`${tag}:nth-child(${index})`); cursor = cursor.parentElement;
  }
  const role = element.getAttribute('role') || '';
  let navigation: {href:string} | undefined;
  if (element.tagName.toLowerCase() === 'a' && element.closest?.('nav')) {
    try { const href = new URL(element.getAttribute('href') || '',window.location.origin); if (href.origin === window.location.origin && !href.search && !href.hash && validLiveEditPath(href.pathname)) navigation = {href:href.pathname}; } catch {}
  }
  return { ...(navigation ? {navigation} : {}), selector: parts.join(' > ').slice(0,500), tag: element.tagName.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,40), role: /^[a-z-]{1,40}$/.test(role) ? role : '', text: normalizeLiveText(normalizeLiveText(reviewedText.replace(/[\u0000-\u001f\u007f]/g,' ')).slice(0,240)) };
}
export function mountEditor(config: EditorConfig, authorized: boolean): () => void {
  config = {...config};
  if (authorized !== true || config.enabled !== true || !validOrigin(config.managementOrigin) || !/^[a-zA-Z0-9_-]{1,100}$/.test(config.installationId)) return () => {};
  const host = document.createElement('div');
  host.dataset.rerEditor = 'v1';
  Object.assign(host.style, {position:'fixed',bottom:'20px',right:'20px',zIndex:'2147483647'});
  const root = host.attachShadow({mode:'open'});
  const launcher = document.createElement('button'); launcher.setAttribute('aria-label','Open Run Edit Run'); launcher.title = 'Open Run Edit Run — send a draft with Cmd/Ctrl+Shift+Enter'; launcher.type = 'button';
  Object.assign(launcher.style,{position:'relative',zIndex:'1',width:'48px',height:'48px',padding:'0',display:'grid',placeItems:'center',borderRadius:'50%',background:'#3979ed',color:'white',border:'1px solid white',cursor:'pointer'});
  root.append(launcher); document.body.appendChild(host);
  let frame: HTMLIFrameElement | null = null;
  let isOpen = false, sharing = false, disposed = false;
  let sessionId: string | null = null, state: ConnectionStatus = 'connecting';
  let negotiationTimer: ReturnType<typeof setTimeout> | undefined;
  const notice = document.createElement('div'); notice.setAttribute('role','status'); notice.dataset.rerCompatibility = '';
  Object.assign(notice.style,{position:'fixed',bottom:'80px',right:'20px',maxWidth:'min(340px, calc(100vw - 40px))',boxSizing:'border-box',padding:'16px',borderRadius:'12px',background:'#fff',color:'#182b48',boxShadow:'0 3px 20px #10203040',font:'14px/1.5 system-ui',zIndex:'2'});
  root.append(notice);
  const status = (next: ConnectionStatus) => { state = next; host.dataset.connection = next; notice.textContent = next === 'connecting' ? 'Connecting the page editor…' : compatibilityMessage; notice.hidden = !isOpen || next === 'connected'; };
  const wire = (type: string, payload: Record<string,unknown> = {}) => {
    const message = envelope(config.installationId,type,sessionId,payload);
    if (!disposed && validMessage(message,'host')) frame?.contentWindow?.postMessage(message,config.managementOrigin);
  };
  const send = (type: string, payload: Record<string,unknown>) => { if (state === 'connected') wire(type,payload); };
  const begin = () => {
    clearTimeout(negotiationTimer); sharing = false; live.clearCapture(); sessionId = crypto.randomUUID(); status('connecting');
    if (frame) frame.style.clipPath = 'inset(100%)';
    wire('protocol-offer');
    negotiationTimer = setTimeout(() => { sessionId = null; status('timeout'); },5000);
  };
  let initialLoad = true;
  const loaded = () => {
    const diagnosedDuringInitialLoad = initialLoad && state === 'incompatible';
    initialLoad = false;
    // Ready can arrive before the document's load. Keep its diagnosis for that
    // document; subsequent loads must still retire the old session and authority.
    if (!diagnosedDuringInitialLoad) begin();
  };
  const live = connectLiveEdits(result => send('live-edit-result',result));
  const remember = (element: Element,text:string) => { const selection = selectedElement(element,text); live.remember(window.location.pathname,{selector:selection.selector,tag:selection.tag,role:selection.role,beforeText:selection.text,...(selection.navigation ? {navigation:selection.navigation} : {})},element); return selection; };
  let lastPath = window.location.pathname;
  const locationChanged = () => { if (lastPath !== window.location.pathname) { lastPath = window.location.pathname; live.clearCapture(); if (state === 'connected') begin(); live.reconcile(); } };
  const observer = new MutationObserver(locationChanged);
  observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('popstate',locationChanged);
  const toggleIcon = (open: boolean) => {
    const well = document.createElement('span'); Object.assign(well.style,{display:'grid',placeItems:'center',width:'36px',height:'36px',borderRadius:'50%',background:open?'#edf3ff':'transparent'});
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:editorIconViewBox,width:'20',height:'20','aria-hidden':'true',fill:'none',stroke:'currentColor','stroke-width':String(editorIconStrokeWidth),'stroke-linecap':'round','stroke-linejoin':'round'})) svg.setAttribute(key,value);
    for(const d of editorIconPaths[open?'close':'open']) { const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',d); svg.appendChild(path); }
    well.appendChild(svg); launcher.replaceChildren(well);
  };
  const updateToggle = () => { Object.assign(launcher.style,{background:isOpen?'transparent':'#3979ed',color:isOpen?'#324a7d':'white',border:isOpen?'1px solid transparent':'1px solid white',boxShadow:'none'}); toggleIcon(isOpen); launcher.setAttribute('aria-label',isOpen ? 'Close Run Edit Run' : 'Open Run Edit Run'); launcher.setAttribute('aria-expanded',String(isOpen)); launcher.title = isOpen ? 'Close Run Edit Run' : 'Open Run Edit Run — send a draft with Cmd/Ctrl+Shift+Enter'; };
  const close = () => { isOpen = false; sharing = false; live.clearCapture(); status(state); updateToggle(); send('context-sharing',{enabled:false}); send('editor-visibility',{open:false}); if (frame) frame.hidden = true; launcher.hidden = false; if (state === 'connected') begin(); };
  const receive = (event: MessageEvent) => {
    if (!trustedPeer(event,config.managementOrigin,frame?.contentWindow || null)) return;
    if (state !== 'connected' && incompatibleHandshake(event.data,config.installationId,'ready')) { clearTimeout(negotiationTimer); sessionId = null; status('incompatible'); return; }
    const d = event.data;
    if (!d || typeof d !== 'object') return;
    // Unversioned discovery asks for the same v1 challenge; it grants no capability.
    if (d.protocol === 'rer-editor-v1' && d.type === 'ready' && d.version === undefined && d.installationId === config.installationId && Object.keys(d).sort().join(',') === 'installationId,protocol,type') { if (state !== 'connected') wire('protocol-offer'); return; }
    if (!acceptsMessage(event,config.managementOrigin,frame?.contentWindow || null,config.installationId)) return;
    if (d.type === 'ready') { if (state === 'connected') return; if (sessionId) wire('protocol-offer'); else begin(); return; }
    if (d.type === 'protocol-accept') {
      if (!sessionId || d.sessionId !== sessionId || state !== 'connecting') return;
      clearTimeout(negotiationTimer); status('connected'); wire('protocol-connected');
      send('context-sharing',{enabled:false}); send('page-location',{path:window.location.pathname}); send('editor-visibility',{open:isOpen}); return;
    }
    locationChanged();
    if (state !== 'connected' || d.sessionId !== sessionId) return;
    if (d.type === 'interactive-regions' && frame && Math.abs(d.viewport.width-window.innerWidth) <= 1 && Math.abs(d.viewport.height-window.innerHeight) <= 1) { frame.style.clipPath = surfaceClip(d.regions); }
    if (d.type === 'set-context-sharing') { sharing = d.enabled && isOpen; if (!sharing) live.clearCapture(); send('context-sharing',{enabled:sharing}); }
    if (d.type === 'capture-context') {
      if (!sharing || !isOpen) { send('context-unavailable',{...(d.requestId ? {requestId:d.requestId} : {})}); return; }
      send('context-sharing',{enabled:sharing});
      live.clearCapture();
      const elements = Array.from(document.body.querySelectorAll('h1,h2,h3,p,button,a,label,li,th,td')).filter(el => !host.contains(el) && !el.closest('input,textarea,select,[contenteditable],[data-rer-private],[hidden],[aria-hidden="true"]') && (el as HTMLElement).getClientRects().length > 0).slice(0,60).map(el => remember(el,renderedText(el)));
      const context = {kind:'rendered-dom',title:document.title.slice(0,160),path:window.location.pathname.slice(0,300),elements,limitations:['Visible DOM text only; not a screenshot.','At most 60 elements; input values and private-marked elements excluded.']};
      while (JSON.stringify(context).length > 20000 && context.elements.length) context.elements.pop();
      send('page-context',{...(d.requestId ? {requestId:d.requestId} : {}),context});
    }
    if (d.type === 'live-edits') {
      try { live.hydrate(d.snapshot); }
      catch(error) { send('live-edits-error',{message:error instanceof Error ? error.message : 'Snapshot rejected.'}); }
    }
    if (d.type === 'undo-live-edit' && isOpen) {
      try { live.undo(d.id,d.revision); }
      catch(error) { send('live-edit-result',{id:d.id,revision:d.revision,status:'conflict',message:error instanceof Error ? error.message : 'Undo failed.'}); }
    }
    if (event.data.type === 'close') close();
  };
  const open = (visible = true) => {
    isOpen = visible; status(state); updateToggle();
    if (frame) { frame.hidden = !visible; launcher.hidden = false; send('editor-visibility',{open:visible}); return; }
    frame = document.createElement('iframe'); frame.title = 'Run Edit Run editor';
    frame.src = `${config.managementOrigin}/editor?${new URLSearchParams({installation:config.installationId,parentOrigin:window.location.origin,surface:'floating'})}`;
    frame.referrerPolicy = 'no-referrer'; frame.allow = `microphone ${config.managementOrigin}; autoplay ${config.managementOrigin}; fullscreen ${config.managementOrigin}`; frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    Object.assign(frame.style,{position:'fixed',zIndex:'0',inset:'0',width:'100vw',height:'100dvh',border:'0',background:'transparent',clipPath:'inset(100%)'});
    frame.addEventListener('load',loaded);
    frame.hidden = !visible; root.append(frame); begin(); launcher.hidden = false;
  };
  launcher.onclick = () => { if (isOpen) close(); else open(); };
  const submitShortcut = (event: KeyboardEvent) => {
    locationChanged();
    if (state !== 'connected' || !isOpen || event.repeat || event.isComposing || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.altKey || !event.shiftKey) return;
    event.preventDefault(); event.stopPropagation(); send('submit-draft',{});
  };
  window.addEventListener('keydown',submitShortcut,true);
  const resize = () => { if (frame) frame.style.clipPath = 'inset(100%)'; send('editor-visibility',{open:isOpen}); };
  window.addEventListener('resize',resize);
  window.addEventListener('message',receive);
  open(false);
  return () => { close(); disposed = true; sessionId = null; clearTimeout(negotiationTimer); frame?.removeEventListener('load',loaded); launcher.onclick = null; frame?.remove(); live.disconnect(); observer.disconnect(); window.removeEventListener('popstate',locationChanged); window.removeEventListener('message',receive); window.removeEventListener('resize',resize); window.removeEventListener('keydown',submitShortcut,true); host.remove(); };
}
