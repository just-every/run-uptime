import {createFileRoute} from '@tanstack/react-router'
import {MonitorEditorDocument,monitorEditorHead} from '../ui/monitor-editor-document.tsx'
export const Route=createFileRoute('/app/monitors/new_/discovery/$job')({head:monitorEditorHead,component:MonitorEditorDocument})
