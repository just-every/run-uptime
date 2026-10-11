import { parseGrant, type EditorConfig } from './config.ts';
export type ConfigLoader = (signal: AbortSignal) => Promise<unknown>;
export type Mount = (config: EditorConfig, authorized: boolean) => () => void;
/** A shell owns one controller. The mount argument is the copied widget entry. */
export function ownerEditorLifecycle(mount: Mount) {
  let authorized = false, disposed = false, generation = 0;
  let abort: AbortController | undefined, unmount: (() => void) | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let mountedConfig: EditorConfig | undefined, expiresAt = 0;
  const cancelLoad = () => {
    generation++; abort?.abort(); abort = undefined;
  };
  const clearMount = () => {
    clearTimeout(expiry); expiry = undefined;
    mountedConfig = undefined; expiresAt = 0;
    const cleanup = unmount; unmount = undefined; cleanup?.();
  };
  const clear = () => { cancelLoad(); clearMount(); };
  return {
    /** Call synchronously on logout, owner replacement, session expiry or config loss. */
    setOwner(value: boolean) { clear(); authorized = value === true && !disposed; },
    async refresh(load: ConfigLoader): Promise<'mounted' | 'disabled' | 'stale' | 'unauthorized'> {
      cancelLoad();
      if (!authorized || disposed) return 'unauthorized';
      if (mountedConfig && expiresAt <= Date.now()) clearMount();
      const current = generation, controller = new AbortController(); abort = controller;
      try {
        const data = await load(controller.signal);
        if (current !== generation || disposed || !authorized) return 'stale';
        const grant = parseGrant(data);
        if (!grant.config.enabled) { clearMount(); return 'disabled'; }
        // Revalidation cannot extend the old lease until a valid grant arrives.
        // Equivalent config keeps the widget's iframe, session and private draft.
        if (mountedConfig && expiresAt <= Date.now()) clearMount();
        if (!mountedConfig || mountedConfig.enabled !== grant.config.enabled
          || mountedConfig.managementOrigin !== grant.config.managementOrigin
          || mountedConfig.installationId !== grant.config.installationId) {
          clearMount();
          mountedConfig = { ...grant.config };
          unmount = mount(grant.config, true);
        }
        clearTimeout(expiry);
        expiresAt = grant.expiresAt;
        expiry = setTimeout(clear, Math.max(0, expiresAt - Date.now()));
        return 'mounted';
      } catch (error) {
        if (current !== generation || controller.signal.aborted) return 'stale';
        clear(); throw error;
      } finally { if (abort === controller) abort = undefined; }
    },
    revoke() { clear(); },
    dispose() { clear(); authorized = false; disposed = true; },
  };
}
