import { mountEditor } from './widget/editor-widget';
import { ownerEditorLifecycle } from './lifecycle.ts';
export { configLoader, parseConfig, parseGrant } from './config.ts';
export type { EditorConfig, EditorGrant } from './config.ts';
export type { ConfigLoader } from './lifecycle.ts';
export { installCompiledLiveEdits, setLiveEditsReady } from './widget/live-edit-runtime';
export function createOwnerEditor() { return ownerEditorLifecycle(mountEditor); }
