// Dependency monitors retain the provider's claim, never infer application health.
// Missing claims use the existing Unknown evidence outcome; a stated non-operational
// status still fails this separate monitor's ordinary assertions and incident policy.
import {jsonClaimPresent} from './http-assertions/json.mjs';
export const isDependencyStatus = definition => ['http','keyword'].includes(definition.type??'http') &&
  definition.tags?.includes('dependency') && Boolean(definition.service);

const componentPath = /^components\[\?\(@\.id==("(?:[^"\\]|\\.)*")\)\]\.status$/;
const label = value => {
  const text=String(value).replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
  return text.length<=100?text:text.slice(0,99).trimEnd()+'…';
};
const clip = (text, max) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
// DEPENDENCY-001 attribution, shared by discovery proposals and the catalog (DEPENDENCY-002).
export const dependencyAttribution = (provider, url) => ({service: provider, tags: ['dependency'],
  outcome: clip(`${provider}'s status is the provider's own claim; contextual evidence only, never proof that the application is up or down. Source: ${url}`, 500)});
export function dependencyMissingCheck(definition, problem='source') {
  return {assertion:'dependency',pass:false,reason:`${definition.service}: provider status ${problem==='component'?'component is missing or renamed':'source is unavailable or missing its claim'}. This is Unknown evidence, not application health.`};
}
export function validDependencyMissingCheck(definition, check) {
  return isDependencyStatus(definition) && ['source','component'].some(problem=>
    check?.assertion==='dependency'&&check.pass===false&&check.reason===dependencyMissingCheck(definition,problem).reason);
}
export function missingDependencyEvidence(definition,response) {
  if(!isDependencyStatus(definition))return;
  if(response.status<200||response.status>=300)return dependencyMissingCheck(definition);
  const path=definition.assertions?.json?.path;
  // A feed is read for its newest entry, so a body that is not a feed at all states nothing.
  if(!path){
    if(definition.assertions?.bodyRegex&&!(/<(rss|feed)[\s>]/.test(response.body)&&/<\/(channel|feed)>/.test(response.body)))return dependencyMissingCheck(definition);
    return;
  }
  let document;
  try{document=JSON.parse(response.body)}catch{return dependencyMissingCheck(definition)}
  if(path==='status.indicator'){
    if(typeof document?.status?.indicator!=='string')return dependencyMissingCheck(definition);
    return;
  }
  const match=componentPath.exec(path);
  if(!match){
    // Another provider's own document: the claim exists when the reviewed path selects a value.
    if(!jsonClaimPresent(path,response.body))return dependencyMissingCheck(definition);
    return;
  }
  const id=JSON.parse(match[1]),components=Array.isArray(document?.components)?document.components.filter(component=>component?.id===id):[];
  if(components.length!==1||typeof components[0].status!=='string'||
    (definition.group&&label(components[0].name)!==definition.group))return dependencyMissingCheck(definition,'component');
}
