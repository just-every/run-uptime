/** Data-only wire shapes. Shape checks never grant a negotiated capability. */
import {validLiveEditPath, validLiveEditSnapshot, validLiveEditTarget} from './live-edit-contracts';
import {validSurface} from './editor-surface';
export const protocol = 'rer-editor';
export const protocolVersion = 1;
export const supportedVersions = [1] as const;
export type ConnectionStatus = 'standalone' | 'connecting' | 'connected' | 'incompatible' | 'timeout';
export const compatibilityMessage = 'The page editor could not connect. Reload this page. If this continues, update the application’s editor widget and the editing service together.';
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export const validSession = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
export function validPageElement(value: unknown) {
  if (!object(value) || !exact(value, ['selector','tag','role','text',...(value.navigation === undefined ? [] : ['navigation'])])) return false;
  const {text: beforeText, ...target} = value;
  return validLiveEditTarget({...target,beforeText});
}
function validContext(value: unknown) {
  return object(value) && exact(value,['kind','title','path','elements','limitations']) && value.kind === 'rendered-dom'
    && text(value.title,160) && validLiveEditPath(value.path) && Array.isArray(value.elements) && value.elements.length <= 60 && value.elements.every(validPageElement)
    && Array.isArray(value.limitations) && value.limitations.length <= 10 && value.limitations.every(v => text(v,500)) && JSON.stringify(value).length <= 20000;
}
const editorTypes = new Set(['ready','protocol-accept','close','set-context-sharing','capture-context','live-edits','undo-live-edit','interactive-regions']);
const hostTypes = new Set(['protocol-offer','protocol-connected','editor-visibility','context-sharing','page-location','selection','page-context','context-unavailable','live-edit-result','live-edits-error','submit-draft']);
export function validMessage(value: unknown, from: 'editor' | 'host'): value is Record<string, unknown> {
  if (!object(value) || value.protocol !== protocol || value.version !== protocolVersion || !validId(value.installationId) || typeof value.type !== 'string' || !(from === 'editor' ? editorTypes : hostTypes).has(value.type)) return false;
  const base = ['protocol','version','installationId','type'];
  if (value.type === 'ready') return exact(value,base);
  if (!validSession(value.sessionId)) return false;
  base.push('sessionId');
  const fields = (...keys: string[]) => exact(value,[...base,...keys]);
  switch (value.type) {
    case 'protocol-offer': case 'protocol-accept': case 'protocol-connected': case 'close': case 'submit-draft': return fields();
    case 'set-context-sharing': case 'context-sharing': return fields('enabled') && typeof value.enabled === 'boolean';
    case 'editor-visibility': return fields('open') && typeof value.open === 'boolean';
    case 'capture-context': case 'context-unavailable': return fields(...(value.requestId === undefined ? [] : ['requestId'])) && (value.requestId === undefined || validId(value.requestId));
    case 'live-edits': return fields('snapshot') && validLiveEditSnapshot(value.snapshot);
    case 'undo-live-edit': return fields('id','revision') && validId(value.id) && Number.isSafeInteger(value.revision) && Number(value.revision) > 0;
    case 'interactive-regions': return fields('regions','viewport') && validSurface(value);
    case 'page-location': return fields('path') && validLiveEditPath(value.path);
    case 'selection': return fields('selection') && validPageElement(value.selection);
    case 'page-context': return fields('context',...(value.requestId === undefined ? [] : ['requestId'])) && (value.requestId === undefined || validId(value.requestId)) && validContext(value.context);
    case 'live-edit-result': return fields('id','revision','status','message') && validId(value.id) && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && typeof value.status === 'string' && ['applied','conflict','undone'].includes(value.status) && text(value.message,2000);
    case 'live-edits-error': return fields('message') && text(value.message,2000);
    default: return false;
  }
}
export function trustedPeer(event: Pick<MessageEvent, 'origin' | 'source'>, origin: string, source: Window | null) {
  return source !== null && event.source === source && event.origin === origin;
}
/** Only a trusted peer may diagnose incompatibility; this is never authorization. */
export function incompatibleHandshake(value: unknown, installationId: string, type: 'ready' | 'protocol-offer') {
  return object(value) && validId(value.installationId) && value.installationId === installationId && value.type === type
    && Object.keys(value).every(key => ['protocol','version','installationId','type',...(type === 'protocol-offer' ? ['sessionId'] : [])].includes(key))
    && (value.protocol === protocol || value.protocol === 'rer-editor-v1') && value.version !== undefined && value.version !== protocolVersion;
}
export function envelope(installationId: string, type: string, sessionId: string | null, payload: Record<string, unknown> = {}) {
  return {...payload,protocol,version:protocolVersion,installationId,type,...(sessionId ? {sessionId} : {})};
}
