import {useEffect,useState} from 'react'
import {useLocation} from '@tanstack/react-router'
import {useEditorLeafReady} from '../base/modules/editor/react.tsx'
// @ts-ignore Edition browser modules.
import {mountMonitorEditor} from '../editor/monitor/index.mjs'
// @ts-ignore Vite raw import.
import markup from './editor.html?raw'
// @ts-ignore Edition browser markup shared with server rendering.
import {initialMarkup} from '../editor/monitor/initial-markup.mjs'
export function MonitorEditorDocument(){
 const path=useLocation({select:location=>location.pathname})
 return <Editor key={path} path={path}/>
}
function Editor({path}:{path:string}){
 const [content]=useState(()=>({__html:initialMarkup(markup,path)}))
 useEditorLeafReady(path)
 useEffect(()=>{
  const controller=new AbortController()
  void mountMonitorEditor(controller.signal)
  return()=>{controller.abort();document.documentElement.classList.remove('editor-ready','editor-context-ready')}
 },[])
 return <><link rel="stylesheet" href="/app-theme.css" precedence="default"/><link rel="stylesheet" href="/editor.css"/><link rel="stylesheet" href="/editor/discovery.css"/><div dangerouslySetInnerHTML={content}/></>
}
export const monitorEditorHead=()=>({meta:[{title:'Uptime'}],links:[{rel:'icon',href:'/favicon.svg',type:'image/svg+xml'},{rel:'preload',href:'/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2',as:'font',type:'font/woff2',crossOrigin:'anonymous' as const}]})
