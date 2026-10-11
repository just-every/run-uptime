import { quote, insist } from './storage.mjs';

// SQLite does not expose generated expressions through a pragma. Read their
// original SQL, retaining quoted tokens and balanced expressions verbatim.
// Copies deliberately omit constraints: FK cycles and normalized duplicate
// keys must reach the existing atomic destination validation, not fail staging.
function tokens(sql) {
 const result=[];
 for(let i=0;i<sql.length;) {
  const start=i,c=sql[i];
  if(/[ \t\n\v\f\r]/.test(c)){i++;continue;}
  if(sql.startsWith('--',i)){while(i<sql.length&&sql[i]!=='\n')i++;continue;}
  if(sql.startsWith('/*',i)){const end=sql.indexOf('*/',i+2);insist(end>=0,'generated_sql');i=end+2;continue;}
  if(['"',"'",'`','['].includes(c)) {
   const end=c==='['?']':c;i++;
   while(i<sql.length){if(sql[i++]===end){if(c!=='['&&sql[i]===end){i++;continue;}break;}}
   result.push({text:sql.slice(start,i),start,end:i,quoted:true});continue;
  }
  if(/[(),]/.test(c)){i++;result.push({text:c,start,end:i});continue;}
  while(i<sql.length&&!/[ \t\n\v\f\r(),"'`\[]/.test(sql[i])&&!sql.startsWith('--',i)&&!sql.startsWith('/*',i))i++;
  result.push({text:sql.slice(start,i),start,end:i});
 }
 return result;
}
const word=(token,value)=>token&&!token.quoted&&folded(token.text)===value.toLowerCase();
const identifier=token=>{
 if(!token.quoted)return token.text;
 const value=token.text.slice(1,-1),delimiter=token.text[0];
 // Bracket quoting has no doubled-delimiter escape; opening brackets are literal.
 return delimiter==='['?value:value.replaceAll(delimiter+delimiter,delimiter);
};
const folded=value=>value.replace(/[A-Z]/g,letter=>letter.toLowerCase());
function definitions(sql) {
 const list=tokens(sql),start=list.findIndex(token=>token.text==='(');let depth=0,part=[],result=[];
 for(const token of list.slice(start+1)) {
  if(token.text==='(')depth++;
  if(token.text===')'){if(!depth){result.push(part);return result;}depth--;}
  if(token.text===','&&!depth){result.push(part);part=[];}else part.push({...token,depth});
 }
 insist(false,'generated_sql');
}
export function generatedCopySQL(table,copy) {
 const declarations=definitions(table.sql);
 const columns=table.columns.map(column=>{
  const definition=declarations.find(part=>part[0]&&folded(identifier(part[0]))===folded(column.name));
  insist(definition,'generated_sql:'+table.name);
  const collate=definition.findLastIndex((token,i)=>i>0&&token.depth===0&&word(token,'COLLATE'));
  const collation=collate<0?'':' COLLATE '+definition[collate+1].text;
  let expression='';
  if(column.generated) {
   const as=definition.findIndex((token,i)=>i>0&&token.depth===0&&word(token,'AS')&&definition[i+1]?.text==='(');
   insist(as>=0,'generated_sql:'+table.name+':'+column.name);
   const close=definition.findIndex((token,i)=>i>as+1&&token.text===')'&&token.depth===0);
   insist(close>=0,'generated_sql:'+table.name+':'+column.name);
   expression=' AS '+table.sql.slice(definition[as+1].start,definition[close].end)+' '+column.generated.toUpperCase();
  }
  return quote(column.name)+(column.type?' '+quote(column.type):'')+collation+expression;
 });
 return `CREATE TABLE ${quote(copy)} (${columns.join(',')})`;
}
