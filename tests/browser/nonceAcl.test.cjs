'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path'),crypto=require('node:crypto');
const script=path.resolve(__dirname,'../../deploy/browser/nonce-acl.py');
test('nonce ACL summary is inert and limited to nonce SET and readiness',()=>{
 const run=spawnSync('python3',[script],{encoding:'utf8'});assert.equal(run.status,0);
 const p=JSON.parse(run.stdout);assert.equal(p.applied,false);assert.equal(p.user,'browser-nonces-v1');
 assert.deepEqual(p.rules,['reset','on','sanitize-payload','resetchannels','~browser-v1:nonce:*','+ping','+info','+set']);
 assert.deepEqual(p.requires,{'maxmemory-policy':'noeviction',appendonly:'yes'});
});
test('protected ACL rendering hashes synthetic input and rejects malformed passwords',()=>{
 const password='x'.repeat(43),run=spawnSync('python3',[script,'--protected-acl-output'],{input:password+'\n',encoding:'utf8'});
 assert.equal(run.status,0);assert.ok(run.stdout.endsWith('#'+crypto.createHash('sha256').update(password).digest('hex')+'\n'));
 assert.ok(!run.stdout.includes(password));
 for(const input of ['short','x'.repeat(129),'x'.repeat(43)+'\nuser other on', 'x'.repeat(43)+'\n\n']){
  const bad=spawnSync('python3',[script,'--protected-acl-output'],{input,encoding:'utf8'});assert.notEqual(bad.status,0);assert.equal(bad.stdout,'');assert.ok(!bad.stderr.includes(input));
 }
});
