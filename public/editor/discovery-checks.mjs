// A definition's checks in plain language, the same wording the runner uses when it proposes one.
const seconds=ms=>`${Number((ms/1000).toFixed(1))} s`;
export function everyText(ms){
 if(ms%3600000===0)return ms===3600000?'Every hour':`Every ${ms/3600000} hours`;
 if(ms%60000===0)return ms===60000?'Every minute':`Every ${ms/60000} minutes`;
 return `Every ${ms/1000} seconds`;
}
export const curlyQuotes=text=>text.replace(/"([^"]*)"/g,'“$1”');
export function describeChecks(definition){
 const {assertions}=definition,checks=[`Expects ${assertions.status}`];
 if(assertions.bodyIncludes!==undefined)checks.push(`Page contains “${assertions.bodyIncludes}”`);
 if(assertions.header)checks.push(`Header ${assertions.header.name} is “${assertions.header.equals}”`);
 if(assertions.json)checks.push(`JSON ${assertions.json.path} is ${JSON.stringify(assertions.json.equals)}`);
 if(assertions.latencyMs)checks.push(`Responds within ${seconds(assertions.latencyMs)}`);
 checks.push(everyText(definition.intervalMs));
 return checks;
}
