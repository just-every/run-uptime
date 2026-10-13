import {terminalSlot,observationsBySlot} from './attempt-projection.ts'
import {CONTACT_FRESHNESS_MS} from './runner-contact.server.ts'

// A newer delivery before this fixed deadline proves an undelivered part was
// skipped. Allow every undelivered part one contact-freshness window after
// acceptance expires: current contact/revocation cannot decide historical
// eligibility. The half-open window settles identically with or without owner
// polling; it never extends authority to return observations for this slot.
export function classifyAttempts(definition:any,slots:any[],observations:any[],now:number){
 const grouped=observationsBySlot(observations);
 return slots.map(slot=>{
  const assignments=JSON.parse(slot.assignments),stored=grouped.get(slot.id)??[],deadline=slot.lease_until+CONTACT_FRESHNESS_MS;
  let skipped=false,pending=false,missing=false;
  for(const assignment of assignments){
   if(assignment.delivered_at!==null){
    if(!terminalSlot({...definition,probes:[assignment.probe]},stored))missing=true;
   }else if(assignment.advanced_at!==null&&assignment.advanced_at<deadline){
    skipped=true;
   }else if(slot.lease_until<=now&&now<deadline){
    pending=true;
   }else missing=true;
  }
  // A lost delivered result or genuinely absent vantage still breaks a streak,
  // even if another vantage skipped this slot. Keep every raw coverage gap.
  return {...slot,skipped:skipped&&!missing&&!pending,pending:pending&&!missing};
 })
}
