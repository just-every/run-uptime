import {createFileRoute} from '@tanstack/react-router'
import {MonitorEditorDocument,monitorEditorHead} from '../ui/monitor-editor-document.tsx'
export const Route=createFileRoute('/app/monitors/new_/manual_/$')({head:monitorEditorHead,component:MonitorEditorDocument})
