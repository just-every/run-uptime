// DELIVERY-002 delivery outcomes: retries, fallback contacts and both outcomes of an escalation. Text-only enhancement
// of the existing keyed cards, so a refresh never remounts a card, moves focus or closes an open dialog or menu.
const label=state=>({accepted:'Accepted',rejected:'Failed',uncertain:'Uncertain',queued:'Queued',sending:'Sending'})[state]??state;
function chainLines(chain){
 const lines=(chain.after??[]).map(p=>`Fallback ${chain.step} after ${p.destinationName}: ${p.outcome==='failed'?'Failed':'Uncertain'} (${p.code})${p.stateNow&&label(p.stateNow)!==(p.outcome==='failed'?'Failed':'Uncertain')?`; now ${label(p.stateNow)}`:''}.`);
 for(const f of chain.fallbacks)lines.push(`Fallback to ${f.destinationName}: ${label(f.state)}.`);
 if(chain.ended==='exhausted')lines.push('Chain ended: no contact accepted. Follow up manually.');
 return lines;
}
// One note element per card for the page's lifetime: a refresh re-attaches the same node instead of creating another.
const chainNotes=new WeakMap();
export function mountDeliveryChain(area,notes,right){
 const cards=new Map([...area.querySelectorAll('.delivery-card')].map(card=>[card.dataset.key,card]));
 for(const delivery of notes.deliveries){
  const card=cards.get(`delivery-${delivery.id}`);if(!card)continue;
  const attempts=delivery.attemptHistory??[],next=attempts.at(-1);
  const message=delivery.code==='waiting_for_contact_quiet'?`Quiet hours: waiting${delivery.quietUntil?` until ${new Date(delivery.quietUntil).toLocaleString()}`:''}.`:delivery.code==='retry_window_exhausted'?'Retry window exhausted. No further automatic retry.':delivery.code==='retry_attempts_exhausted'?'Attempt limit reached. No further automatic retry.':delivery.state==='queued'&&delivery.attempts>0&&next?.started_at===null?`Retry scheduled: ${new Date(next.scheduled_at).toLocaleString()}.`:null;
  if(message){const reason=card.querySelector('.delivery-reason');if(reason?.firstChild?.nodeType===Node.TEXT_NODE)reason.firstChild.nodeValue=message+' '}
  if(delivery.state==='rejected')card.querySelector('.delivery-state').textContent='Failed';
  const outcome=card.querySelector('.delivery-outcome'),lines=delivery.chain?chainLines(delivery.chain):[];
  let note=chainNotes.get(card);
  if(!lines.length){note?.remove();continue}
  if(!note){note=document.createElement('p');note.className='delivery-chain';chainNotes.set(card,note)}
  if(note.parentElement!==outcome)outcome.append(note);
  const text=lines.join(' ');if(note.textContent!==text)note.textContent=text;
 }
}
