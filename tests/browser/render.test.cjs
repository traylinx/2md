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
