import {createFileRoute} from '@tanstack/react-router'
// The creation route owns the editor DOM while this path names its current state.
export const Route=createFileRoute('/app/monitors/new/discovery/$job')({})
