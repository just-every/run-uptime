from pathlib import Path
import json,os,subprocess,sys
root=Path.cwd(); task=root.parent; packet=task/'packet'; home=task/'isolated-home'; home.mkdir(exist_ok=True)
label=sys.argv[1]; node=task/'tools/node_modules/node/bin/node'; package=(root/'node_modules/@runeditrun/rer').resolve()
env={'HOME':str(home),'PATH':str(node.parent)+':'+os.environ['PATH'],'CI':'true','RER_NO_UPDATE_CHECK':'1','RER_NODE_AUTO':'0','WRANGLER_SEND_METRICS':'false','TZ':'UTC','LANG':'C.UTF-8'}
command=['unshare','--user','--map-root-user','--net','strace','-f','-e','trace=network','-o',str(packet/(label+'.network.txt')),str(node),str(package/'bin/rer.mjs'),'deploy','--dry-run',*sys.argv[2:]]
start=subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip()
with (packet/(label+'.stdout.txt')).open('w') as out,(packet/(label+'.stderr.txt')).open('w') as err:
 result=subprocess.run(command,cwd=root,env=env,stdout=out,stderr=err,timeout=240)
streams={s:(packet/f'{label}.{s}.txt').read_text() for s in ['stdout','stderr']}; text=''.join(streams.values())
network=(packet/(label+'.network.txt')).read_text()
receipt={'command':command,'cwd':str(root),'environment_policy':'constructed allowlist only; isolated empty HOME; exact Node/pnpm PATH; CI=true; RER_NO_UPDATE_CHECK=1; RER_NODE_AUTO=0; WRANGLER_SEND_METRICS=false; TZ=UTC; LANG=C.UTF-8; no provider/application credentials or env-file','started_at':start,'ended_at':subprocess.check_output(['date','-u','+%Y-%m-%dT%H:%M:%SZ'],text=True).strip(),'exit_code':result.returncode,'heading_count':text.count('Needed for a real deploy'),'completion_count':text.count('deploy: local dry run complete;'),'stdout_bytes':len(streams['stdout'].encode()),'stderr_bytes':len(streams['stderr'].encode()),'executed_rer_version':json.loads((package/'package.json').read_text())['version'],'consumer_tracked_pin':'0.2.113 (unchanged)','node_version':subprocess.check_output([str(node),'--version'],text=True).strip(),'network_isolation':'new user and network namespaces; no external interfaces','outbound_syscall_lines':[line for line in network.splitlines() if any(call in line for call in ['connect(','sendto(','sendmsg('])]}
(packet/(label+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2)); print('\n'.join(line for line in text.splitlines() if 'Needed for a real deploy' in line or '  - ' in line or 'deploy:' in line)[-4500:])
