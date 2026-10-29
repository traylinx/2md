'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts'),f=require('../../lib/browser/fieldInput');
const {createRemoteInput}=require('../../lib/browser/remoteInput');
const {bound,owner,grant,privateKey}=require('./support.cjs');
const origin='https://unfamiliar.example.org';
const input={sessionId:'session1',origin,purpose:'Continue the requested access flow',observationId:'obs1',fields:[{ref:'field1',label:'Workspace phrase'},{ref:'field2',label:'Employee identifier'},{ref:'field3',label:'Verification value'}],submitRef:'continue1'};
function fixture(){const broker=createRemoteInput({describeSession:async()=>({mode:'login_read',ownerId:owner.workspaceUserId,expiresAt:Date.now()+60000}),verifyCompletion:async proof=>proof==='owner',verifyDecision:async(proof,_b,record)=>proof==='signed'?record:null});return broker;}
function action(id,overrides={}){return {sessionId:input.sessionId,runtimeEpoch:'epoch1',actionId:'act1',credentialRef:id,...f.selection(input),...overrides};}
function decision(request){return {sessionId:request.sessionId,operationId:request.actionId,operationDigest:c.digest(request),recipients:[origin],nonce:request.actionId,expiresAt:Date.now()+30000};}
test('generic contract has arbitrary labels, optional submit, no secret argument, no partial selection',()=>{
 assert.deepEqual(c.parseTool('browser_credentials',input),input);
 const fill={...input};delete fill.submitRef;assert.doesNotThrow(()=>c.parseTool('browser_credentials',fill));
 const a=action('ref1');delete a.submitRef;assert.doesNotThrow(()=>c.parseTool('browser_authenticate',a));
 for(const bad of [{...input,values:['secret']},{...input,fields:[input.fields[0],input.fields[0]]},{...input,submitRef:'field1'},{...input,observationId:undefined}])assert.throws(()=>c.parseTool('browser_credentials',bad));
 assert.throws(()=>c.parseTool('browser_authenticate',{...action('ref1'),fields:{passwordRef:'p'},submitRef:undefined}));
});
test('one protected field set is exact-bound and consumed once, no username/password assumption',async()=>{
 const broker=fixture();try{
 const pending=await broker.request({bound,input}),id=pending.interventionId;
 await assert.rejects(broker.request({bound,input:{...input,fields:[{ref:'different',label:'changed'}]}}),{code:'BUSY'});
 await assert.rejects(broker.supply(bound,{interventionId:id,values:['too few'],proof:'owner'}));
 await assert.rejects(broker.supply(bound,{interventionId:id,values:['one','two','three'],proof:'model yes'}));
 await broker.supply(bound,{interventionId:id,values:['SECRET_ONE','SECRET_TWO','SECRET_THREE'],proof:'owner'});
 const changed=action(id,{submitRef:'other'});await assert.rejects(broker.prepare(bound,{request:changed,proof:'signed',decision:decision(changed),recipients:[origin]}),{code:'PERMISSION_REQUIRED'});
 const request=action(id),d=decision(request);await broker.prepare(bound,{request,proof:'signed',decision:d,recipients:[origin]});
 const provider=broker.provider(bound);await provider.verifyDecision('signed',d);let buffers;
 await provider.credentialAccess({credentialRef:id,sessionId:input.sessionId,origin,recipients:[origin]},async secret=>{buffers=Object.values(secret);assert.deepEqual(buffers.map(b=>b.toString()),['SECRET_ONE','SECRET_TWO','SECRET_THREE']);});
 assert.ok(buffers.every(b=>b.every(v=>v===0)));await assert.rejects(broker.inspect(bound,id),{code:'SESSION_LOST'});
 }finally{broker.close();}
});
test('completion signature binds field selection, observation and optional submit',async()=>{
 const {createCompletionSigner,createCompletionVerifier}=require('../../lib/browser/completionProof');
 const record={interventionId:'entry1',sessionId:input.sessionId,ownerId:owner.workspaceUserId,origin,recipients:[origin],expiresAt:Date.now()+60000,...f.selection(input)};
 const signer=createCompletionSigner({privateKey,bound,grantId:'grant-1',verifyOwner:async context=>context});
 const verify=createCompletionVerifier({authorize:async()=>({...grant(),hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId}),consumeNonce:async()=>true});
 const proof=await signer(record,owner);
 for(const changed of [{...record,observationId:'other'},{...record,submitRef:'other'},{...record,fields:[{ref:'different',label:'same label'}]}])await assert.rejects(verify(proof,bound,changed));
 assert.equal(await verify(proof,bound,record),true);
});
test('generic IPC preserves bounded slots and rejects unexpected keys',()=>{
 const b=f.buffers(input,['a','b','c']),encoded=f.encode(b),decoded=f.decode(encoded);
 assert.deepEqual(Object.values(decoded).map(x=>x.toString()),['a','b','c']);assert.ok(Object.values(encoded).every(x=>x===''));
 for(const bad of [{field_1:Buffer.from('a')},{field_0:Buffer.from('a'),password:Buffer.from('b')},{field_0:Buffer.alloc(17000)}])assert.throws(()=>f.encode(bad));
 assert.throws(()=>f.decode(JSON.parse('{"__proto__":"YQ=="}')));assert.throws(()=>f.decode({field_0:'not base64!'}));
});
test('protected generic form works over signed host HTTP, escapes labels and never echoes values',async()=>{
 const express=require('express'),request=require('supertest');
 const {createBrowserInputRouter}=require('../../routes/browserInput'),{createHostVerifier}=require('../../lib/browser/hostProof');
 const {createCompletionVerifier}=require('../../lib/browser/completionProof'),{createBrowserHttpClient}=require('../../lib/browser/httpClient');
 const {createRemoteCredentialProvider}=require('../../lib/browser/remoteCredentialProvider'),{createCredentialSurface}=require('../../lib/browser/credentialSurface');
 const g={...grant(),hostKeyFingerprint:bound.hostKeyFingerprint,approvedByWorkspaceUserId:owner.workspaceUserId},nonces=new Set();
 const consumeNonce=async({nonce})=>{if(nonces.has(nonce))return false;nonces.add(nonce);return true;},authorize=async()=>g;
 const broker=createRemoteInput({describeSession:async()=>({mode:'login_read',ownerId:owner.workspaceUserId,expiresAt:g.expiresAt}),verifyCompletion:createCompletionVerifier({authorize,consumeNonce}),verifyDecision:async()=>null});
 const verify=createHostVerifier({authorize,consumeNonce}),app=express(),replies=[];
 app.use('/api/browser/v1',createBrowserInputRouter({enabled:true,broker,resolveCaller:async()=>bound,verifyHost:args=>verify({...args,proof:args.request.headers['x-browser-host-proof'],grantId:g.grantId})}));
 const client=createBrowserHttpClient({url:'https://browser.example.org/api/browser/v1',bound,grantId:g.grantId,privateKey,agentId:'agent1',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent1','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async(url,options)=>{const r=await request(app).post(new URL(url).pathname).set(options.headers).send(JSON.parse(options.body));replies.push(r.text);return new Response(r.text,{status:r.status,headers:r.headers});}});
 const provider=createRemoteCredentialProvider({client,bound,grantId:g.grantId,privateKey,verifyOwner:async context=>context});
 const surface=await createCredentialSurface({provider,ownerContext:async req=>{if(req.headers.cookie!=='owned=1')c.deny('FORBIDDEN');return owner;}});
 try{
 const selected={...input,fields:[{ref:'a',label:'<script>not trusted</script>'},{ref:'b',label:'Other value'}]};
 const id=(await broker.request({bound,input:selected})).interventionId,url=surface.urlFor(id);
 assert.equal((await fetch(url)).status,403);
 const page=await fetch(url,{headers:{cookie:'owned=1'}}),html=await page.text();assert.equal(page.status,200);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/name="field_0" type="password"/);
 const csrf=/name="csrf" value="([^"]+)"/.exec(html)[1],headers={cookie:'owned=1',Origin:new URL(url).origin,'Content-Type':'application/x-www-form-urlencoded'};
 const body=new URLSearchParams({csrf,field_0:'SYNTHETIC_PHRASE',field_1:'SYNTHETIC_OTHER'});
 const response=await fetch(url,{method:'POST',headers,body});assert.equal(response.status,200);assert.doesNotMatch(await response.text(),/SYNTHETIC/);assert.doesNotMatch(replies.join('\n'),/SYNTHETIC/);
 assert.equal((await fetch(url,{method:'POST',headers,body})).status,403);
 assert.equal((await broker.request({bound,input:selected})).state,'ready');
 }finally{await surface.close();broker.close();}
});
test('short protected values redact content without corrupting IDs, enums or URL hosts',()=>{
 const {redactOutput}=require('../../lib/browser/outputRedaction');
 const output=redactOutput({observationId:'obs1',ref:'ref1',state:'active',source:{url:'https://example.com/x/1?q=1',privacy:'private'},name:'Value 1',text:'code 1',evidence:[{id:'ev_123',text:'1'}]},['1']);
 assert.equal(output.observationId,'obs1');assert.equal(output.ref,'ref1');assert.equal(output.evidence[0].id,'ev_123');assert.equal(output.source.privacy,'private');assert.equal(output.text,'code [REDACTED]');
 assert.equal(new URL(output.source.url).hostname,'example.com');assert.equal(new URL(output.source.url).searchParams.get('q'),'[REDACTED]');
 assert.match(output.source.url,/%5BREDACTED%5D/);
});
