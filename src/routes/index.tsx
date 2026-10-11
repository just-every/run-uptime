import {createFileRoute} from '@tanstack/react-router'
import {Landing} from '../site/landing/Landing.tsx'
export const Route=createFileRoute('/')({head:()=>({meta:[{title:'Uptime — Sleep through the night'}]}),component:Landing})
