import collections,datetime,json,pathlib,re,statistics
packet=pathlib.Path.home()/'rer-consolidation/work/sd-uptime-loopback-churn-1/packet'
summary={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'isolated Linux VM, exact instance ports only; no machine-global or Mac inference','connection_traces':{},'socket_samples':{},'runtime':{}}
for name,seconds in [('baseline-connect.trace',30),('console-connect.trace',60)]:
 rows=[]
 for line in (packet/name).read_text().splitlines():
  port=re.search(r'sin_port=htons\((\d+)\)',line);host=re.search(r'inet_addr\("([^\"]+)"\)',line)
  if port and host and host[1]=='127.0.0.1':rows.append({'pid':line.split()[0],'port':int(port[1]),'time':line.split()[1]})
 counter=collections.Counter((r['pid'],r['port'])for r in rows);per_second=collections.Counter(r['time'].split('.')[0]for r in rows)
 summary['connection_traces'][name]={'duration_seconds':seconds,'loopback_connect_attempts':len(rows),'attempts_per_second':len(rows)/seconds,'max_in_any_utc_second_bucket':max(per_second.values(),default=0),'by_pid_destination':[{'pid':pid,'destination_port':port,'connect_attempts':n}for(pid,port),n in counter.most_common()]}
for name in ['baseline-sockets.json','console-sockets.json','cadence-pause-sockets.json','steady-sockets.json']:
 path=packet/name
 if not path.exists():continue
 r=json.loads(path.read_text());samples=r['samples'];warm=samples[12:]
 summary['socket_samples'][name]={'sample_count':len(samples),'period_seconds':5,'first':samples[0],'last':samples[-1],'maximum':max(s['time_wait']for s in samples),'minimum_after_60s':min((s['time_wait']for s in warm),default=None),'maximum_after_60s':max((s['time_wait']for s in warm),default=None),'values':[s['time_wait']for s in samples]}
for name in ['baseline-runtime.json','console-runtime.json','cadence-pause-runtime.json']:
 path=packet/name
 if not path.exists():continue
 r=json.loads(path.read_text());last=r['samples'][-1];histories=last['histories'];result={'sample_count':len(r['samples']),'duration_ms':last['elapsedMs'],'monitors':[],'actions':r.get('actions',[])}
 for h in histories:
  by_rev=collections.defaultdict(list)
  for s in h['slots']:
   for o in s['observations']:by_rev[s.get('revision',1)].append(o['startedAt'])
  deltas=[b-a for starts in by_rev.values()for a,b in zip(sorted(starts),sorted(starts)[1:])]
  intervals={s.get('revision',1):s.get('intervalMs',h.get('intervalMs'))for s in h['slots']}
  okay=all(b-a>=intervals[rev] for rev,starts in by_rev.items()for a,b in zip(sorted(starts),sorted(starts)[1:]))
  result['monitors'].append({'name':h['name'],'slots':len(h['slots']),'observations':sum(len(s['observations'])for s in h['slots']),'outcomes':dict(collections.Counter(o['outcome']for s in h['slots']for o in s['observations'])),'intervals_by_revision':intervals,'by_revision':{str(rev):{'observations':len(starts),'minimum_gap_ms':min((b-a for a,b in zip(sorted(starts),sorted(starts)[1:])),default=None),'starts':sorted(starts)}for rev,starts in by_rev.items()},'minimum_gap_ms':min(deltas,default=None),'median_gap_ms':statistics.median(deltas) if deltas else None,'no_early_repeated_checks':okay})
 if r.get('actions'):
  paused,resumed=r['actions'][:2]
  first=histories[0]
  illegal=[o['startedAt'] for s in first['slots']for o in s['observations']if paused['at']+5000<=o['startedAt']<resumed['at']]
  result['pause_resume']={'paused_at':paused['at'],'resumed_at':resumed['at'],'observations_after_inflight_grace_during_pause':illegal,'pause_duration_ms':resumed['at']-paused['at']}
 requests=r.get('requests',[])
 if requests:
  begin=datetime.datetime.fromisoformat(r['startedAt'].replace('Z','+00:00')).timestamp()*1000
  steady=[x for x in requests if x['at']>=begin]
  result['browser_requests']={'all_count_including_startup':len(requests),'after_initial_10s_warmup':len(steady),'requests_per_second_after_warmup':len(steady)/(last['elapsedMs']/1000),'paths':dict(collections.Counter(x['path']for x in steady))}
 summary['runtime'][name]=result
(packet/'analysis.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'connection_traces':summary['connection_traces'],'runtime':summary['runtime']},indent=2))
