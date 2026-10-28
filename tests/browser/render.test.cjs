'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.resolve(__dirname,'../../deploy/browser/render.py');
const image='ghcr.io/traylinx/browser@sha256:'+'a'.repeat(64);
test('candidate deployment stays inert and isolated with usable enabled listener probes',()=>{
 const result=JSON.parse(execFileSync('python3',[script,'--image',image,'--node-name','owned-node']));
 const deployments=result.items.filter(x=>x.kind==='Deployment');assert.equal(deployments.length,2);
 for(const d of deployments){
  assert.equal(d.spec.replicas,0);const pod=d.spec.template.spec,container=pod.containers[0];
  assert.equal(pod.automountServiceAccountToken,false);assert.equal(pod.enableServiceLinks,false);
  assert.equal(container.image,image);assert.equal(container.securityContext.readOnlyRootFilesystem,true);
  assert.deepEqual(container.securityContext.capabilities.drop,['ALL']);
  assert.equal(container.readinessProbe.httpGet.path,'/health');assert.equal(container.startupProbe.httpGet.port,container.ports[0].containerPort);
 }
 const env=Object.fromEntries(deployments.find(x=>x.metadata.name.endsWith('runtime')).spec.template.spec.containers[0].env.map(x=>[x.name,x.value]));
 assert.equal(env.BROWSER_HOST,'0.0.0.0');assert.equal(env.BROWSER_PORT,'8292');
 for(const key of ['BROWSER_ENABLED','BROWSER_PRIVATE_ENABLED','BROWSER_ENROLLMENT_ENABLED'])assert.equal(env[key],'0');
 for(const policy of result.items.filter(x=>x.kind==='NetworkPolicy')){assert.deepEqual(policy.spec.ingress,[]);assert.deepEqual(policy.spec.egress,[]);}
 assert.equal(result.items.some(x=>['Ingress','Secret'].includes(x.kind)),false);
});
test('renderer refuses mutable image references',()=>{
 assert.notEqual(spawnSync('python3',[script,'--image','ghcr.io/traylinx/browser:latest','--node-name','owned-node']).status,0);
});
test('candidate network separates runtime dependencies from public proxy egress',()=>{
 const network=path.resolve(__dirname,'../../deploy/browser/render-network.py');
 const args=[network,'--database-ip','100.69.18.112'];
 const {items}=JSON.parse(execFileSync('python3',args));assert.equal(items.length,2);
 const runtime=items.find(x=>x.metadata.name.includes('runtime')).spec,egress=items.find(x=>x.metadata.name.includes('egress')).spec;
 const blocks=spec=>spec.egress.flatMap(rule=>(rule.to||[]).filter(x=>x.ipBlock).map(x=>({block:x.ipBlock,ports:rule.ports})));
 assert.deepEqual(blocks(runtime),[{block:{cidr:'100.69.18.112/32'},ports:[{protocol:'TCP',port:5432},{protocol:'TCP',port:6379}]}]);
 assert.equal(blocks(egress).length,1);const publicRule=blocks(egress)[0];
 assert.equal(publicRule.block.cidr,'0.0.0.0/0');
 for(const cidr of ['10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16'])assert.ok(publicRule.block.except.includes(cidr));
 assert.deepEqual(publicRule.ports.map(x=>x.port),[80,443]);
 assert.deepEqual(egress.ingress[0].from,[{podSelector:{matchLabels:{app:'traylinx-browser-runtime'}}}]);
 assert.notEqual(spawnSync('python3',[network,'--database-ip','0.0.0.0']).status,0);
});
test('runtime bindings reference scoped secrets and TLS without activation or credential values',()=>{
 const args=[script,'--image',image,'--node-name','owned-node','--runtime-bindings','--database-ip','100.69.18.112','--gateway-cluster-ip','10.43.131.119'];
 const {items}=JSON.parse(execFileSync('python3',args));const d=items.find(x=>x.kind==='Deployment'&&x.metadata.name.endsWith('runtime'));
 assert.equal(d.spec.replicas,0);const pod=d.spec.template.spec,c=pod.containers[0];
 assert.deepEqual(pod.hostAliases,[{ip:'100.69.18.112',hostnames:['traylinx-db']},{ip:'10.43.131.119',hostnames:['api.makakoo.com']}]);
 assert.equal(c.envFrom,undefined);assert.equal(c.env.find(x=>x.name==='BROWSER_ENABLED').value,'0');
 assert.equal(c.env.find(x=>x.name==='BROWSER_CONTAINMENT'),undefined,'qualification marker is not supplied by renderer');
 for(const key of ['POSTGRES_URL','ENROLLMENT_POSTGRES_URL','REDIS_URL','SENTINEL_CLIENT_SECRET']){
  const entry=c.env.find(x=>x.name==='BROWSER_'+key);assert.equal(entry.value,undefined);assert.deepEqual(entry.valueFrom.secretKeyRef,{name:'traylinx-browser-runtime',key:'BROWSER_'+key});
 }
 assert.equal(c.env.find(x=>x.name==='BROWSER_PROXY_TOKEN').valueFrom.secretKeyRef.name,'traylinx-browser-proxy');
 assert.ok(c.volumeMounts.some(x=>x.mountPath==='/postgres-tls'&&x.readOnly));
 assert.notEqual(spawnSync('python3',[script,'--image',image,'--node-name','owned-node','--runtime-bindings']).status,0);
 assert.notEqual(spawnSync('python3',[script,'--image',image,'--node-name','owned-node','--database-ip','100.69.18.112']).status,0);
});
