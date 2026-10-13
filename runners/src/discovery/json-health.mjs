// A JSON assertion is only proposed on a stable scalar whose current value is a known healthy one. Timestamps, counters,
// ids and free text never qualify because they are not in these sets.
const HEALTHY_STRINGS=new Set(['ok','healthy','up','pass','passing','none','operational','ready','alive','running','green','success','available']);
const STRING_KEYS=['status','state','health','result','indicator'];
const BOOLEAN_KEYS=['ok','healthy','up','ready','alive','success'];
const NESTED=['indicator','status','state'];
const SAFE_KEY=/^[a-zA-Z0-9_-]{1,60}$/;
const healthyString=value=>typeof value==='string'&&HEALTHY_STRINGS.has(value.toLowerCase());
export function healthAssertion(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  for(const key of BOOLEAN_KEYS)if(SAFE_KEY.test(key)&&value[key]===true)return {path:key,equals:true};
  for(const key of STRING_KEYS){
    const field=value[key];
    if(healthyString(field))return {path:key,equals:field};
    if(field&&typeof field==='object'&&!Array.isArray(field))for(const inner of NESTED)if(healthyString(field[inner]))return {path:`${key}.${inner}`,equals:field[inner]};
  }
  return null;
}
export function parseJson(body){try{return JSON.parse(body)}catch{return undefined}}
