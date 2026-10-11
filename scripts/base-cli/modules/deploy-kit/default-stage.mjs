import { assert } from './validation.mjs';
/** Controller-owned target. No arbitrary Worker name, URL, command or resource declarations. */
export function defaultStagePlan(artifact) {
  assert(/^\d{1,20}$/.test(artifact.run.id),'invalid-run-id');
  const worker = `rer-base-stage-${artifact.run.id}`;
  assert(artifact.migrations.every(x => x.binding === 'DB'),'unexpected-migration-binding');
  return {version:1,worker,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],
    d1:[{binding:'DB',name:`${worker}-db`,migrations:artifact.migrations.map(({binding,...rest}) => rest)}],
    r2:[],queues:[{binding:'JOBS',name:`${worker}-jobs`,consumer:{batch_size:10,max_retries:3}}],durableObjects:[],secrets:[],crons:['*/10 * * * *'],vars:{}};
}
export const stage = Object.freeze({cwd:'.',blocked:null,
  prepare:['node','modules/deploy-kit/prepare.mjs'],
  deploy:['node','modules/deploy-kit/cli.mjs','deploy'],
  health:['node','modules/deploy-kit/cli.mjs','health']});
