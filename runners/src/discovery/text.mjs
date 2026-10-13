import {createHash} from 'node:crypto';
export const clip=(value,max)=>{const text=String(value).replace(/\s+/g,' ').trim();return text.length<=max?text:text.slice(0,max-1).trimEnd()+'…'};
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',copy:'©',reg:'®',trade:'™',middot:'·',bull:'•',laquo:'«',raquo:'»',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'};
export function decodeEntities(text){
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi,(whole,name)=>{
    if(name[0]==='#'){const code=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));return code>0&&code<0x110000&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):whole}
    return ENTITIES[name.toLowerCase()]??whole;
  });
}
// A key is stable for one URL, whatever kind or method a later run gives it: a readable slug plus a short digest of the exact URL.
export function proposalKey(url){
  const parsed=new URL(url),slug=(parsed.host+parsed.pathname).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const digest=createHash('sha256').update(url).digest('hex').slice(0,10);
  return `${slug.slice(0,80-digest.length-1).replace(/-+$/,'')}-${digest}`;
}
export const seconds=ms=>`${Number((ms/1000).toFixed(1))} s`;
export function everyText(ms){
  if(ms%3600000===0)return ms===3600000?'Every hour':`Every ${ms/3600000} hours`;
  if(ms%60000===0)return ms===60000?'Every minute':`Every ${ms/60000} minutes`;
  return `Every ${ms/1000} seconds`;
}
