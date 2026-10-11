import {publicPath} from './public-paths.ts'

// The manifest is the same declaration used by the Worker admission boundary.
// ASSETS still decides whether a declared resource actually exists.
export function isPublicAsset(path:string){return publicPath(path)?.kind==='asset'}
