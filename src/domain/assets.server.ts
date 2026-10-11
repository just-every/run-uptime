// Only emitted static resources are public. Documents and Start transport always
// pass through the owner-session boundary before invoking the framework.
const publicFiles=new Set(['/app.js','/console-format.js','/monitor-coverage.js','/monitor-page.js','/monitor-timeline.js','/notifications.js','/notification-dialogs.js','/editor-units.mjs','/editor.js','/app-theme.css','/style.css','/notifications.css','/editor.css','/action-feedback.mjs','/editor-definition.mjs','/availability.mjs','/favicon.ico','/favicon.svg']);
export function isPublicAsset(path:string){return publicFiles.has(path)||path.startsWith('/assets/')||path.startsWith('/design-assets/')}
