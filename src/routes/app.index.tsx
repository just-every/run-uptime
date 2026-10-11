import {createFileRoute} from '@tanstack/react-router'
import {ConsoleDocument,consoleHead} from '../ui/console-document.tsx'
export const Route=createFileRoute('/app/')({head:consoleHead,component:ConsoleDocument})
