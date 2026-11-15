import collections,datetime,json,pathlib,re,subprocess,time
packet=pathlib.Path.home()/'rer-consolidation/work/sd-uptime-loopback-churn-1/packet'
ports={8787,8788,46513,42769,46809,40295,38823}
samples=[]
for i in range(19):
 rows=[]
 for filename in ['/proc/net/tcp','/proc/net/tcp6']:
  for line in pathlib.Path(filename).read_text().splitlines()[1:]:
   cols=line.split();local,remote,state=cols[1:4];lp=int(local.split(':')[1],16);rp=int(remote.split(':')[1],16)
   if lp in ports or rp in ports:rows.append((lp,rp,state))
 by_port={str(p):dict(collections.Counter(state for lp,rp,state in rows if lp==p or rp==p)) for p in sorted(ports)}
 samples.append(dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),by_port=by_port,time_wait=sum(state=='06' for lp,rp,state in rows)))
 (packet/'baseline-sockets.json').write_text(json.dumps(dict(scope='only exact isolated instance listener ports, Linux proc TCP states',ports=sorted(ports),samples=samples),indent=2)+'\n')
 print(i,samples[-1]['time_wait'],flush=True)
 if i<18:time.sleep(5)
