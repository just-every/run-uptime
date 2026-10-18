export interface ContactSettings {delayMinutes:number;repeatMinutes:number;maxRepeats:number|null;recovery:boolean;stopOnAck:boolean}
export const defaultContactSettings:ContactSettings={delayMinutes:0,repeatMinutes:0,maxRepeats:null,recovery:true,stopOnAck:false};
export function normalizeContactSettings(raw:any,ids:string[]):Record<string,ContactSettings>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(id=>!ids.includes(id)))throw Error('Contact schedules must name selected destinations');
 const result:Record<string,ContactSettings>={};
 for(const [id,value] of Object.entries(raw)){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(defaultContactSettings,k)))throw Error('Unknown contact schedule field');
  const item={...defaultContactSettings,...value};
  for(const key of ['delayMinutes','repeatMinutes'] as const)if(!Number.isInteger(item[key])||item[key]<0||item[key]>1440)throw Error(`${key} must be a whole number from 0 to 1440`);
  if(item.maxRepeats!==null&&(!Number.isInteger(item.maxRepeats)||item.maxRepeats<1||item.maxRepeats>1000))throw Error('Maximum repeats must be blank or 1 to 1000');
  if(typeof item.recovery!=='boolean'||typeof item.stopOnAck!=='boolean')throw Error('Recovery and acknowledgement policies must be true or false');
  result[id]=item;
 }
 return result;
}
