import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import {installCompiledLiveEdits,setLiveEditsReady} from './base/modules/editor/index.ts'
import edits from './editor/visual-edits.json'

export function getRouter() {
  if(typeof document!=='undefined'){setLiveEditsReady(false);installCompiledLiveEdits(edits)}
  return createRouter({ routeTree, scrollRestoration: true })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
