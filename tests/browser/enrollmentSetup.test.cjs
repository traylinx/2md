'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startEnrollmentSetup}=require('../../lib/browser/enrollmentSetup');
const {createEnrollment}=require('../../lib/browser/enrollment');
const {createEnrollmentVerifier}=require('../../lib/browser/enrollmentProof');
const {loadHostConnection}=require('../../lib/browser/hostConnection');
const {principal,owner}=require('./support.cjs');
function fixture(){
 const records=new Map(),nonces=new Set();let original;
 const enrollment=createEnrollment({repository:{create:async r=>records.set(r.grantId,r),get:async({grantId})=>records.get(grantId),revoke:async()=>{}},resolveCurrentAgent:async()=>principal});
 const verify=createEnrollmentVerifier({consumeNonce:async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;}});
 const fetchImpl=async(url,opts)=>{
  assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');assert.equal(opts.headers.Authorization,undefined);
  assert.equal(opts.headers['X-Agent-User-Id'],'service1');
  const body=JSON.parse(opts.body),operation=url.split('/').pop();let value;
  if(operation==='identity')value=principal;
  else{const host=operation==='begin'?body:await enrollment.host(body.enrollmentId,principal);
   await verify({principal,hostId:host.hostId,hostPublicKey:host.hostPublicKey,path:new URL(url).pathname,body,proof:opts.headers['X-Browser-Enrollment-Proof']});
   if(operation==='begin'){original=body;value=await enrollment.begin(principal,body);}else value=await enrollment.exchange(body.enrollmentId,principal,body);
  }
  return Response.json(value,{headers:{'Cache-Control':'no-store'}});
 };
 return {enrollment,records,fetchImpl,get original(){return original;}};
}
test('installer completes actual loopback PKCE callback and writes loadable exclusive host file only after approval',async()=>{
 const f=fixture(),dir=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'gb01-enroll-'));fs.chmodSync(dir,0o700);let setup;
 try{
  const file=path.join(dir,'host.json');setup=await startEnrollmentSetup({url:'https://browser.example.org/api/browser/enrollment/v1',ownerSetupUrl:'https://traylinx.example.org/admin/browser/connect',file,organizationId:principal.organizationId,projectId:principal.projectId,agentId:'service1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'service1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:f.fetchImpl});
  assert.equal(fs.existsSync(file),false);assert.equal(f.records.size,0);
  const wrong=new URL(f.original.redirectUri);wrong.searchParams.set('state','x'.repeat(43));wrong.searchParams.set('code','x'.repeat(43));assert.equal((await fetch(wrong)).status,403);assert.equal(fs.existsSync(file),false);
  const id=new URL(setup.url).searchParams.get('enrollmentId');const approved=await f.enrollment.approve(id,owner);
  const response=await fetch(approved.redirectUri);assert.equal(response.status,200);assert.match(await response.text(),/connected/);assert.deepEqual(await setup.done,{file});
  const saved=loadHostConnection(file);assert.equal(saved.bound.hostKeyFingerprint,setup.hostKeyFingerprint);assert.equal(saved.bound.principal.projectId,principal.projectId);assert.equal(fs.statSync(file).mode&0o777,0o600);
 }finally{setup?.close();f.enrollment.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('installer rejects unsafe setup URL before contacting service',async()=>{
 await assert.rejects(startEnrollmentSetup({ownerSetupUrl:'http://untrusted.example/admin/browser/connect',fetchImpl:()=>{throw Error('must not call');}}),{code:'UNAVAILABLE'});
});
