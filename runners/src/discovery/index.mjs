import {createBudget} from './budget.mjs';
import {DEFAULT_BUDGET,MAX_HOSTS,MAX_NOTES} from './constants.mjs';
import {crawl} from './crawl.mjs';
import {createFetcher} from './fetcher.mjs';
import {createNotes} from './notes.mjs';
import {normalizeInput} from './primary.mjs';
import {finalize} from './rank.mjs';
import {createScope} from './scope.mjs';
const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new RangeError(`Discovery budget ${label} must be an integer from ${min} to ${max}`);return value};
// Checks one pasted URL from this runner and proposes monitors that are already filled in.
// options: {budget:{requests,concurrency,totalMs},signal,transport}. `transport` replaces the pinned report fetch (for tests).
// Page bodies are parsed in memory and never returned, logged or stored; the result holds derived facts only.
export async function discover(inputUrl,options={}){
  const started=Date.now(),limits={...DEFAULT_BUDGET,...options.budget};
  integer(limits.requests,1,100,'requests');integer(limits.concurrency,1,8,'concurrency');integer(limits.totalMs,1000,300000,'totalMs');
  const notes=createNotes(MAX_NOTES),input=String(inputUrl??''),target=normalizeInput(input);
  const result=(finalUrl,proposals,budget)=>({input,finalUrl,requests:budget?.used??0,durationMs:Date.now()-started,hosts:(budget?.hosts??[]).slice(0,MAX_HOSTS),notes:notes.list(),proposals});
  if(!target.url){notes.add(target.note);return result(input,[])}
  const budget=createBudget({...limits,signal:options.signal}),scope=createScope(target.url.hostname);
  const fetcher=createFetcher({budget,notes,scope,transport:options.transport});
  const {finalUrl,proposals}=await crawl({target:target.url,fetcher,notes,scope});
  const robotsRead=await fetcher.readRobots();
  if(robotsRead)notes.add(`robots.txt was read on ${robotsRead} host${robotsRead===1?'':'s'} and honoured for everything except your own URL.`);
  if(fetcher.stops.has('budget'))notes.add(`Stopped at the ${limits.requests}-request limit, so some checks were skipped.`);
  if(fetcher.stops.has('time'))notes.add(`Stopped at the ${limits.totalMs/1000}-second limit, so some checks were skipped.`);
  if(fetcher.stops.has('hosts'))notes.add(`Stopped at ${MAX_HOSTS} hosts, so others were not contacted.`);
  return result(finalUrl,finalize(proposals),budget);
}
