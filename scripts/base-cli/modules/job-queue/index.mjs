import { randomUUID } from 'node:crypto';
import { realpath, unlink } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { configuration, admissionDetails, ordered, priorities, TIMEOUT_EXIT } from './config.mjs';
import { identity, alive } from './identity.mjs';
import { transaction } from './storage.mjs';
import { sampleResources } from './resources.mjs';
import { execute, signalExit } from './command.mjs';
import { stopGroup } from './processes.mjs';

const WAIT_REPORT_INTERVAL_MS = 15_000;

export async function createQueue(options = {}) {
  const config = await configuration(options), lifetime = await identity();
  const sampler = options.sampler ?? sampleResources;
  let active = 0, closed = false;
  const mutate = action => {
    if (closed) throw Error('Job queue is closed');
    return transaction(config.directory, lifetime.info, action);
  };
  async function reclaim(state) {
    for (const key of ['queued', 'running']) {
      const kept = [];
      for (const job of state[key]) {
        if (await alive(job.owner)) kept.push(job);
        else {
          if (key === 'running') await stopGroup(job.owner, config.killGraceMs);
          if (job.owner.socket) await unlink(job.owner.socket).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      }
      state[key] = kept;
    }
  }
  async function status() {
    return mutate(async state => {
      await reclaim(state);
      const resources = await sampler();
      const describe = ({ command, membership, owner: { token, socket, ...owner }, ...job }) => ({ ...job, owner,
        elapsedSeconds: Math.floor((Date.now() - (job.startedAt ?? job.enqueuedAt)) / 1000) });
      return { running: state.running.map(describe), queued: ordered(state.queued).map(describe), resources, config,
        admissionReason: state.queued.length ? admissionDetails(state.running.length, config, resources)?.reason ?? 'ready' : 'queue empty' };
    });
  }
  async function run(command, opts = {}) {
    if (!Array.isArray(command) || !command.length || command.some(arg => typeof arg !== 'string')) throw Error('Command must be a nonempty string array');
    if ((opts.kind ?? 'heavy') !== 'heavy' || !Object.hasOwn(priorities, opts.priority ?? 'normal')) throw Error('Invalid job kind or priority');
    if (opts.maxWait !== undefined && (!Number.isFinite(opts.maxWait) || opts.maxWait < 0)) throw Error('Invalid maxWait');
    const repository = await realpath(opts.cwd ?? process.cwd());
    const controller = new AbortController(), start = performance.now();
    const interrupt = () => controller.abort('SIGINT'), terminate = () => controller.abort('SIGTERM');
    const external = () => controller.abort(opts.signal.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
    process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
    opts.signal?.addEventListener('abort', external, { once: true });
    if (opts.signal?.aborted) external();
    const job = { id: randomUUID(), membership: randomUUID(), label: opts.label ?? command[0], command,
      repository, priority: opts.priority ?? 'normal',
      enqueuedAt: Date.now(), owner: lifetime.info };
    active++;
    let keepLease = false, lastWaitReportAt = 0, lastWaitSignature;
    try {
      await mutate(state => { job.sequence = ++state.sequence; state.queued.push(job); });
      await opts.onQueued?.(job);
      for (;;) {
        if (controller.signal.aborted) return { code: signalExit(controller.signal.reason), signal: controller.signal.reason };
        const result = await mutate(async state => {
          await reclaim(state);
          const resources = await sampler();
          const admission = admissionDetails(state.running.length, config, resources);
          const waiting = ordered(state.queued), position = waiting.findIndex(item => item.id === job.id) + 1;
          const blockers = [], reasonCodes = [];
          if (position > 1) {
            blockers.push(`waiting behind ${position - 1} earlier queued ${position === 2 ? 'job' : 'jobs'}`);
            reasonCodes.push('queue_order');
          }
          if (admission) { blockers.push(admission.reason); reasonCodes.push(admission.code); }
          if (blockers.length) return { reason: blockers.join('; '), blockers, reasonCodes, position,
            queued: waiting.length, running: state.running.length, resources,
            limits: { slots: config.slots, loadThreshold: config.loadThreshold, minFreeMemoryBytes: config.minFreeMemoryBytes } };
          if (opts.maxWait > 0 && performance.now() - start >= opts.maxWait * 1000)
            return { reason: 'max-wait elapsed before admission', blockers: ['max-wait elapsed before admission'],
              reasonCodes: ['max_wait'], position, queued: waiting.length, running: state.running.length, resources,
              limits: { slots: config.slots, loadThreshold: config.loadThreshold, minFreeMemoryBytes: config.minFreeMemoryBytes } };
          state.queued = state.queued.filter(item => item.id !== job.id);
          job.startedAt = Date.now(); state.running.push(job);
          return null;
        });
        if (!result) break;
        const elapsed = performance.now() - start;
        if (opts.maxWait !== undefined && elapsed >= opts.maxWait * 1000)
          return { code: TIMEOUT_EXIT, timedOut: true, reason: result.reason };
        const signature = `${result.position}:${result.reasonCodes.join(',')}`;
        const now = performance.now();
        if (!lastWaitReportAt || signature !== lastWaitSignature || now - lastWaitReportAt >= WAIT_REPORT_INTERVAL_MS) {
          await opts.onWaiting?.(result.reason, result);
          lastWaitReportAt = now;
          lastWaitSignature = signature;
        }
        const remaining = opts.maxWait === undefined ? config.pollMs : Math.min(config.pollMs, Math.max(1, opts.maxWait * 1000 - elapsed));
        await delay(remaining, undefined, { signal: controller.signal }).catch(error => { if (error.name !== 'AbortError') throw error; });
      }
      return await execute(command, job, config, owner => mutate(state => {
        const lease = state.running.find(item => item.id === job.id);
        if (!lease) throw Error('Job reservation disappeared');
        lease.owner = owner;
      }), controller.signal, opts.onStarted, opts);
    } catch (error) { keepLease = Boolean(error.keepLease); throw error; }
    finally {
      try {
        await mutate(state => { state.queued = state.queued.filter(item => item.id !== job.id);
          if (!keepLease) state.running = state.running.filter(item => item.id !== job.id); });
      } finally {
        active--;
        process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
        opts.signal?.removeEventListener('abort', external);
      }
    }
  }
  async function drain({ maxWait } = {}) {
    if (maxWait !== undefined && (!Number.isFinite(maxWait) || maxWait < 0)) throw Error('Invalid maxWait');
    const start = performance.now();
    for (;;) {
      const view = await status();
      if (!view.running.length && !view.queued.length) return { code: 0, ...view };
      if (maxWait !== undefined && performance.now() - start >= maxWait * 1000) return { code: TIMEOUT_EXIT, timedOut: true, ...view };
      await delay(maxWait === undefined ? config.pollMs : Math.min(config.pollMs, Math.max(1, maxWait * 1000 - (performance.now() - start))));
    }
  }
  return { config, run, status, drain, async close() {
    if (active) throw Error('Cannot close a queue with active jobs');
    closed = true; await lifetime.close();
  } };
}
