// Formatting shared by the console's views (public/app.js) and the monitor page (public/monitor-page.js). Every value
// that reaches markup goes through escape().
export const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon=name=>`<span class="ui-icon" data-icon="${name}" aria-hidden="true"></span>`;
export const ago=t=>{if(!t)return 'No check recorded';const s=Math.max(0,Math.floor((Date.now()-t)/1000));return s<90?`${s}s ago`:s<5400?`${Math.floor(s/60)}m ago`:s<172800?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`};
export const duration=value=>Number.isSafeInteger(value)&&value>=0?(value<1000?`${value} ms`:`${(value/1000).toFixed(2)} s`):'Unknown';
// <wbr> after the scheme and before each path segment, so the host and port stay whole and the URL wraps at its path.
export const breakableUrl=url=>{const text=String(url??''),scheme=text.indexOf('://'),head=scheme<0?'':text.slice(0,scheme+3),rest=scheme<0?text:text.slice(scheme+3);return (head?escape(head)+'<wbr>':'')+rest.split(/(?=[/?#])/).map(escape).join('<wbr>')};
export const monitorHref=id=>'/app/monitors/'+encodeURIComponent(id);
// A span of time in the largest unit and, when it is not zero, the next one: "9 s", "1 min 1 s", "23 h 59 min", "7 d".
// Hours run to 48 so a day window reads "24 h". Parts are rounded down by default, so observed time is never
// overstated; {roundUp:true} rounds an Unknown span up to the smallest unit shown, so missing evidence is never
// understated ("1 s" for under a second). Each number is joined to its unit by a no-break space (NBSP), so "7 d" or
// "1 s" never wraps apart.
const UNITS=[['d',86400000],['h',3600000],['min',60000],['s',1000]];
const NBSP='\u00a0',part=(n,unit)=>`${n}${NBSP}${unit}`;
export function humaneDuration(ms,{roundUp=false}={}){
 if(!Number.isFinite(ms)||ms<0)return 'Unknown';
 if(ms===0)return part(0,'s');
 if(ms<1000)return roundUp?part(1,'s'):'under '+part(1,'s');
 const start=ms<2*86400000?1:0;
 for(let i=start;i<UNITS.length;i++){
  const [unit,size]=UNITS[i];if(ms<size)continue;
  const [next,nextSize]=UNITS[i+1]??[];
  // Rounded up to a whole smallest shown unit, the span is formatted exactly: a carry lands on the next unit's boundary.
  if(roundUp){const step=nextSize??size,up=Math.ceil(ms/step)*step;if(up!==ms)return humaneDuration(up)}
  const whole=Math.floor(ms/size),rest=next?Math.floor((ms-whole*size)/nextSize):0;
  return rest?`${part(whole,unit)} ${part(rest,next)}`:part(whole,unit);
 }
}
// The state a monitor shows: Paused when disabled, Unknown while the overview could not be refreshed.
export const shownState=(m,readUnavailable)=>m.definition.enabled?(readUnavailable?'Unknown':m.state.state):'Paused';
