import {runRunner} from '../runners/src/private-runner.mjs';
await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,once:true});
