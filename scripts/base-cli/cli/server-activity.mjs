// Inject the monotonic clock and scheduling together: tests advance logical time,
// never assert the operating system schedules a callback in a wall-clock window.
export function activityClock({seconds,onIdle,now=()=>Number(process.hrtime.bigint()/1000000n),schedule=setTimeout,cancel=clearTimeout,onChange=()=>{}}={}) {
 let ready=false,active=0,last=now(),timer,closed=false;
 function arm(){cancel(timer);if(ready&&!closed&&!active)timer=schedule(()=>{if(now()-last>=seconds*1000)onIdle();else arm();},Math.min(2**31-1,Math.max(1,seconds*1000-(now()-last))));}
 function touch(){last=now();onChange({lastActivity:last,active});arm();}
 return {ready(){ready=true;touch();},touch,
  begin(){active++;touch();let ended=false;return()=>{if(ended)return;ended=true;active--;touch();};},
  snapshot(){return {ready,active,lastActivity:last,idleSeconds:(now()-last)/1000};},
  close(){closed=true;cancel(timer);}
 };
}
