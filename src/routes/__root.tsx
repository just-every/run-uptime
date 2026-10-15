import { HeadContent, Outlet, Scripts, createRootRoute, lazyRouteComponent, useRouterState } from '@tanstack/react-router'
import {OwnerEditorShell} from '../editor/owner-editor.tsx'
import {useEditorLeafReady} from '../base/modules/editor/react.tsx'
import {introCss,introGuardScript} from '../base/hydration/intro-guard.ts'
// Lazy, so the public site's styles stay out of the root chunk and never reach the console's documents.
const SiteNotFound=lazyRouteComponent(() => import('../site/shell/NotFound.tsx'), 'NotFound')
function NotFound(){useEditorLeafReady('not-found');return <SiteNotFound/>}
// The owner editor belongs to the private console documents under /app; the public landing and docs never mount it.
function ConsoleEditor(){const path=useRouterState({select:state=>state.location.pathname});return path==='/app'||path.startsWith('/app/')?<OwnerEditorShell/>:null}

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: 'Uptime' }, { charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }], title: 'Uptime' }),
  notFoundComponent: NotFound,
  // Base's intro guard, early in <head> (src/base/hydration/README.md).
  component: () => <html lang="en"><head><script dangerouslySetInnerHTML={{__html:introGuardScript}}/><style>{introCss}</style><HeadContent /></head><body><Outlet /><ConsoleEditor/><Scripts /></body></html>,
})
