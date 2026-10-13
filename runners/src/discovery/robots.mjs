import {ROBOTS_TOKEN} from './constants.mjs';
// RFC 9309 matching: the group naming our product token wins over "*"; within it the longest matching rule decides and
// Allow wins a tie. Only the rules are kept; the robots.txt text itself is discarded.
export function parseRobots(text){
  const groups=[];
  let current=null,collecting=false;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim();
    const colon=line.indexOf(':');
    if(colon<1)continue;
    const field=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();
    if(field==='user-agent'){
      if(!collecting){current={agents:[],rules:[]};groups.push(current)}
      current.agents.push(value.toLowerCase());collecting=true;
    }else if(field==='allow'||field==='disallow'){
      collecting=false;
      if(current)current.rules.push({allow:field==='allow',pattern:value});
    }else collecting=false;
  }
  const named=groups.filter(g=>g.agents.includes(ROBOTS_TOKEN));
  const chosen=named.length?named:groups.filter(g=>g.agents.includes('*'));
  return chosen.flatMap(g=>g.rules).filter(rule=>rule.pattern!=='');
}
function matches(pattern,path){
  const anchored=pattern.endsWith('$'),body=anchored?pattern.slice(0,-1):pattern;
  const expression=new RegExp('^'+body.split('*').map(part=>part.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+(anchored?'$':''));
  return expression.test(path);
}
export function robotsAllows(rules,path){
  let best=null;
  for(const rule of rules){
    if(!matches(rule.pattern,path))continue;
    if(!best||rule.pattern.length>best.pattern.length||(rule.pattern.length===best.pattern.length&&rule.allow&&!best.allow))best=rule;
  }
  return !best||best.allow;
}
