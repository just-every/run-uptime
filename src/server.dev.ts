// Local-only Worker entry. vite.config.ts loads it only for `vite dev`; the deployed main stays server.ts, and
// `rer build` refuses any output that contains the dev layer. It adds dev sign-in, personas and the dev badge.
import worker from './server'
import {withDevIdentity} from './base/modules/operator-auth/dev/index.mjs'
import {authConfig,type AuthBindings} from './domain/operator-auth.server.ts'
import {devPersonas} from './domain/dev-personas.ts'

// Uptime names its origin UPTIME_ORIGIN and marks a local runtime by UPTIME_LOCAL_REVIEW; the dev layer reads the common names.
const local=(env:AuthBindings)=>({...env,AUTH_ORIGIN:env.UPTIME_ORIGIN,AUTH_LOCAL:env.UPTIME_LOCAL_REVIEW})

export default withDevIdentity<AuthBindings,typeof worker>(worker,{bindings:local as (env:AuthBindings)=>AuthBindings,config:authConfig,personas:devPersonas})
