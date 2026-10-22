import {createFileRoute} from '@tanstack/react-router'
import {MonitorEditorDocument,monitorEditorHead} from '../ui/monitor-editor-document.tsx'
export const Route=createFileRoute('/app/monitors/$id/edit')({head:monitorEditorHead,component:MonitorEditorDocument})
