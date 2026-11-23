// Run the emitted scheduled handler with workerd's Cron controller and D1.
export function meteredCron(app) {
 const bindings = new WeakMap();
 const wallNow = Date.now;
 let clock, current, latest;
 Date.now = () => clock ?? wallNow();

 function meterBinding(db) {
  const statements = new WeakMap();

  function observe(statements, operation) {
   const sample = current;
   const pending = operation().then(result => {
    const results = Array.isArray(result) ? result : [result];
    for (const [index, {sql}] of statements.entries()) {
     const rows = results[index]?.meta?.rows_read;
     if (!Number.isSafeInteger(rows) || rows < 0) sample.unmetered.push(sql);
     else {
      const count = sample.queries.get(sql) ?? {calls:0, rows:0};
      count.calls++;
      count.rows += rows;
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

 return {
  fetch() { return Response.json(latest); },
  async scheduled(controller, env, ctx) {
   clock = controller.scheduledTime;
   if (!bindings.has(env.DB)) bindings.set(env.DB, meterBinding(env.DB));
   // Reuse the binding's identity across invocations, including for app caches.
   const sample = {queries:new Map(), unmetered:[], pending:new Set()};
   current = sample;
   try {
    await app.scheduled(controller, {...env, DB:bindings.get(env.DB)}, ctx);
   } finally {
    // Await any outstanding D1 work within this invocation's I/O context.
    while (sample.pending.size) await Promise.allSettled(sample.pending);
    latest = {time:clock, queries:[...sample.queries], unmetered:sample.unmetered};
    current = undefined;
   }
  },
 };
}
