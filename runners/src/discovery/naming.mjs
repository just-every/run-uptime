import {brandFromTitle} from './html.mjs';
import {clip} from './text.mjs';
// Names follow one style: the brand first, then plain words for what is watched ("Supabase API", "Supabase pricing page"), never a raw path or hostname.
const PAGE_NOUN={pricing:'pricing page',docs:'docs',login:'login page',signin:'sign-in page','sign-in':'sign-in page',contact:'contact page',about:'about page',blog:'blog'};
const HOST_NOUN={docs:'docs',app:'app',dashboard:'dashboard',console:'console',developers:'developer site',developer:'developer site',help:'help centre',support:'support site',portal:'portal'};
export const pageNoun=key=>PAGE_NOUN[key];
export const hostNoun=label=>HOST_NOUN[label];
const readable=segment=>{try{segment=decodeURIComponent(segment)}catch{}return segment.replace(/[-_+]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase()};
// The brand of a site: its declared name, the title segment that names the domain, else the domain's own name capitalised.
export function brandOf({facts,label}){
  return facts.siteName||brandFromTitle(facts.title,label)||label.charAt(0).toUpperCase()+label.slice(1);
}
// "Supabase" + "status page" -> "Supabase status page"; a brand that already ends in the noun's first word is not doubled.
export function named(brand,noun,max=100){
  const first=noun.split(' ')[0].toLowerCase(),words=brand.split(' ');
  const text=words[words.length-1].toLowerCase()===first?`${brand}${noun.slice(first.length)}`:`${brand} ${noun}`;
  return clip(text,max);
}
// A pasted URL's own name: the brand alone for the home page, a plain noun for a page below it.
export function pasteName({brand,url,isApi}){
  if(isApi)return named(brand.replace(/^api[.\-]/,''),'API');
  const segments=url.pathname.split('/').filter(Boolean);
  if(!segments.length)return clip(brand,100);
  const key=segments.length===1?segments[0].toLowerCase():'';
  return named(brand,PAGE_NOUN[key]??`${readable(segments[segments.length-1])} page`);
}
