import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateConfiguration} from '../../src/domain/startup-config.mjs';
import {runRunner} from './runner.mjs';
export {runRunner};
// The runner started from an Uptime checkout with its settings in the environment (rer dev, docs/runner.md).
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 validateConfiguration(process.env,{scope:'runner'});
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 await runRunner({origin:process.env.UPTIME_CONTROL_ORIGIN,key:process.env.UPTIME_RUNNER_KEY,runnerId:process.env.UPTIME_RUNNER_ID,networkLabel:process.env.UPTIME_NETWORK_LABEL,localReview:process.env.UPTIME_LOCAL_REVIEW==='true',grantPath:resolve(process.env.UPTIME_GRANT_FILE??'data/synthetic-grant.json'),watch:{url:process.env.UPTIME_WATCH_SLACK_URL??process.env.UPTIME_WATCH_WEBHOOK_URL,slack:Boolean(process.env.UPTIME_WATCH_SLACK_URL),afterMs:process.env.UPTIME_WATCH_AFTER_MS,repeatMs:process.env.UPTIME_WATCH_REPEAT_MS},signal:controller.signal});
}
