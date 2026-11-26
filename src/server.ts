// Load the demo boundary first so it can wrap effects before either handler loads.
import {withDemo} from '@runeditrun/rer/modules/demo'
import {runCron} from './domain/worker-cron.server.ts'
import type {MinuteWork} from './domain/minute-work.server.ts'
export {ScheduledWork,completeWorkerCheck} from './domain/minute-work.server.ts'
export {probeWorkerTask} from './domain/worker-probe-task.server.ts'
export {runWorkerBackground} from './domain/worker-background.server.ts'
import type {Bindings} from './domain/control.server.ts'

export default withDemo({
 async fetch(request,env,execution){
  const {default:server}=await import('./server-fetch.ts');
  return server.fetch(request,env,execution);
 },
 async scheduled(controller,env,ctx){
  const getWork=(ctx.exports as unknown as {ScheduledWork:(options:{props:{cron:true}})=>MinuteWork}).ScheduledWork;
  const work=getWork({props:{cron:true}});
  await runCron(env,controller.scheduledTime,work);
 },
} satisfies ExportedHandler<Bindings>,{
 seed:async (env:Bindings,options:{ownerEmail:string;now:Date})=>(await import('./demo.ts')).seedDemo(env,options),
})
