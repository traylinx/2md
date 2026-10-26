#!/usr/bin/env python3
"""Explicit, additive, deny-all-first deployment after exact-image qualification.
Never reads website credentials or edits the existing html2md workload.
"""
import argparse, hashlib, json, shlex, subprocess, time, urllib.request, urllib.error
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--evidence',type=Path,required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
ROOT=Path(__file__).resolve().parents[2];E=a.evidence.resolve();build=json.loads((E/'review-build/BUILD.json').read_text())
image=build['image'];record={'image':image,'production_promoted':False,'access':'deny-all; principal grant pending','checks':[]}
if (E/'PRODUCTION_DEPLOYMENT.json').exists():raise SystemExit('Deployment evidence exists; inspect live state rather than replaying')
for name,digest in build['source_files'].items():
 assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,('Source changed after build',name)
for name in ['network-review/RESULT.json','cluster-load-review/RESULT.json','rollback-review-2/RESULT.json']:
 d=json.loads((E/name).read_text());assert d['passed'],name
 if 'image' in d:assert d['image']==image,name
for name in ['CAPTURE_REVIEW_FINAL_RESULTS.json','LEGACY_REVIEW_RESULTS.json']:
 d=json.loads((E/name).read_text());assert d['success'] and d['numFailedTests']==0,name
for name in ['browser','worker','transport','frontend']:
 d=json.loads((E/f'review-integration/{name}.json').read_text());assert d['failed']==0 and d['passed']>0
assert (E/'INDEPENDENT_REVIEW.md').is_file()
baseline=json.loads((E/'LIVE_SOURCE_HASHES.json').read_text())
for name,digest in baseline['sha256'].items():
 if name=='package.json':
  before=(ROOT/'docs/sprints/traylinx-web/S00A/PACKAGE_BEFORE.json').read_bytes()
  assert hashlib.sha256(before).hexdigest()==digest
  expected=json.loads(before);expected['scripts']['test:compat']='node scripts/test-compat.cjs'
  assert json.loads((ROOT/name).read_text())==expected
  # Dockerfile extends live image and does not COPY this development-only edit.
 else:assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,('Legacy source drift',name)
def k(args,data=None,check=True):
 r=subprocess.run(['ssh','-o','BatchMode=yes','traylinx-k3s-01','kubectl '+' '.join(shlex.quote(s) for s in args)],input=data,text=True,capture_output=True,timeout=180)
 if check and r.returncode:raise RuntimeError(r.stderr[-500:])
 return r
def snapshot():
 d=json.loads(k(['-n','production','get','deployment','html2md','-o','json']).stdout)
 pods=json.loads(k(['-n','production','get','pods','-l','app=html2md','-o','json']).stdout)['items'];assert len(pods)==1
 q=pods[0];return {'deployment_uid':d['metadata']['uid'],'generation':d['metadata']['generation'],
 'pod_uid':q['metadata']['uid'],'pod':q['metadata']['name'],
 'images':[c['image'] for c in d['spec']['template']['spec']['containers']],
 'restarts':[c['restartCount'] for c in q['status']['containerStatuses']]}
def request(path,token=False,http=False):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer deliberately-invalid-qualification-token'
 q=urllib.request.Request(('http' if http else 'https')+'://api.2md.traylinx.com'+path,
 data=b'{}' if path!='/api/health' else None,headers=headers)
 try:r=urllib.request.urlopen(q,timeout=10)
 except urllib.error.HTTPError as e:r=e
 body=r.read().decode();return {'status':r.status,'no_store':r.headers.get('cache-control')=='no-store','body':body}
if not a.apply:print(json.dumps({'qualified_image':image,'action':'dry-run; use --apply under existing deployment approval'}));raise SystemExit()
record['before']=snapshot()
assert request('/api/health')['status']==200
for kind,name in [('deployment','html2md-capture'),('deployment','html2md-capture-egress'),('secret','html2md-capture-control'),('ingress','html2md-capture-ingress')]:
 assert k(['-n','production','get',kind,name],check=False).returncode!=0,('Resource already exists',kind,name)
# Secret generated inside cluster. No value printed or retained locally.
code="import secrets,json;print(json.dumps({'apiVersion':'v1','kind':'Secret','metadata':{'name':'html2md-capture-control','namespace':'production'},'stringData':{'token':secrets.token_urlsafe(48)}}))"
r=subprocess.run(['ssh','traylinx-k3s-01','python3 -c '+shlex.quote(code)+' | kubectl apply -f -'],capture_output=True,text=True,timeout=60);assert r.returncode==0
manifest=json.loads(subprocess.check_output(['python3',str(ROOT/'deploy/capture/render.py'),'--image',image,'--ingress'],text=True))
assert all(json.loads(o['data']['grants.json'])=={} for o in manifest['items'] if o['kind']=='ConfigMap')
runtime={**manifest,'items':[o for o in manifest['items'] if o['kind'] not in ('KongPlugin','Ingress')]}
routes={**manifest,'items':[o for o in manifest['items'] if o['kind'] in ('KongPlugin','Ingress')]}
(E/'PRODUCTION_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
k(['apply','-f','-'],json.dumps(runtime))
for role in ['html2md-capture-egress','html2md-capture']:k(['-n','production','rollout','status','deploy/'+role,'--timeout=120s'])
record['runtime_ready']=True;print('additive production runtime ready; grants empty',flush=True)
try:
 k(['apply','-f','-'],json.dumps(routes))
 for _ in range(30):
  if request('/api/capture/v1')['status']==401:break
  time.sleep(1)
 for path in ['/api/capture/v1','/api/capture/v1/authenticated']:
  for token in [False,True]:
   d=request(path,token);assert d['status']==401 and d['no_store'],(path,d['status'])
   assert json.loads(d['body'])['code']=='UNAUTHENTICATED'
   record['checks'].append({'path':path,'invalid_platform_token':token,'status':d['status'],'no_store':d['no_store']})
  d=request(path,http=True);assert d['status']==426,(path,d['status'])
  record['checks'].append({'path':path,'plaintext_status':d['status']})
 for _ in range(5):
  d=request('/api/health');assert d['status']==200
  record['checks'].append({'legacy_health':200});time.sleep(1)
 record['after']=snapshot();assert record['after']==record['before']
 record['production_promoted']=True;record['verified_at_unix']=time.time()
 print('new routes verified; real AUTH rejects invalid token; legacy unchanged',flush=True)
except Exception:
 # Withdraw only the newly installed ingress. Keep bounded runtime for diagnosis.
 k(['-n','production','delete','ingress','html2md-capture-ingress','--ignore-not-found=true'])
 record['ingress_withdrawn_after_failed_verification']=True
 raise
finally:(E/'PRODUCTION_DEPLOYMENT.json').write_text(json.dumps(record,indent=2)+'\n')
