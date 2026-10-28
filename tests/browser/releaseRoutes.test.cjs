'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.resolve(__dirname,'../../deploy/browser/render-routes.py');
test('browser release routes are additive, HTTPS-only and closed by their own gate',()=>{
 const run=spawnSync('python3',[script],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const doc=JSON.parse(run.stdout);assert.equal(doc.items.length,2);
 const [gate,route]=doc.items;assert.equal(gate.plugin,'request-termination');assert.equal(gate.config.status_code,503);
 assert.equal(route.metadata.annotations['konghq.com/plugins'],gate.metadata.name);
 assert.equal(route.metadata.annotations['konghq.com/strip-path'],'false');assert.equal(route.metadata.annotations['konghq.com/protocols'],'https');
 assert.equal(route.spec.tls[0].hosts[0],route.spec.rules[0].host);
 const paths=route.spec.rules[0].http.paths;
 assert.deepEqual(paths.map(x=>x.path),['/api/browser/v1','/api/browser/enrollment/v1','/api/browser/control/v1']);
 for(const p of paths){assert.equal(p.pathType,'Prefix');assert.equal(p.backend.service.name,'traylinx-browser-runtime');assert.equal(p.backend.service.port.number,8292);}
 for(const item of doc.items){assert.equal(item.metadata.namespace,'production');assert.match(item.metadata.name,/^traylinx-browser-/);}
 assert.doesNotMatch(run.stdout,/\/health|\/web\/v1|\/approvals|8290|8291/);
});
test('invalid route namespace is rejected without rendering resources',()=>{
 const run=spawnSync('python3',[script,'--namespace','production\nunsafe'],{encoding:'utf8'});assert.notEqual(run.status,0);assert.equal(run.stdout,'');
});
