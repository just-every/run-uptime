import {createFileRoute} from '@tanstack/react-router'
import {ConsoleDocument,consoleHead} from '../ui/console-document.tsx'
// One monitor's page: the console document on a route of its own, so moving between it and a section (src/routes/_console.tsx)
// mounts the console afresh for that view. public/app.js reads the id from the path and shows "Monitor not found" for an
// id this installation does not have.
export const Route=createFileRoute('/app/monitors/$id/')({head:consoleHead,component:ConsoleDocument})
