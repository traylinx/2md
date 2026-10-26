#!/usr/bin/env python3
"""Scoped live-network qualification with synthetic identity, login and content.
Never replaces production html2md or publishes its new capture routes.
"""
import argparse, json, shlex, subprocess, time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--namespace',required=True);p.add_argument('--evidence',type=Path,required=True);p.add_argument('--verify-only',action='store_true');a=p.parse_args()
ROOT=Path(__file__).resolve().parents[2];NS=a.namespace;OUT=a.evidence.resolve();OUT.mkdir(parents=True,exist_ok=True)
assert NS.startswith('html2md-qualification-network-')
SUFFIX=NS.rsplit('-',1)[1];PREFIX='/__capture-fixture-'+SUFFIX;HOST='https://api.2md.traylinx.com'

def k(args,data=None,check=True,timeout=180):
 r=subprocess.run(['ssh','-o','BatchMode=yes','traylinx-k3s-01','kubectl '+' '.join(shlex.quote(s) for s in args)],input=data,text=True,capture_output=True,timeout=timeout)
 if check and r.returncode:raise RuntimeError(r.stderr[-1500:])
 return r

def apply(doc):return k(['apply','-f','-'],json.dumps(doc))
def meta(name):return {'name':name,'namespace':NS,'labels':{'purpose':'html2md-qualification'}}
def node(code,role='html2md-capture'):
 return k(['-n',NS,'exec','deploy/'+role,'-c','capture' if role=='html2md-capture' else 'egress','--','node','-e',code],timeout=120).stdout

def fetch(path):
 r=subprocess.run(['curl','--silent','--show-error','--max-time','10','-w','\n%{http_code}',HOST+path],text=True,capture_output=True,timeout=15)
 if r.returncode:raise RuntimeError('curl transport failed')
 body,status=r.stdout.rsplit('\n',1);return int(status),body

if not a.verify_only:
 if k(['get','namespace',NS],check=False).returncode==0:raise SystemExit('Namespace exists; use retained state, do not restart blindly')
 apply({'apiVersion':'v1','kind':'Namespace','metadata':{'name':NS,'labels':{'purpose':'html2md-qualification'}}})
 # Copy only the deployment TLS Secret inside the cluster; no private-key output or local file.
 remote="kubectl -n production get secret api-2md-traylinx-com-tls -o json | python3 -c "+shlex.quote("import json,sys;d=json.load(sys.stdin);d['metadata']={'name':'api-2md-traylinx-com-tls','namespace':"+repr(NS)+"};print(json.dumps(d))")+" | kubectl apply -f -"
 r=subprocess.run(['ssh','traylinx-k3s-01',remote],text=True,capture_output=True,timeout=60);assert r.returncode==0,r.stderr
 # Platform lease-control key, generated and retained only as a cluster Secret.
 remote="python3 -c "+shlex.quote("import secrets,json;print(json.dumps({'apiVersion':'v1','kind':'Secret','metadata':{'name':'html2md-capture-control','namespace':"+repr(NS)+"},'stringData':{'token':secrets.token_urlsafe(48)}}))")+" | kubectl apply -f -"
 r=subprocess.run(['ssh','traylinx-k3s-01',remote],text=True,capture_output=True,timeout=60);assert r.returncode==0,r.stderr
 raw=subprocess.check_output(['python3',str(ROOT/'deploy/capture/render.py'),'--image',a.image,'--namespace',NS],text=True)
 manifest=json.loads(raw)
 for obj in manifest['items']:
  if obj['kind']=='ConfigMap':obj['data']['grants.json']=json.dumps({'lab-agent':{'operations':['capture:public','capture:authenticated'],'origins':[HOST]}})
  if obj['kind']=='Deployment' and obj['metadata']['name']=='html2md-capture':
   for env in obj['spec']['template']['spec']['containers'][0]['env']:
    if env['name']=='CAPTURE_AUTH_URL':env['value']=HOST+PREFIX+'/identity'
 apply(manifest)
 (OUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
 fixture_data={'fixture.cjs':(ROOT/'tests/capture/cluster-fixture.cjs').read_text()}
 for name in ['key.pem','cert.pem']:fixture_data[name]=(Path('/Users/sebastian/MAKAKOO/tmp/html2md-capture-fixtures')/name).read_text()
 apply({'apiVersion':'v1','kind':'ConfigMap','metadata':meta('fixture'),'data':fixture_data})
 apply({'apiVersion':'networking.k8s.io/v1','kind':'NetworkPolicy','metadata':meta('fixture-isolation'),'spec':{
  'podSelector':{'matchLabels':{'app':'fixture'}},'policyTypes':['Ingress','Egress'],'egress':[],
  'ingress':[{'from':[{'namespaceSelector':{'matchLabels':{'kubernetes.io/metadata.name':'kong'}}}],
  'ports':[{'protocol':'TCP','port':p} for p in [8445,8446]]}]}})
 apply({'apiVersion':'apps/v1','kind':'Deployment','metadata':meta('fixture'),'spec':{'replicas':1,'selector':{'matchLabels':{'app':'fixture'}},'template':{'metadata':{'labels':{'app':'fixture'}},'spec':{
  'automountServiceAccountToken':False,'nodeSelector':{'kubernetes.io/hostname':'traylinx-k3s-03'},
  'securityContext':{'runAsUser':1000,'runAsGroup':1000,'fsGroup':1000,'runAsNonRoot':True,'seccompProfile':{'type':'RuntimeDefault'}},
  'containers':[{'name':'fixture','image':a.image,'command':['node','/fixtures/fixture.cjs'],'env':[{'name':'FIXTURE_PREFIX','value':PREFIX}],
  'securityContext':{'readOnlyRootFilesystem':True,'allowPrivilegeEscalation':False,'capabilities':{'drop':['ALL']}},
  'resources':{'requests':{'cpu':'20m','memory':'32Mi'},'limits':{'cpu':'100m','memory':'128Mi'}},
  'volumeMounts':[{'name':'fixture','mountPath':'/fixtures','readOnly':True},{'name':'tls','mountPath':'/tls','readOnly':True}]}],
  'volumes':[{'name':'fixture','configMap':{'name':'fixture'}},{'name':'tls','secret':{'secretName':'api-2md-traylinx-com-tls','defaultMode':0o440}}]}}}})
 apply({'apiVersion':'configuration.konghq.com/v1','kind':'KongPlugin','metadata':meta('verify-tls'),'plugin':'pre-function','config':{'access':[(ROOT/'deploy/capture/verify-upstream.lua').read_text()]}})
 for name,port,hostname,app in [('fixture',8445,'api.2md.traylinx.com','fixture'),('badname',8445,'wrong.invalid','fixture'),('badca',8446,'capture.example.com','fixture'),('capture-probe',8270,'api.2md.traylinx.com','html2md-capture')]:
  m=meta(name);m['annotations']={'konghq.com/protocol':'https','konghq.com/host-header':hostname,'konghq.com/retries':'0'}
  apply({'apiVersion':'v1','kind':'Service','metadata':m,'spec':{'selector':{'app':app},'ports':[{'port':port,'targetPort':port}]}})
  paths=[{'path':PREFIX,'pathType':'Prefix','backend':{'service':{'name':'fixture','port':{'number':8445}}}}]
 for name,port in [('badname',8445),('badca',8446),('capture-probe',8270)]:
  paths.append({'path':f'/__capture-{name}-{SUFFIX}','pathType':'Exact','backend':{'service':{'name':name,'port':{'number':port}}}})
 m=meta('fixture-ingress');m['annotations']={'konghq.com/strip-path':'false','konghq.com/preserve-host':'false','konghq.com/plugins':'verify-tls','konghq.com/protocols':'https','konghq.com/request-buffering':'false','konghq.com/response-buffering':'false'}
 apply({'apiVersion':'networking.k8s.io/v1','kind':'Ingress','metadata':m,'spec':{'ingressClassName':'kong','rules':[{'host':'api.2md.traylinx.com','http':{'paths':paths}}]}})
 for role in ['fixture','html2md-capture-egress','html2md-capture']:k(['-n',NS,'rollout','status','deploy/'+role,'--timeout=120s'])
 time.sleep(8)
checks=[]
def check(name,work):
 try:detail=work();checks.append({'name':name,'passed':True,'detail':detail});print('PASS '+name,flush=True)
 except Exception as e:checks.append({'name':name,'passed':False,'error':str(e)[:500]});print('FAIL '+name,flush=True)
 (OUT/'RESULT.json').write_text(json.dumps({'namespace':NS,'image':a.image,'passed':all(x['passed'] for x in checks),'checks':checks},indent=2)+'\n')
def status(path,expected,marker=None):
 code,body=fetch(path);assert code==expected,(code,body[:150]);assert marker is None or marker in body;return {'status':code}
check('verified upstream certificate and hostname',lambda:status(PREFIX+'/article',200,'Owned private report'))
check('wrong upstream hostname fails closed',lambda:status('/__capture-badname-'+SUFFIX,502))
check('untrusted upstream CA fails closed',lambda:status('/__capture-badca-'+SUFFIX,502))
check('Kong reaches the TLS frontend with verified upstream certificate',lambda:status('/__capture-capture-probe-'+SUFFIX,404))

def sidecar_boundary():
 code="""const assert=require('assert/strict'),fs=require('fs'),http=require('http');
assert.equal(fs.existsSync('/capture-tls/tls.key'),false);
const tcp=fs.readFileSync('/proc/net/tcp','utf8').split('\\n');
assert(tcp.some(l=>l.includes('0100007F:204F'))); // 8271 loopback only
assert(!tcp.some(l=>l.includes('00000000:204F')));
const q=http.get('http://127.0.0.1:8270/health',r=>{r.resume();process.exitCode=1});
q.setTimeout(2000,()=>{q.destroy();process.exitCode=1});q.on('error',()=>console.log('TLS key absent; backend loopback only; plaintext frontend refused'));
"""
 return node(code).strip()
check('sidecar key isolation loopback binding and plaintext rejection',sidecar_boundary)

def network():
 code="""const net=require('net');async function blocked(host,port){return new Promise((resolve,reject)=>{const s=net.connect({host,port});s.setTimeout(1200,()=>{s.destroy();resolve()});s.on('connect',()=>{s.destroy();reject(Error('Unexpected connection '+host))});s.on('error',()=>resolve())})};(async()=>{for(const [h,p] of [['10.43.0.1',443],['169.254.169.254',80],['1.1.1.1',443]])await blocked(h,p);console.log('3 prohibited direct connections refused')})().catch(e=>{console.error(e.message);process.exit(1)})"""
 return node(code).strip()
check('capture container denies private metadata and direct Internet',network)

def operation(private=False,bad=False,public_report=False):
 body={'url':HOST+PREFIX+('/report' if private or public_report else '/article'),'budgetMs':30000}
 if private:body.update(loginUrl=HOST+PREFIX+'/login',login={'submitPath':PREFIX+'/login','readPaths':[PREFIX+'/report'],
  'fields':{'form':'#login','username':'#user','password':'#pass','submit':'#submit'},'proof':{'selector':'#identity','attribute':'data-user'}},
  auth={'mode':'inlineOnce','username':'synthetic-user','password':'wrong' if bad else 'SYNTHETIC_PASSWORD_CANARY'})
 code="""const https=require('https'),fs=require('fs');const body=BODY;const q=https.request({hostname:'127.0.0.1',port:8270,servername:'api.2md.traylinx.com',path:PATH,method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer synthetic-lab-token'}},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{const d=JSON.parse(b);if(/SYNTHETIC_PASSWORD_CANARY|SYNTHETIC_SESSION_CANARY/.test(b))throw Error('Secret leak');console.log(JSON.stringify({status:r.statusCode,success:d.success,code:d.code,content:!!d.markdown?.includes('Owned private report'),profiles:fs.readdirSync('/tmp').filter(n=>n.startsWith('2md-capture-')).length,noStore:r.headers['cache-control']==='no-store'}))})});q.on('error',()=>process.exit(1));q.end(JSON.stringify(body));""".replace('BODY',json.dumps(body)).replace('PATH',json.dumps('/api/capture/v1/authenticated' if private else '/api/capture/v1'))
 result=json.loads(node(code));assert result['profiles']==0 and result['noStore'],result
 if public_report:assert result['status']==422 and result['code']=='AUTH_REQUIRED' and not result['success'],result
 elif bad:assert result['status']==422 and not result['success'],result
 else:assert result['status']==200 and result['success'] and result['content'],result
 return result
check('public capture via actual API identity proxy and worker',operation)
check('agent-driven transient login end to end',lambda:operation(True))
check('wrong website password refuses content and cleans session',lambda:operation(True,True))
check('new public capture cannot reuse previous private browser session',lambda:operation(public_report=True))
print(json.dumps({'passed':all(x['passed'] for x in checks),'checks':len(checks),'namespace':NS}))
raise SystemExit(0 if all(x['passed'] for x in checks) else 1)
