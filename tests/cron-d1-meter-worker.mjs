// Run the emitted Worker with workerd's real request handlers, Cron and D1.
export function meteredWorker(app) {
 const bindings = new WeakMap();
 const wallNow = Date.now;
  let clock, realStart, current, latest;
  Date.now = () => clock === undefined ? wallNow() : clock + (realStart === undefined ? 0 : wallNow() - realStart);

 function meterBinding(db) {
  const statements = new WeakMap();

  function observe(statements, operation) {
   const sample = current;
   const pending = operation().then(result => {
    const results = Array.isArray(result) ? result : [result];
    for (const [index, {sql}] of statements.entries()) {
     const {rows_read:rows, rows_written:writes} = results[index]?.meta ?? {};
     if (!Number.isSafeInteger(rows) || rows < 0 || !Number.isSafeInteger(writes) || writes < 0) sample.unmetered.push(sql);
     else {
      const count = sample.queries.get(sql) ?? {calls:0, rows:0, writes:0};
      count.calls++;
      count.rows += rows;
      count.writes += writes;
      sample.queries.set(sql, count);
     }
    }
    return result;
   }, error => {
    sample.unmetered.push(...statements.map(({sql}) => sql));
    throw error;
   });
   sample.pending.add(pending);
   pending.then(() => sample.pending.delete(pending), () => sample.pending.delete(pending));
   return pending;
  }

  function wrap(statement, sql) {
   const pair = {statement, sql};
   const wrapped = {
    bind: (...values) => wrap(statement.bind(...values), sql),
    run: () => observe([pair], () => statement.run()),
    all: () => observe([pair], () => statement.all()),
    async first(column) {
     // The D1 first() API discards metadata. Read the same result via all().
     const row = (await observe([pair], () => statement.all())).results[0];
     if (!row) return null;
     if (column === undefined) return row;
     if (!Object.hasOwn(row, column)) throw Error(`D1_COLUMN_NOTFOUND: ${column}`);
     return row[column];
    },
   };
   statements.set(wrapped, pair);
   return wrapped;
  }

  return {
   prepare: sql => wrap(db.prepare(sql), sql.replace(/\s+/g, ' ').trim()),
   batch(wrapped) {
    const entries = wrapped.map(statement => statements.get(statement));
    return observe(entries, () => db.batch(entries.map(({statement}) => statement)));
   },
  };
 }

 async function measure(door, time, env, ctx, run, advanceClock=false) {
  clock = time;
  realStart = advanceClock ? wallNow() : undefined;
  if (!bindings.has(env.DB)) bindings.set(env.DB, meterBinding(env.DB));
  // Reuse the binding's identity across invocations, including for app caches.
  const sample = {queries:new Map(), unmetered:[], pending:new Set()};
  current = sample;
  try {
   return await run({...env, DB:bindings.get(env.DB)}, {
    waitUntil(pending) {
     ctx.waitUntil(pending);
     sample.pending.add(pending);
     pending.then(() => sample.pending.delete(pending), () => sample.pending.delete(pending));
    },
    passThroughOnException: () => ctx.passThroughOnException(),
   });
  } finally {
   // Include work kicked by the dashboard in the poll that triggers it.
   while (sample.pending.size) await Promise.allSettled(sample.pending);
   latest = {door, time, queries:[...sample.queries], unmetered:sample.unmetered};
   current = undefined;
   clock = undefined;
   realStart = undefined;
  }
 }

 return {
  fetch(request, env, ctx) {
   const url = new URL(request.url);
   if (url.pathname === '/__d1_meter') {
    if (!latest || !url.searchParams.has('summary')) return Response.json(latest);
    const {queries, ...sample} = latest;
    const summary = {rows:0, writes:0};
    for (const [, {rows, writes}] of queries) {
     summary.rows += rows;
     summary.writes += writes;
    }
    return Response.json({...sample, ...summary});
   }
   // The local listener is HTTP. Give the application the fixture's hosted URL.
   const hosted = new URL(env.UPTIME_ORIGIN);
   hosted.pathname = url.pathname;
   hosted.search = url.search;
   const incoming = new Request(hosted, request);
   incoming.headers.set('host', hosted.host);
   const time = request.headers.get('x-d1-meter-time');
   return measure(url.pathname, time === null ? undefined : Number(time), env, ctx,
    (bindings, context) => app.fetch(incoming, bindings, context));
  },
  scheduled(controller, env, ctx) {
   const {start, lags} = JSON.parse(env.D1_METER_CRON_LAGS ?? '{}');
   const lag = lags?.[(controller.scheduledTime - start) / 60_000] ?? 0;
   return measure('cron', controller.scheduledTime + lag, env, ctx,
    (bindings, context) => app.scheduled(controller, bindings, context), lag < 0);
  },
 };
}
