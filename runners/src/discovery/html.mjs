import {decodeEntities} from './text.mjs';
const ATTRIBUTE=/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attributes(source){
  const found={};
  for(const match of source.matchAll(ATTRIBUTE)){const name=match[1].toLowerCase();if(!(name in found))found[name]=decodeEntities(match[2]??match[3]??match[4]??'')}
  return found;
}
const stripTags=html=>decodeEntities(html.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
// Facts only: the page body is read in memory and nothing of it is returned except these derived strings.
export function parseHtml(body,baseUrl){
  const facts={title:'',siteName:'',canonical:'',h1:'',links:[],anchors:[]};
  const title=/<title\b[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(body);
  if(title)facts.title=stripTags(title[1]);
  const h1=/<h1\b[^>]*>([\s\S]{0,400}?)<\/h1>/i.exec(body);
  if(h1)facts.h1=stripTags(h1[1]);
  let base=baseUrl;
  const seen=new Set();
  for(const tag of body.matchAll(/<(meta|link|a|base)\b([^>]{0,2000})>/gi)){
    const name=tag[1].toLowerCase(),attrs=attributes(tag[2]);
    if(name==='meta'){
      const key=(attrs.property||attrs.name||'').toLowerCase();
      if(key==='og:site_name'&&!facts.siteName)facts.siteName=attrs.content?.trim()??'';
    }else if(name==='link'){
      if(attrs.rel?.toLowerCase().split(/\s+/).includes('canonical')&&attrs.href&&!facts.canonical)try{facts.canonical=new URL(attrs.href,base).href}catch{}
    }else if(name==='base'){
      if(attrs.href)try{base=new URL(attrs.href,baseUrl).href}catch{}
    }else if(attrs.href&&facts.links.length<2000&&!/^(javascript|mailto|tel|data):/i.test(attrs.href.trim())){
      try{
        const link=new URL(attrs.href.trim(),base);link.hash='';
        if(!['http:','https:'].includes(link.protocol))continue;
        if(!seen.has(link.href)){seen.add(link.href);facts.links.push(link.href)}
        // The words a link shows say what it is for ("API", "Developers"); only a short run of them is kept.
        const text=name==='a'&&facts.anchors.length<2000?stripTags(body.slice(tag.index+tag[0].length,tag.index+tag[0].length+600).split(/<\/a\s*>/i)[0]).slice(0,80):'';
        if(text)facts.anchors.push({href:link.href,text});
      }catch{}
    }
  }
  return facts;
}
// Brand token of a title: the segment that names the domain, else the first segment.
export function brandFromTitle(title,domainLabel){
  const segments=title.split(/\s+[|–—·•:\-]\s+|\s*[|–—·•]\s*|:\s+/).map(s=>s.trim()).filter(Boolean);
  if(!segments.length)return '';
  const squash=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  const label=squash(domainLabel);
  return (label.length>=3&&segments.find(s=>squash(s).includes(label)))||segments[0];
}
