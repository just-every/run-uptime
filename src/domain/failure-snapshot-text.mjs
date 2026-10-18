// Map decoded text back to source bytes so encoded or split credentials are
// removed from the retained source too, before any rendering or persistence.
const REDACTED='[redacted]';
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',tab:'\t',newline:'\n',colon:':',commat:'@',lowbar:'_',period:'.',sol:'/',bsol:'\\',num:'#',dollar:'$',percnt:'%',ast:'*',plus:'+',equals:'=',quest:'?',excl:'!',lpar:'(',rpar:')',semi:';',hyphen:'-',dash:'-',fjlig:'fj'};
function decoded(text,stripTags){
 let value='',map=[];
 for(let i=0;i<text.length;){
  if(stripTags&&text[i]==='<'){const tag=/^<[^>]*>/.exec(text.slice(i));if(tag){if(/^<\/?(?:p|div|h[1-6]|br|li|tr|pre|section)\b/i.test(tag[0])){value+='\n';map.push([i,i+tag[0].length])}i+=tag[0].length;continue}}
  let length=1,chunk=text[i];
  if(text[i]==='&'){const entity=/^&(#x[0-9a-f]{1,8}|#[0-9]{1,10}|[a-z][a-z0-9]{1,31});?/i.exec(text.slice(i));if(entity){const name=entity[1].toLowerCase();let next=entities[name];if(name[0]==='#'){const code=Number.parseInt(name.slice(name[1]==='x'?2:1),name[1]==='x'?16:10);next=code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'\ufffd'}if(next!==undefined){chunk=next;length=entity[0].length}}}
  value+=chunk;for(let j=0;j<chunk.length;j++)map.push([i,i+length]);i+=length;
 }
 return {value,map};
}
function card(value){
 const digits=value.replace(/\D/g,'');if(digits.length<13||digits.length>19)return false;let sum=0,double=false;
 for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if(double&&(n*=2)>9)n-=9;sum+=n;double=!double}
 return sum%10===0;
}
export function redactFailureText(text,secrets=[],allowEmail=false,limit=text.length){
 const ranges=[];
 for(const strip of [false,true]){
  const {value,map}=decoded(text,strip),add=(start,end)=>{if(start<end&&map[start]&&map[end-1])ranges.push([map[start][0],map[end-1][1]])};
  for(const secret of secrets){if(!secret)continue;let at=0;while((at=value.indexOf(secret,at))>=0){add(at,at+secret.length);at+=secret.length}}
  for(const match of value.matchAll(/\b(?:Bearer|Basic)\s+[^\s"'<>;,]+/gi))add(match.index,match.index+match[0].length);
  for(const match of value.matchAll(/(\b(?:set-cookie|cookie)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n<>]*)/gi))add(match.index+match[1].length,match.index+match[0].length);
  for(const match of value.matchAll(/(\b(?:set-cookie|cookie|authorization|proxy-authorization|(?:x[-_])?api[-_]?(?:key|token)|access[-_]?token|refresh[-_]?token|token|password|passwd|secret|client[-_]?secret)\b["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s<,;}&]+)/gi))add(match.index+match[1].length,match.index+match[0].length);
  for(const match of value.matchAll(/(<(?:password|secret|token|api[-_]?key)>)[\s\S]*?(?=<\/)/gi))add(match.index+match[1].length,match.index+match[0].length);
  if(!allowEmail)for(const match of value.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi))add(match.index,match.index+match[0].length);
  for(const match of value.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?![ -]?\d)/g))if(card(match[0]))add(match.index,match.index+match[0].length);
 }
 const merged=[];for(const range of ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push(range)}
 let result=text.slice(0,limit);for(const [start,end] of merged.reverse())if(start<limit)result=result.slice(0,start)+REDACTED+result.slice(Math.min(end,limit));return result;
}
