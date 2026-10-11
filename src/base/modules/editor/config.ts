/** Non-secret, short-lived config returned only after native owner authorization. */
export interface EditorConfig { enabled: boolean; managementOrigin: string; installationId: string }
export interface EditorGrant { config: EditorConfig; expiresAt: number }
export function parseConfig(value: unknown): EditorConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid editor config');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'enabled,installationId,managementOrigin' || typeof data.enabled !== 'boolean' || typeof data.managementOrigin !== 'string' || typeof data.installationId !== 'string') throw new Error('Invalid editor config');
  let url: URL;
  try { url = new URL(data.managementOrigin); } catch { throw new Error('Invalid management origin'); }
  if (url.origin !== data.managementOrigin || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Invalid management origin');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(data.installationId)) throw new Error('Invalid installation id');
  return { enabled: data.enabled, managementOrigin: data.managementOrigin, installationId: data.installationId };
}
export function parseGrant(value: unknown, now = Date.now()): EditorGrant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid editor grant');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).sort().join(',') !== 'config,expiresAt' || typeof data.expiresAt !== 'number' || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + 60_000) throw new Error('Expired or invalid editor grant');
  return { config: parseConfig(data.config), expiresAt: data.expiresAt };
}
/** Same-origin config only. Reject endpoint input before issuing any request. */
export function configLoader(endpoint: string, applicationOrigin: string) {
  const url = new URL(endpoint, applicationOrigin);
  if (url.origin !== applicationOrigin || !endpoint.startsWith('/') || endpoint.startsWith('//') || url.hash || url.username || url.password) throw new Error('Editor config must be same-origin');
  return async (signal: AbortSignal): Promise<unknown> => {
    const response = await fetch(url, { signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Editor authorization unavailable (${response.status})`);
    return response.json();
  };
}
