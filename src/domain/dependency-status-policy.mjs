export const isDependencyStatus = definition => ['http','keyword'].includes(definition.type??'http') &&
  definition.tags?.includes('dependency') && Boolean(definition.service);

const MISSING={source:'source is unavailable or missing its claim',component:'component is missing or renamed','too-large':'source is larger than the catalog reader reads',moved:'source moved or redirected',shape:'source no longer has the shape the catalog expects'};
export function dependencyMissingCheck(definition, problem='source') {
  return {assertion:'dependency',pass:false,reason:`${definition.service}: provider status ${MISSING[problem]??MISSING.source}. This is Unknown evidence, not application health.`};
}
export function validDependencyMissingCheck(definition, check) {
  return isDependencyStatus(definition) && Object.keys(MISSING).some(problem=>
    check?.assertion==='dependency'&&check.pass===false&&check.reason===dependencyMissingCheck(definition,problem).reason);
}
