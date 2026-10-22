import {createFileRoute} from '@tanstack/react-router'
import {useEffect,useState} from 'react'
import {useEditorLeafReady} from '../base/modules/editor/react.tsx'
// @ts-ignore Bundled browser module, mounted only after hydration.
import {mountMonitorEditor} from '../editor/monitor/index.mjs'
// @ts-ignore Vite raw import
import markup from '../ui/editor.html?raw'
// @ts-ignore Edition browser markup, also used during server rendering.
import {initialMarkup} from '../editor/monitor/initial-markup.mjs'
function Editor(){
 const {initialSearch}=Route.useLoaderData()
 // Hydrate the server's route snapshot. Discovery can subsequently update the
 // browser URL without replacing the editor's already mounted, editable DOM.
 const [content]=useState(()=>({__html:initialMarkup(markup,initialSearch)}))
 useEditorLeafReady('/app/monitor')
 useEffect(()=>{
  const controller=new AbortController()
  void mountMonitorEditor(controller.signal)
  return()=>{controller.abort();document.documentElement.classList.remove('editor-ready','editor-context-ready')}
 },[])
 return <><link rel="stylesheet" href="/app-theme.css" precedence="default"/><link rel="stylesheet" href="/editor.css"/><link rel="stylesheet" href="/editor/discovery.css"/><link rel="stylesheet" href="/editor/catalog.css"/><div dangerouslySetInnerHTML={content}/></>
}
export const Route=createFileRoute('/app/monitor')({
 loader:({location})=>({initialSearch:location.searchStr}),
 head:()=>({meta:[{title:'Uptime'}],links:[{rel:'icon',href:'/favicon.svg',type:'image/svg+xml'},{rel:'preload',href:'/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2',as:'font',type:'font/woff2',crossOrigin:'anonymous'}]}),
 component:Editor,
})
