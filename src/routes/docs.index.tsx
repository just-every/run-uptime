import {createFileRoute} from '@tanstack/react-router'
import {DocsIndex} from '../site/docs/DocsIndex.tsx'
export const Route=createFileRoute('/docs/')({head:()=>({meta:[{title:'Docs · Uptime'}]}),component:DocsIndex})
