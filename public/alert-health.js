// Which alert destinations cannot send, read from the overview's notifications block (src/domain/notifications.server.ts):
// an enabled destination whose email has no sender, whose stored credentials can no longer be read, or whose last send
// failed. The menu's count (public/app.js) and the clauses above Settings › Alerts' Destinations (public/alert-clauses.js)
// both come from here, so they always agree. A monitor's page reads an overview without this block, so it shows no count.

// The newest send to each destination that ended: a refused one is a failure only once it was attempted, and one Uptime
// held back (disabled, rotated, cancelled) is no send at all. Deliveries arrive newest first.
function lastSends(deliveries){
 const last=new Map();
 for(const d of deliveries)if(!last.has(d.destinationId)&&(d.state==='accepted'||d.state==='uncertain'||d.state==='rejected'&&d.attempts>0))last.set(d.destinationId,d);
 return last;
}
// [{destination, reason: 'email'|'credentials'|'failed', delivery}] in the destinations' order.
export function cannotSend(notes){
 const last=lastSends(notes.deliveries);
 return notes.destinations.filter(d=>d.enabled).flatMap(d=>{
  const delivery=last.get(d.id);
  const reason=d.credentialsAvailable===false?'credentials':d.kind==='email'&&!notes.mailConfigured?'email':delivery?.state==='rejected'?'failed':null;
  return reason?[{destination:d,reason,delivery}]:[];
 });
}
// The count beside Settings and Alerts: the destinations that cannot send, or 1 while none is enabled; 0 once nothing
// needs the owner.
export function alertCount(notes){
 if(!notes)return 0;
 return notes.destinations.some(d=>d.enabled)?cannotSend(notes).length:1;
}
