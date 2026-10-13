import {PARSE_BODY_CAP} from './constants.mjs';
import {bareHost,isApiHost,isStatusHost} from './domain.mjs';
import {decodeEntities} from './text.mjs';
// Endpoint addresses an API reference names, read from one page held in memory: absolute URLs on the site's own domain, and
// "GET /path" lines resolved against the api. host the page names. Only addresses a plain GET could plausibly answer are kept:
// templated paths, example identifiers and anything with a query are dropped, and a parameter-free collection ("/v1/charges")
// is preferred to anything deeper.
const ADDRESS=/https?:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](?::\d{1,5})?(?:\/[^\s"'`\\^|]*)?/gi;
const GET_LINE=/\bGET[\s:]+(\/[^\s"'`\\^|<>]*)/g;
const VERSION=/^v\d+(?:\.\d+)*$/i;
const NOT_ENDPOINT=new Set(['docs','doc','documentation','reference','guide','guides','blog','changelog','support','help','swagger','swagger-ui','redoc','assets','static','images','img','js','css','fonts','download','downloads']);
// Documentation, help and similar hosts serve pages and spec files, not the API; a spec or schema file is not an endpoint either.
const PAGE_HOSTS=new Set(['docs','doc','documentation','developers','developer','help','support','blog','learn','guide','guides','status']);
const SPEC_FILE=/^(?:openapi|swagger|api-docs|schema|spec|specs)(?:\.[a-z0-9]+)?$/i;
const PLACEHOLDER=/example|sample|placeholder|your[-_]|yourapp|xxx|0{4,}|1234|<|>|\{|\}|\[|\]|\$|%7b|%24/i;
const ASSET=/\.(?:png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|pdf|zip|gz|mp4|woff2?|ttf|html?|ya?ml)$/i;
// A segment that names one record rather than a kind of record.
function looksLikeIdentifier(raw){
  let segment=raw;
  try{segment=decodeURIComponent(raw)}catch{}
  if(VERSION.test(segment))return false;
  if(PLACEHOLDER.test(segment)||segment.startsWith(':'))return true;
  if(/^\d+$/.test(segment))return true;
  if(/^[0-9a-f]{12,}$/i.test(segment)||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment))return true;
  if(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(segment))return true;
  return segment.length>=8&&/\d/.test(segment)&&/[a-z]/i.test(segment);
}
// The raw match is cut where the address ends: at a quote, at markup that follows a complete path, never in the middle of a placeholder.
function trim(raw){
  let text=decodeEntities(raw);
  const quote=text.search(/["']/);
  if(quote>=0)text=text.slice(0,quote);
  const tag=text.search(/[<>]/);
  if(tag>=0){if(text[tag]==='<'&&text[tag-1]==='/')return null;text=text.slice(0,tag)}
  text=text.replace(/[.,;:!?)\]*]+$/,'');
  return /[{}\[\]$]|%7b|%24/i.test(text)?null:text;
}
export function extractEndpoints(body,{scope}){
  const found=new Map(),hostMentions=new Map();
  let order=0;
  const add=url=>{
    const host=bareHost(url.hostname);
    if(url.search||url.hash||url.port||!scope.allows(host)||isStatusHost(host)||ASSET.test(url.pathname))return;
    const segments=url.pathname.split('/').filter(Boolean);
    if(segments.some(s=>NOT_ENDPOINT.has(s.toLowerCase())||looksLikeIdentifier(s)))return;
    // On the bare site an API lives under /api or a version; on an api.* host any path is one.
    const apiHost=isApiHost(host),first=segments[0]?.toLowerCase()??'';
    if(!apiHost&&PAGE_HOSTS.has(host.split('.')[0])||SPEC_FILE.test(segments.at(-1)??''))return;
    if(!apiHost&&!(/^apis?$/.test(first)||segments.slice(0,2).some(s=>VERSION.test(s))))return;
    const entry=found.get(url.href)??{url:url.href,host,apiHost,depth:segments.filter(s=>!VERSION.test(s)&&!/^api$/i.test(s)).length,mentions:0,order:order++};
    entry.mentions++;found.set(url.href,entry);
  };
  const text=body.slice(0,PARSE_BODY_CAP).replace(/\\\//g,'/');
  for(const match of text.matchAll(ADDRESS)){
    const address=trim(match[0]);
    if(!address)continue;
    let url;
    try{url=new URL(address)}catch{continue}
    const host=bareHost(url.hostname);
    if(isApiHost(host)&&scope.allows(host)&&!url.port)hostMentions.set(host,(hostMentions.get(host)??0)+1);
    add(url);
  }
  // Reference pages usually print "GET /v1/charges" under a base address; the api. host the page names most is that base.
  const base=[...hostMentions.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
  if(base){
    const plain=decodeEntities(text.replace(/<[^>]*>/g,' '));
    for(const match of plain.matchAll(GET_LINE)){
      const path=trim(match[1]);
      if(!path)continue;
      try{add(new URL(path,`https://${base}`))}catch{}
    }
  }
  // A bare root or version ("/v1") is the last thing worth trying; then api.* hosts, shallow paths and the ones the page names most.
  return [...found.values()].sort((a,b)=>Number(a.depth===0)-Number(b.depth===0)||Number(b.apiHost)-Number(a.apiHost)||a.depth-b.depth||b.mentions-a.mentions||a.order-b.order);
}
