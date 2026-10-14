// Provider text is private until the CLI's existing credential redactor approves
// it. Identity, rather than mutable Error properties, carries this diagnostic.
const failures = new WeakMap();
export function recordDeployFailure(error, details) {
  failures.set(error,{...failures.get(error),...details});
  return error;
}
export function deployDiagnostic(error, redact) {
  const detail = failures.get(error);
  if (!detail) return undefined;
  const clean = value => (redact ?? String)(String(value)).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'').replace(/\b[a-f0-9]{32}\b/gi,'[REDACTED]');
  const failureCode = detail.code ?? error.message;
  const code = /^[a-zA-Z0-9_-]{1,120}$/.test(failureCode) ? clean(failureCode) : 'deploy-failed';
  return {code,step:detail.step ?? 'deploy',created:(detail.created ?? []).map(clean),
    ...(typeof error.resource==='string' && /^(?:d1|r2|kv|queues|worker|service):[a-z0-9-]+$/.test(error.resource) ? {resource:clean(error.resource)} : {}),
    ...(detail.providerCodes?.length ? {providerCodes:detail.providerCodes} : {}),
    output:(detail.output ? (redact ? clean(detail.output) : '(provider output withheld; rer deploy provides redacted details)') : '(no provider output)').split(/\r?\n/).slice(0,8).map(line=>line.slice(0,500)).join('\n')};
}
function operation(path, options = {}) {
  const write = options.method && options.method !== 'GET';
  if (/\/d1\/database\/[^/]+\/query/.test(path)) return 'migrate D1';
  for (const [prefix,kind] of [['/d1/database','D1'],['/r2/buckets','R2'],['/queues','queue'],['/storage/kv/namespaces','KV']]) {
    if (path === prefix && options.method === 'POST') return `create ${kind}`;
    if (path.startsWith(prefix)) return `check ${kind}`;
  }
  if (path.includes('/secrets')) return 'secrets';
  if (path.includes('/subdomain') || path.includes('/routes') || path.includes('/domains')) return 'route';
  if (path.includes('/schedules')) return 'scheduled triggers';
  if (write && path.startsWith('/workers/')) return 'upload Worker';
  return 'check Worker';
}
const CREATED_KINDS = {D1:'d1',R2:'r2',KV:'kv',queue:'queues'};
export function deploymentDiagnostics(api, {onCreated} = {}) {
  const created = [];
  const recordCreated = resource => { created.push(resource); onCreated?.(resource); };
  let currentStep = 'prepare deploy';
  const guard = method => async (path, options) => {
    const step = operation(path,options);
    currentStep = step;
    try {
      const result = await api[method](path,options);
      if (step.startsWith('create ')) recordCreated(`${step.slice(7)}:${options.body.name ?? options.body.queue_name ?? options.body.title}`);
      return result;
    } catch (error) {
      // A failed create names the resource it asked for: a lost answer may still have created it.
      if (step.startsWith('create ') && error.resource === undefined) error.resource = `${CREATED_KINDS[step.slice(7)]}:${options.body.name ?? options.body.queue_name ?? options.body.title}`;
      throw recordDeployFailure(error,{step,created:[...created]});
    }
  };
  return {...api,request:guard('request'),list:guard('list'),envelope:guard('envelope'),recordCreated,
    async importSql(id, sql) {
      currentStep = 'migrate D1';
      try { return await api.importSql(id, sql); }
      catch (error) { throw recordDeployFailure(error,{step:currentStep,created:[...created]}); }
    },
    annotateFailure(error, step = currentStep) {
      const prior = failures.get(error);
      // Node filesystem/CLI codes are structural; their messages can hold paths
      // and inputs, so retain them privately for the caller's redaction boundary.
      const cliCode = typeof error.code === 'string' && /^(?:E[A-Z0-9_]{1,63}|health-[a-z-]+)$/.test(error.code) ? error.code : undefined;
      recordDeployFailure(error,{step:prior?.step ?? step,created:prior?.created ?? [...created],
        ...(!prior?.code && cliCode ? {code:cliCode,...(!prior?.output ? {output:error.message} : {})} : {})});
      return error;
    }};
}
