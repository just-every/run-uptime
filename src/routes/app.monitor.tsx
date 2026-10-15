import {createFileRoute} from '@tanstack/react-router'
import {useEffect} from 'react'
import {useEditorLeafReady} from '../base/modules/editor/react.tsx'
// @ts-ignore Vite raw import
import markup from '../ui/editor.html?raw'
function Editor(){useEditorLeafReady('/app/monitor');useEffect(()=>{const script=document.createElement('script');script.src='/editor.js';document.body.appendChild(script);return()=>{script.remove()}},[]);return <><link rel="stylesheet" href="/app-theme.css"/><link rel="stylesheet" href="/editor.css"/><link rel="stylesheet" href="/editor/discovery.css"/><div dangerouslySetInnerHTML={{__html:markup}}/></>}
export const Route=createFileRoute('/app/monitor')({head:()=>({meta:[{title:'Uptime'}],links:[{rel:'icon',href:'/favicon.svg',type:'image/svg+xml'},{rel:'preload',href:'/design-assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2',as:'font',type:'font/woff2',crossOrigin:'anonymous'}]}),component:Editor})
