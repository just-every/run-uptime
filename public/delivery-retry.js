// Text-only enhancement: preserve the existing keyed cards, controls and focus.
export function mountRetryInfo(area,notes,right){
 const history=area.querySelector('.notification-history > p');
 if(history)history.textContent='Email, Slack, unsigned webhooks, tests and drills use one attempt. Signed webhooks retry with a stable ID.';
 for(const title of [...area.querySelectorAll('.notification-help h3'),...(right?.querySelectorAll('.notification-help h3')??[])])if(title.textContent==='What delivery means')title.nextElementSibling.textContent='Accepted is a provider acknowledgment, not proof someone read it. Signed webhooks retry within saved limits. Other uncertain sends are never resent automatically.';
 const cards=new Map([...area.querySelectorAll('.delivery-card')].map(card=>[card.dataset.key,card]));
 for(const delivery of notes.deliveries){
  const card=cards.get(`delivery-${delivery.id}`);if(!card)continue;
  const attempts=delivery.attemptHistory??[],next=attempts.at(-1);
  const message=delivery.code==='retry_window_exhausted'?'Retry window exhausted. No further automatic retry.':delivery.code==='retry_attempts_exhausted'?'Attempt limit reached. No further automatic retry.':delivery.state==='queued'&&delivery.attempts>0&&next?.started_at===null?`Retry scheduled: ${new Date(next.scheduled_at).toLocaleString()}.`:null;
  if(!message)continue;
  const reason=card.querySelector('.delivery-reason');if(reason?.firstChild?.nodeType===Node.TEXT_NODE)reason.firstChild.nodeValue=message+' ';
  if(delivery.state==='rejected')card.querySelector('.delivery-state').textContent='Failed';
 }
}
