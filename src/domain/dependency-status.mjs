// Dependency monitors retain the provider's claim, never infer application health.
// Missing claims use the existing Unknown evidence outcome; a stated non-operational
// status still fails this separate monitor's ordinary assertions and incident policy.
export const isDependencyStatus = definition => ['http','keyword'].includes(definition.type??'http') &&
  definition.tags?.includes('dependency') && Boolean(definition.service);

const componentPath = /^components\[\?\(@\.id==("(?:[^"\\]|\\.)*")\)\]\.status$/;
const label = value => {
  const text=String(value).replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
  return text.length<=100?text:text.slice(0,99).trimEnd()+'…';
};
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
  if(!path)return;
  let document;
  try{document=JSON.parse(response.body)}catch{return dependencyMissingCheck(definition)}
  if(path==='status.indicator'){
    if(typeof document?.status?.indicator!=='string')return dependencyMissingCheck(definition);
    return;
  }
  const match=componentPath.exec(path);
  if(!match)return;
  const id=JSON.parse(match[1]),components=Array.isArray(document?.components)?document.components.filter(component=>component?.id===id):[];
  if(components.length!==1||typeof components[0].status!=='string'||
    (definition.group&&label(components[0].name)!==definition.group))return dependencyMissingCheck(definition,'component');
}
