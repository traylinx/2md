#!/usr/bin/env python3
"""Remove a lab-only route, drain an in-flight request, restart fresh, prove cleanup.
No production deployment or production capture route is modified.
"""
import argparse, concurrent.futures, hashlib, json, shlex, subprocess, time, urllib.request, urllib.error
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--namespace',required=True);p.add_argument('--evidence',type=Path,required=True);a=p.parse_args()
NS=a.namespace;assert NS.startswith('html2md-qualification-network-')
SUFFIX=NS.rsplit('-',1)[1];HOST='https://api.2md.traylinx.com';BASE='/__capture-drill-'+SUFFIX
FIXTURE='/__capture-fixture-'+SUFFIX;OUT=a.evidence;OUT.mkdir(parents=True,exist_ok=True)
if (OUT/'RESULT.json').exists():raise SystemExit('Preserve previous drill evidence; use a new directory')
record={'namespace':NS,'passed':False,'events':[],'legacy_health':[]}
def event(name,**detail):
 record['events'].append({'name':name,'at':time.time(),**detail});print(name,flush=True)
 (OUT/'RESULT.json').write_text(json.dumps(record,indent=2)+'\n')
def k(args,data=None,timeout=180):
 r=subprocess.run(['ssh','-o','BatchMode=yes','traylinx-k3s-01','kubectl '+' '.join(shlex.quote(s) for s in args)],input=data,text=True,capture_output=True,timeout=timeout)
 if r.returncode:raise RuntimeError(r.stderr[-600:])
 return r.stdout
def request(path,body=None,token=False):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer synthetic-lab-token'
 q=urllib.request.Request(HOST+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
 try:r=urllib.request.urlopen(q,timeout=40)
 except urllib.error.HTTPError as e:r=e
 raw=r.read();return {'status':r.status,'body':raw.decode(),'sha256':hashlib.sha256(raw).hexdigest()}
def pods(namespace,selector):return json.loads(k(['-n',namespace,'get','pods','-l',selector,'-o','json']))['items']
def legacy():
 items=pods('production','app=html2md');assert len(items)==1
 d=items[0];return {'uid':d['metadata']['uid'],'name':d['metadata']['name'],
 'restarts':[c['restartCount'] for c in d['status']['containerStatuses']]}
def node(code,container='capture',role='html2md-capture'):
 return k(['-n',NS,'exec','deploy/'+role,'-c',container,'--','node','-e',code])
def route():
 doc={'apiVersion':'networking.k8s.io/v1','kind':'Ingress','metadata':{'name':'rollback-drill','namespace':NS,
 'annotations':{'konghq.com/strip-path':'true','konghq.com/preserve-host':'false','konghq.com/plugins':'verify-tls',
 'konghq.com/protocols':'https','konghq.com/request-buffering':'false','konghq.com/response-buffering':'false'}},
 'spec':{'ingressClassName':'kong','rules':[{'host':'api.2md.traylinx.com','http':{'paths':[{'path':BASE,'pathType':'Prefix',
 'backend':{'service':{'name':'html2md-capture','port':{'number':8270}}}}]}}]}}
 k(['apply','-f','-'],json.dumps(doc))
 for _ in range(30):
  if request(BASE+'/health')['status']==200:return
  time.sleep(1)
 raise RuntimeError('Lab route did not become ready')
def remove():k(['-n',NS,'delete','ingress','rollback-drill','--ignore-not-found=true'])
before=legacy();record['legacy_before']=before
baseline=request(BASE+'/api/capture/v1',{});assert baseline['status']==404
old=pods(NS,'app=html2md-capture')[0];record['old_capture_uid']=old['metadata']['uid']
record['image']=old['spec']['containers'][0]['image']
try:
 route();event('lab-only TLS route ready')
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  pending=pool.submit(request,BASE+'/api/capture/v1',{'url':HOST+FIXTURE+'/never','budgetMs':30000},True)
  for _ in range(15):
   count=int(node("console.log(require('fs').readdirSync('/tmp').filter(n=>n.startsWith('2md-capture-')).length)").strip())
   if count:break
   if pending.done():
    result=pending.result();event('request completed before worker observation',status=result['status'],response=result['body'][:500]);break
   time.sleep(.25)
  assert count>0,'No active worker observed'
  event('in-flight Chromium operation observed',profiles=count)
  remove();k(['-n',NS,'scale','deploy/html2md-capture','--replicas=0'])
  started=time.monotonic()
  while pods(NS,'app=html2md-capture'):
   check=request('/api/health');record['legacy_health'].append({'at':time.time(),'status':check['status']});assert check['status']==200
   assert time.monotonic()-started<85,'Drain exceeded bounded grace'
   time.sleep(1)
  outcome=pending.result();assert outcome['status'] in (499,502,503,504),outcome['status']
  assert '"success":true' not in outcome['body']
  event('route removed and active pod drained',response_status=outcome['status'],drain_seconds=round(time.monotonic()-started,2))
 for _ in range(20):
  fallen=request(BASE+'/api/capture/v1',{})
  if fallen['status']==404:break
  time.sleep(1)
 assert fallen['status']==404 and fallen['sha256']==baseline['sha256']
 event('removed route matches original legacy 404 bytes',sha256=fallen['sha256'])
 closed=node("const net=require('net');Promise.all([8281,8282].map(port=>new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port});s.on('connect',()=>{s.destroy();reject(Error('lease remained open'))});s.on('error',resolve)}))).then(()=>console.log('both leases closed')).catch(()=>process.exit(1))",'egress','html2md-capture-egress')
 event('proxy leases revoked',detail=closed.strip())
 k(['-n',NS,'scale','deploy/html2md-capture','--replicas=1']);k(['-n',NS,'rollout','status','deploy/html2md-capture','--timeout=120s'])
 current=pods(NS,'app=html2md-capture')[0];assert current['metadata']['uid']!=record['old_capture_uid']
 assert node("console.log(require('fs').readdirSync('/tmp').filter(n=>n.startsWith('2md-capture-')).length)").strip()=='0'
 event('fresh pod has no previous session files',uid=current['metadata']['uid'])
 route()
 private={'url':HOST+FIXTURE+'/report','loginUrl':HOST+FIXTURE+'/login','budgetMs':30000,
 'login':{'submitPath':FIXTURE+'/login','readPaths':[FIXTURE+'/report'],
 'fields':{'form':'#login','username':'#user','password':'#pass','submit':'#submit'},'proof':{'selector':'#identity','attribute':'data-user'}},
 'auth':{'mode':'inlineOnce','username':'synthetic-user','password':'SYNTHETIC_PASSWORD_CANARY'}}
 ok=request(BASE+'/api/capture/v1/authenticated',private,True);assert ok['status']==200
 assert 'SYNTHETIC_PASSWORD_CANARY' not in ok['body'] and 'SYNTHETIC_SESSION_CANARY' not in ok['body']
 fresh=request(BASE+'/api/capture/v1',{'url':HOST+FIXTURE+'/report'},True)
 assert fresh['status']==422 and json.loads(fresh['body'])['code']=='AUTH_REQUIRED'
 event('restored runtime requires new credentials and cannot reuse prior session')
 record['legacy_after']=legacy();assert record['legacy_after']==before
 record['passed']=True;event('rollback drill passed; legacy UID and restart counts unchanged')
finally:
 remove()
 k(['-n',NS,'scale','deploy/html2md-capture','--replicas=1'])
 (OUT/'RESULT.json').write_text(json.dumps(record,indent=2)+'\n')
