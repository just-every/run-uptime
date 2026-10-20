// A location's default name: where its runner runs. When a runner first reaches Uptime, the place of the address it
// connected from names it (Cloudflare's request.cf: city, else region, else country). Without a known place, a short
// generated name stands in, so a location never reads as an internal label. A name the owner gives is never replaced.
// Sixteen of each, picked by two hex digits of the runner id (self-<uuid>): migration 0057 names an existing built-in
// runner by the same rule in SQL.
export const ADJECTIVES=['Amber','Brisk','Cedar','Coral','Ember','Fern','Golden','Harbor','Jade','Maple','Misty','Quiet','River','Silver','Swift','Willow']
export const NOUNS=['Bay','Brook','Cove','Crest','Dale','Field','Glen','Grove','Hill','Lake','Meadow','Peak','Ridge','Shore','Vale','Wood']
// Miniflare (local development and tests) answers with a fixed Austin, Texas placeholder when it cannot read the real
// place; that is not where the runner is.
const placeholder=(cf:Record<string,any>)=>cf.city==='Austin'&&cf.colo==='DFW'&&cf.asn===395747&&cf.botManagement?.ja3Hash==='25b4882c2bcb50cd6b469ff28c596742'
const text=(value:unknown)=>typeof value==='string'&&value.trim()&&!/[\x00-\x1f\x7f]/.test(value)?value.trim().slice(0,72):null
export function placeName(cf:unknown):string|null{
 if(!cf||typeof cf!=='object')return null
 const place=cf as Record<string,any>
 if(placeholder(place))return null
 const named=text(place.city)??text(place.region)
 if(named)return named
 if(typeof place.country==='string'&&/^[A-Z]{2}$/.test(place.country)&&place.country!=='XX'){
  try{const country=new Intl.DisplayNames(['en'],{type:'region'}).of(place.country);return country&&country!==place.country?country:null}catch{return null}
 }
 return null
}
// Two words picked by the runner id, so the same runner always gets the same name.
export function generatedName(runnerId:string){
 const digit=(char:string)=>{const value=parseInt(char,16);return Number.isNaN(value)?char.charCodeAt(0)%16:value}
 return `${ADJECTIVES[digit(runnerId.charAt(5))]} ${NOUNS[digit(runnerId.charAt(6))]}`
}
// "Sydney" stays "Sydney" unless another location has it; then "Sydney 2", "Sydney 3".
export function distinctName(name:string,taken:Iterable<string>){
 const used=new Set(taken);if(!used.has(name))return name
 for(let n=2;;n++)if(!used.has(`${name} ${n}`))return `${name} ${n}`
}
