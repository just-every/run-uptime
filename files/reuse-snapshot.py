from pathlib import Path
import json,datetime,os
packet=Path.home()/'rer-consolidation/work/sd-uptime-loopback-churn-1/packet'
owned={1835:'rer managed proxy',2023:'synthetic target',2034:'Vite/Miniflare host',2080:'workerd',2102:'native private runner'}
rows=[]
for pid,role in owned.items():
 sockets={os.readlink(p)[8:-1] for p in (Path('/proc')/str(pid)/'fd').iterdir() if p.is_symlink() and os.readlink(p).startswith('socket:[')}
 for line in Path('/proc/net/tcp').read_text().splitlines()[1:]:
  c=line.split();lp=int(c[1].split(':')[1],16);rp=int(c[2].split(':')[1],16)
  if c[9] in sockets:rows.append(dict(pid=pid,role=role,local_port=lp,remote_port=rp,state=c[3],inode=c[9]))
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'TCP sockets owned by exact started processes; inode and port only','sockets':rows}
(packet/'reuse-snapshot.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
