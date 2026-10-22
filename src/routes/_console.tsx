import {createFileRoute} from '@tanstack/react-router'
import {ConsoleDocument,consoleHead} from '../ui/console-document.tsx'
// The console's sections (/app/monitors, /app/locations, …) share this one document: public/app.js switches between
// them in place, so its child routes only name the section and render nothing of their own.
export const Route=createFileRoute('/_console')({head:consoleHead,component:ConsoleDocument})
