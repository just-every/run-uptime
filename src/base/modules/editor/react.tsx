import { useEffect, useLayoutEffect, useRef } from 'react';
import { createOwnerEditor, type ConfigLoader, setLiveEditsReady } from './index';
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
/** Native shell must also call revoke synchronously when its session changes. */
export function OwnerEditor({ authorized, load, onError }: { authorized: boolean; load: ConfigLoader; onError: (error: unknown) => void }) {
  useClientLayoutEffect(() => {
    const editor = createOwnerEditor();
    editor.setOwner(authorized);
    void editor.refresh(load).catch(onError);
    return () => editor.dispose();
  }, [authorized, load, onError]);
  return null;
}
/** Place inside the rendered route leaf, after lazy content has hydrated. */
export function useEditorLeafReady(routeKey: string) {
  const epoch = useRef(0);
  useClientLayoutEffect(() => {
    const current = ++epoch.current;
    // Layout effects complete before this microtask; cleanup invalidates stale leaves.
    queueMicrotask(() => { if (epoch.current === current) setLiveEditsReady(true); });
    return () => { epoch.current++; setLiveEditsReady(false); };
  }, [routeKey]);
}
