// Preserve release's accepted parser, producer, receipt and validation exits.
export async function dispatchRelease(args) {
 try {
  const options = {};
  for (let index = 0; index < args.length; index++) {
   if(args[index]==='--no-queue'){}
   else if (args[index] === '--tag') options.tag = args[index + 1]?.startsWith('v') ? args[++index] : true;
   else if (args[index] === '--clean-history') options.cleanHistory = true;
   else if (args[index] === '--dry-run') options.dryRun = true;
   else if (['--repo', '--project', '--repository', '--output', '--ref', '--env-file', '--onto'].includes(args[index]) && args[index + 1] && !args[index + 1].startsWith('--'))
    options[args[index] === '--env-file' ? 'envFile' : args[index].slice(2)] = args[++index];
   else throw Error('Invalid release arguments');
  }
  if(args.includes('--no-queue')){const {shared}=await import('./shared.mjs');const {commandPolicy}=await shared('queue.mjs');const policy=await commandPolicy();try{if(!policy.ci)throw Error('Original CI required');}finally{await policy.close();}}
  if (!options.repo || !options.output) throw Error('Release requires --repo and --output');
  const { release } = await import('../modules/release/produce.mjs');
  const receipt = await release(options);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt.status === 'BLOCKED' ? 1 : 0;
 } catch {
  console.error('Release failed during argument, source or artifact validation. No release completed.');
  return 2;
 }
}
