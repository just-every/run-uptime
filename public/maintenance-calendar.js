// Calendar inputs use the chosen IANA zone, independently of the browser zone.
const formatter = timeZone => new Intl.DateTimeFormat('en-CA', {timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function parts(at, timeZone) {
 const values=Object.fromEntries(formatter(timeZone).formatToParts(at).map(part=>[part.type,part.value]));
 return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}
export function localDateTime(at,timeZone){return parts(at,timeZone).slice(0,16)}
export function localStart(value,timeZone){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Choose a local start date and time.');
 const desired=Date.parse(value+':00Z'),offsets=new Set();
 if(!Number.isFinite(desired))throw Error('Choose a valid local start date and time.');
 for(let hour=-36;hour<=36;hour+=12){const anchor=desired+hour*3600000;offsets.add(Date.parse(parts(anchor,timeZone)+'Z')-anchor)}
 const instants=[...offsets].map(offset=>desired-offset).filter(at=>parts(at,timeZone).slice(0,16)===value).sort((a,b)=>a-b);
 if(!instants.length)throw Error('That local start time does not exist in this time zone because the clock moves forward. Choose an existing time.');
 return instants[0];
}
export function maintenanceTime(at,timeZone){return new Intl.DateTimeFormat(undefined,{timeZone,dateStyle:'medium',timeStyle:'long'}).format(at)}
export const weekdayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const modeDescription=mode=>mode==='pause'?'Pause execution and notifications':'Continue checks; suppress notifications';
export function windowDescription(window){
 if(window.weekly){const rule=window.weekly;return `${rule.weekdays.map(day=>weekdayNames[day]).join(', ')} at ${rule.localTime} · ${rule.durationMinutes} elapsed minutes · ${rule.fromDate} through ${rule.untilDate} · ${window.timeZone}`}
 return `${maintenanceTime(window.startsAt,window.timeZone)} – ${maintenanceTime(window.endsAt,window.timeZone)} · ${window.timeZone}`;
}
