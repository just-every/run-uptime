import {createFileRoute} from '@tanstack/react-router'
// A Settings area (/app/settings/<area>): the console route owns the document while this path names the area.
export const Route=createFileRoute('/_console/app/settings/$area')({})
