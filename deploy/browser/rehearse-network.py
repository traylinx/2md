#!/usr/bin/env python3
"""Bounded credential-free CNI rehearsal. Explicit --execute; creates owned namespace only."""
import argparse, json, pathlib, subprocess, time, uuid
p=argparse.ArgumentParser()
p.add_argument('--execute',action='store_true');p.add_argument('--ssh-host',required=True);p.add_argument('--node',required=True);p.add_argument('--image',required=True)
a=p.parse_args()
import re
if not re.fullmatch(r'[a-z0-9.-]+',a.ssh_host) or not re.fullmatch(r'[a-z0-9.-]+',a.node):p.error('invalid host/node')
if not re.fullmatch(r'ghcr.io/[a-z0-9/_-]+@sha256:[a-f0-9]{64}',a.image):p.error('immutable GHCR image required')
if not a.execute:p.error('--execute required; no changes made')
ns='gb01-net-'+uuid.uuid4().hex[:10];uid=None;created=False
report={'namespace':ns,'image':a.image,'node':a.node,'checks':[],'cleanup':False}
def k(*args,body=None):
 import shlex
 cmd='kubectl --request-timeout=15s '+' '.join(shlex.quote(x) for x in args)
 result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=8',a.ssh_host,cmd],input=None if body is None else json.dumps(body),text=True,capture_output=True,timeout=25)
 if result.returncode:raise RuntimeError('kubectl operation failed: '+result.stderr[:600])
 return result.stdout
try:
 k('create','namespace',ns);created=True
 uid=json.loads(k('get','namespace',ns,'-o','json'))['metadata']['uid']
 for role,port in [('runtime',8292),('egress',8291),('target',8080)]:
  code="require('node:net').createServer(s=>s.end()).listen("+str(port)+",'0.0.0.0');setTimeout(()=>process.exit(0),180000)"
  pod={'apiVersion':'v1','kind':'Pod','metadata':{'name':role,'namespace':ns,'labels':{'app':'traylinx-browser-'+role}},'spec':{'nodeSelector':{'kubernetes.io/hostname':a.node},'restartPolicy':'Never','activeDeadlineSeconds':180,'automountServiceAccountToken':False,'enableServiceLinks':False,'terminationGracePeriodSeconds':1,'securityContext':{'runAsNonRoot':True,'runAsUser':1000,'seccompProfile':{'type':'RuntimeDefault'}},'containers':[{'name':'probe','image':a.image,'imagePullPolicy':'Never','command':['node','--max-old-space-size=16','-e',code],'securityContext':{'readOnlyRootFilesystem':True,'allowPrivilegeEscalation':False,'capabilities':{'drop':['ALL']}},'resources':{'requests':{'cpu':'25m','memory':'48Mi'},'limits':{'cpu':'100m','memory':'96Mi'}},'readinessProbe':{'tcpSocket':{'port':port},'periodSeconds':1,'timeoutSeconds':1}}]}}
  k('create','-f','-',body=pod)
 deadline=time.monotonic()+75
 while True:
  pods=json.loads(k('-n',ns,'get','pods','-o','json'))['items']
  if len(pods)==3 and all(any(c['type']=='Ready' and c['status']=='True' for c in x['status'].get('conditions',[])) for x in pods):break
  if time.monotonic()>deadline:
   report['pod_status']=[{'name':x['metadata']['name'],'phase':x['status']['phase'],'conditions':x['status'].get('conditions',[]),'containers':[{k:v for k,v in c.items() if k in ['name','state','ready','restartCount']} for c in x['status'].get('containerStatuses',[])]} for x in pods]
   raise RuntimeError('owned pods not ready within75s')
  time.sleep(2)
 ips={x['metadata']['name']:x['status']['podIP'] for x in pods}
 def connect(role,host,port):
  code="const s=require('node:net').connect({host:"+json.dumps(host)+",port:"+str(port)+"});let done=false;function end(ok){if(done)return;done=true;s.destroy();console.log(JSON.stringify({connected:ok}));}s.on('connect',()=>end(true));s.on('error',()=>end(false));s.setTimeout(1200,()=>end(false));"
  return json.loads(k('-n',ns,'exec',role,'--','node','--max-old-space-size=16','-e',code))['connected']
 # Positive baseline proves an owned listener exists before enforcing deny.
 for role in ['runtime','egress']:
  if not connect(role,ips['target'],8080):raise RuntimeError('baseline owned target unreachable')
 if not connect('egress','1.1.1.1',443):raise RuntimeError('public TCP baseline unavailable; no isolation verdict')
 policies=json.loads(subprocess.check_output(['python3',str(pathlib.Path(__file__).with_name('render-network.py')),'--namespace',ns,'--database-ip','100.69.18.112'],text=True))
 k('create','-f','-',body=policies)
 # Allow controller propagation; each negative must stay denied twice.
 time.sleep(4)
 for role,host,port,want,label in [('runtime',ips['egress'],8291,True,'runtime_proxy_allowed'),('runtime',ips['target'],8080,False,'runtime_private_denied'),('runtime','1.1.1.1',443,False,'runtime_direct_public_denied'),('egress',ips['target'],8080,False,'proxy_private_denied'),('egress','1.1.1.1',443,True,'proxy_public_allowed')]:
  results=[connect(role,host,port) for _ in range(2)]
  report['checks'].append({'name':label,'expected':want,'observed':results})
  if any(v!=want for v in results):raise RuntimeError('network assertion failed: '+label)
 report['passed']=True
except Exception as error:
 report['passed']=False;report['error']=str(error)
finally:
 if created:
  try:
   current=json.loads(k('get','namespace',ns,'-o','json'))
   if uid is None or current['metadata']['uid']!=uid:raise RuntimeError('namespace UID not verified; cleanup refused')
   k('delete','namespace',ns,'--wait=false')
   until=time.monotonic()+45
   while time.monotonic()<until:
    remaining=k('get','namespace',ns,'--ignore-not-found','-o','name').strip()
    if not remaining:report['cleanup']=True;break
    time.sleep(2)
   if not report['cleanup']:raise RuntimeError('namespace deletion still pending')
  except Exception as error:report['cleanup_error']=str(error)
 print(json.dumps(report,indent=2))
raise SystemExit(0 if report.get('passed') and report['cleanup'] else 1)
