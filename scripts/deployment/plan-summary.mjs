// The dry run's resource plan as a short list: what a real deploy would create, not the plan's raw JSON (the full plan is
// the command's `--json` result).
export function planSummary({ environment, plan, pendingVariables = [] }) {
 const names = list => list.map(item => item.environment ?? item.binding).join(', ');
 const required = plan.secrets.filter(item => !item.optional), optional = plan.secrets.filter(item => item.optional);
 return [
  `deploy: resource plan for ${environment} (provider state not queried)`,
  `  Worker: ${plan.worker}`,
  ...plan.d1.map(database => `  D1 database: ${database.name} (${database.migrations.length} migrations)`),
  ...(plan.crons.length ? [`  Cron: ${plan.crons.join(', ')}`] : []),
  ...(required.length ? [`  Secrets set at deploy: ${names(required)}`] : []),
  ...(optional.length ? [`  Optional secrets: ${names(optional)}`] : []),
  ...(pendingVariables.length ? [`  Set by Cloudflare during deployment: ${pendingVariables.join(', ')}`] : []),
 ].join('\n');
}
