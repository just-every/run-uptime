// The console document, served for the monitor list (/app) and each monitor's page (/app/monitors/<id>). public/app.js
// reads the path and renders the view; the markup is edition-owned trusted static markup, and all runtime data is escaped.
// @ts-ignore Vite raw asset import
import markup from './console.html?raw'
import {useEditorLeafReady} from '../base/modules/editor/react.tsx'
export function ConsoleDocument(){useEditorLeafReady('/app');return <><link rel="stylesheet" href="/app-theme.css"/><link rel="stylesheet" href="/style.css"/><link rel="stylesheet" href="/notifications.css"/><div dangerouslySetInnerHTML={{__html:markup}}/><script type="module" src="/app.js" data-uptime="true"/></>}
export const consoleHead=()=>({meta:[{title:'Uptime & API monitoring'}],links:[{rel:'icon',href:'/favicon.svg',type:'image/svg+xml'},{rel:'preload',href:'/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2',as:'font',type:'font/woff2',crossOrigin:'anonymous' as const}]})
