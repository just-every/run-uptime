import type {DevPersona} from '../base/modules/operator-auth/dev/index.mjs'
// Local dev personas: real operators at <as>@dev.localhost, created only by local dev sign-in and suspended in exports.
// Uptime's console belongs to its owner, so the persona that matters is a signed-in operator who is not the owner:
// the console, the API and every document stay closed to it.
export function devPersonas():DevPersona[]{return [{as:'member',role:'member',displayName:'Dev member'}]}
