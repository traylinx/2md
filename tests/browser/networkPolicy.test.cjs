'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSessionNetwork}=require('../../lib/browser/networkPolicy');
const c=require('../../lib/browser/contracts');
function fixture(extra={}){
 let time=1000,drains=0;const policy=createSessionNetwork({sessionId:'session1',limits:c.LIMITS,navigation:{mode:'public_https'},lifetime:{remaining:()=>600000},now:()=>time,
 resolve:async url=>({url}),drainPublic:async()=>{drains++;},verifyDecision:async(proof,record)=>proof==='verified'?record:null,...extra});
 const record={sessionId:'session1',operationId:'private1',recipients:['https://site.example.org']};
 return {policy,record,advance:n=>{time+=n;},drains:()=>drains};
}
const req=(url='https://site.example.org/data',method='GET',more={})=>({url,method,type:'fetch',mainFrame:false,...more});
test('public resources are generic; HTTPS, methods, uploads and budgets enforced',async()=>{
 const {policy}=fixture({limits:{...c.LIMITS,maxRequests:6,maxTrafficBytes:10}});
 await policy.allow(req('https://unknown-cdn.example.org/script.js'));
 for(const r of [req('http://site.example.org'),req(undefined,'DELETE'),req(undefined,'POST',{upload:true}),req(undefined,'GET',{type:'websocket'})])await assert.rejects(policy.allow(r));
 await assert.rejects(policy.allow(req(undefined,'POST')),{code:'OPERATION_PERMISSION_REQUIRED'});
 await assert.rejects(policy.allow(req()),{code:'LIMIT_EXCEEDED'});
 policy.received(10);assert.throws(()=>policy.received(1),{code:'LIMIT_EXCEEDED'});
});
test('private transition is verified, drains public requests, and is irreversible',async()=>{
 const f=fixture();await assert.rejects(f.policy.enterPrivate('model-approved',f.record));assert.equal(f.policy.state().phase,'public');
 await f.policy.enterPrivate('verified',f.record);assert.equal(f.drains(),1);
 await f.policy.allow(req());await assert.rejects(f.policy.allow(req('https://cdn.example.org/exfil?encoded=x')),{code:'RECIPIENT_PERMISSION_REQUIRED'});
 await assert.rejects(f.policy.enterPrivate('verified',f.record));
 await f.policy.addRecipients('verified',{...f.record,operationId:'recipient2',recipients:['https://cdn.example.org']});
 await f.policy.allow(req('https://cdn.example.org/asset'));
});
test('phase change blocks an earlier public DNS authorization from forwarding',async()=>{
 let release;const f=fixture({resolve:()=>new Promise(r=>{release=r;})});
 const request=f.policy.allow(req('https://cdn.example.org/asset'));await f.policy.enterPrivate('verified',f.record);release({url:'old'});
 await assert.rejects(request,{code:'TARGET_DENIED'});
});
test('failed drain leaves closed context; concurrent transition cannot reopen',async()=>{
 const f=fixture({drainPublic:async()=>{throw Error('owned failure');}});
 await assert.rejects(f.policy.enterPrivate('verified',f.record));assert.equal(f.policy.state().phase,'closed');await assert.rejects(f.policy.allow(req()));
});
test('selected authentication allows bounded POST/OPTIONS without endpoint recipes',async()=>{
 const f=fixture();await f.policy.enterPrivate('verified',f.record);
 f.policy.startAuthentication({operationId:'auth1',origins:f.record.recipients,expiresAt:2000,maxRequests:2});
 await f.policy.allow(req('https://site.example.org/arbitrary-step','POST'));
 await f.policy.allow(req('https://site.example.org/arbitrary-api','OPTIONS'));
 await assert.rejects(f.policy.allow(req(undefined,'POST')),{code:'OPERATION_PERMISSION_REQUIRED'});
 f.advance(1001);await assert.rejects(f.policy.allow(req(undefined,'POST')));
 await assert.rejects(f.policy.allow(req('https://other.example.org/login','POST')),{code:'RECIPIENT_PERMISSION_REQUIRED'});
});
test('opaque POST requests one exact verified decision and buffers no body in prompt',async()=>{
 let seen;const f=fixture({requestDecision:async record=>{seen=record;return 'verified';}});
 await f.policy.allow(req('https://site.example.org/data?private=opaque','POST',{body:'SYNTHETIC_PRIVATE_BODY'}));
 assert.equal(seen.origin,'https://site.example.org');assert.equal(seen.bodyBytes,22);
 assert.doesNotMatch(JSON.stringify(seen),/SYNTHETIC_PRIVATE_BODY|private=opaque/);assert.equal(f.policy.state().pending,false);
});
test('only one intervention, 64KiB bound, cancellation never resumes pending operation',async()=>{
 let release;const f=fixture({requestDecision:()=>new Promise(r=>{release=r;})});
 await assert.rejects(f.policy.allow(req(undefined,'POST',{body:'x'.repeat(65537)})),{code:'LIMIT_EXCEEDED'});
 const first=f.policy.allow(req(undefined,'POST'));await new Promise(r=>setImmediate(r));
 await assert.rejects(f.policy.allow(req(undefined,'POST')),{code:'BUSY'});
 f.policy.close();release('verified');await assert.rejects(first,{code:'SESSION_LOST'});
});
test('pending decision cannot rewrite recipient scope or survive private transition',async()=>{
 let release,seen;const f=fixture({requestDecision:record=>{seen=record;return new Promise(r=>{release=r;});}});
 const first=f.policy.allow(req(undefined,'POST'));await new Promise(r=>setImmediate(r));
 assert.throws(()=>seen.recipients.push('https://other.example.org'));
 await f.policy.enterPrivate('verified',f.record);release('verified');
 await assert.rejects(first,{code:'PERMISSION_REQUIRED'});
});
test('private unknown recipient pauses before forwarding and becomes session-authorized only after exact proof',async()=>{
 let release,seen,calls=0;const f=fixture({requestDecision:record=>{calls++;seen=record;return new Promise(r=>{release=r;});}});
 await f.policy.enterPrivate('verified',f.record);
 let forwarded=false;const pending=f.policy.allow(req('https://new.example.org/asset?private=value')).then(()=>{forwarded=true;});
 await new Promise(r=>setImmediate(r));assert.equal(forwarded,false);assert.equal(seen.reason,'recipient');assert.equal(seen.origin,'https://new.example.org');assert.doesNotMatch(JSON.stringify(seen),/private=value/);
 release('verified');await pending;assert.equal(forwarded,true);
 await f.policy.allow(req('https://new.example.org/another'));assert.equal(calls,1);
});
test('denied recipient decision never widens scope and requires a new decision',async()=>{
 let calls=0;const f=fixture({requestDecision:async()=>{calls++;return 'untrusted';}});await f.policy.enterPrivate('verified',f.record);
 for(let i=0;i<2;i++)await assert.rejects(f.policy.allow(req('https://unapproved.example.org/asset')),{code:'PERMISSION_REQUIRED'});
 assert.equal(calls,2);assert.equal(f.policy.state().pending,false);
});
