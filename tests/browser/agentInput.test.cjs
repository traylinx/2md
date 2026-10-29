'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../lib/browser/contracts'),{bound}=require('./support.cjs');
const {createRemoteInput}=require('../../lib/browser/remoteInput');
const {createAgentInputHost}=require('../../lib/browser/agentInputHost');
const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');
const metadata={sessionId:'s1',origin:'https://site.example.org',purpose:'User-directed read',observationId:'o1',fields:[{ref:'field1',label:'Code'}],submitRef:'button1'};
function fixture(){let allowed=false;const broker=createRemoteInput({agentAuthorized:async b=>allowed&&b.hostId===bound.hostId,describeSession:async()=>({mode:'login_read',ownerId:'owner1',expiresAt:Date.now()+90000}),verifyCompletion:async()=>{throw Error('Human proof must not be fabricated');},verifyDecision:async()=>{throw Error('Human proof must not be fabricated');}});return {broker,allow:()=>{allowed=true;},revoke:()=>{allowed=false;}};}
test('agent input default denied; explicit authority, exact selection, one-time wipe and no human proof',async()=>{
 const f=fixture();try{
 const id=(await f.broker.request({bound,input:metadata})).interventionId;
 await assert.rejects(f.broker.supplyAgent(bound,{interventionId:id,values:['SYNTHETIC']}),{code:'PERMISSION_REQUIRED'});f.allow();
 await assert.rejects(f.broker.supplyAgent({...bound,hostId:'other'},{interventionId:id,values:['SYNTHETIC']}),{code:'FORBIDDEN'});
 const supplied=await f.broker.supplyAgent(bound,{interventionId:id,values:['SYNTHETIC']});assert.doesNotMatch(JSON.stringify(supplied),/SYNTHETIC/);
 const request={sessionId:'s1',runtimeEpoch:'e1',actionId:'a1',credentialRef:id,observationId:'o1',fields:metadata.fields,submitRef:'button1'};
 await assert.rejects(f.broker.prepareAgent(bound,{request:{...request,submitRef:'other'}}),{code:'PERMISSION_REQUIRED'});
 await f.broker.prepareAgent(bound,{request});const provider=f.broker.provider(bound),decision=await provider.getAuthDecision(request);
 assert.match(decision.proof,/^agent:/);await provider.verifyDecision(decision.proof,decision.decision);let buffer;
 await provider.credentialAccess({credentialRef:id,sessionId:'s1',origin:metadata.origin,recipients:[metadata.origin]},async secret=>{buffer=secret.field_0;assert.equal(buffer.toString(),'SYNTHETIC');});assert.ok(buffer.every(b=>b===0));
 await assert.rejects(provider.credentialAccess({credentialRef:id},()=>{}),{code:'SESSION_LOST'});
 }finally{f.broker.close();}
});
test('revocation between preparation and consumption denies agent input',async()=>{
 const f=fixture();try{f.allow();const id=(await f.broker.request({bound,input:metadata})).interventionId;await f.broker.supplyAgent(bound,{interventionId:id,values:['SYNTHETIC']});
 const request={sessionId:'s1',runtimeEpoch:'e1',actionId:'a1',credentialRef:id,observationId:'o1',fields:metadata.fields};
 // Changed optional submit is deliberately forbidden.
 await assert.rejects(f.broker.prepareAgent(bound,{request}),{code:'PERMISSION_REQUIRED'});request.submitRef=metadata.submitRef;
 await f.broker.prepareAgent(bound,{request});const p=f.broker.provider(bound),d=await p.getAuthDecision(request);f.revoke();await assert.rejects(p.verifyDecision(d.proof,d.decision),{code:'PERMISSION_REQUIRED'});
 }finally{f.broker.close();}
});
test('agent endpoints require signed host transport and return no input values',async()=>{
 const express=require('express'),request=require('supertest'),{createBrowserInputRouter}=require('../../routes/browserInput');
 const f=fixture();let signed=false;const app=express();app.use('/api/browser/v1',createBrowserInputRouter({enabled:true,broker:f.broker,resolveCaller:async()=>bound,verifyHost:async()=>{if(!signed)c.deny('UNAUTHENTICATED');}}));
 try{f.allow();const id=(await f.broker.request({bound,input:metadata})).interventionId,body={interventionId:id,values:['SYNTHETIC']};
 await request(app).post('/api/browser/v1/input-agent-supply').send(body).expect(401);signed=true;
 const reply=await request(app).post('/api/browser/v1/input-agent-supply').send(body).expect(200);assert.doesNotMatch(reply.text,/SYNTHETIC/);
 await request(app).post('/api/browser/v1/input-agent-supply').set('Origin','https://evil.example.org').send(body).expect(403);
 }finally{f.broker.close();}
});
test('MCP default contracts retain prohibition; opted-in tool accepts existing values without pairing or echo',async()=>{
 const calls=[],client={call:async(name,input)=>{calls.push([name,input]);if(name==='get_browser_capabilities')return {agentInputAvailable:true};if(name==='browser_credentials'){assert.equal(input.values,undefined);return {state:'needs_input',interventionId:'i1',reason:'credentials',expiresAt:Date.now()+60000};}throw Error(name);},protectedCall:async(name,input)=>{calls.push([name,input]);assert.equal(name,'input-agent-supply');return {state:'ready',credentialRef:'i1',expiresAt:Date.now()+60000};}};
 const old=createBrowserMcpAgent({backend:client});assert.equal(old.definitions.find(d=>d.name==='browser_credentials').inputSchema.properties.values,undefined);assert.ok(!old.definitions.find(d=>d.name==='browser_respond'));
 await assert.rejects(old.call({name:'browser_credentials',arguments:{...metadata,values:['SYNTHETIC']}}),{code:'INVALID_INPUT'});
 const agent=createBrowserMcpAgent({backend:createAgentInputHost({client}),agentInput:true});assert.ok(agent.definitions.find(d=>d.name==='browser_respond'));assert.match(agent.instructions,/do not ask to retype existing ones/);
 const result=await agent.call({name:'browser_credentials',arguments:{...metadata,values:['SYNTHETIC']}});assert.equal(result.state,'ready');assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC/);assert.ok(calls.every(([name])=>!name.includes('pair')));
 await assert.rejects(agent.call({name:'browser_credentials',arguments:{...metadata,values:[]}}),{code:'INVALID_INPUT'});
});
test('agent operation decisions require current authorization and exact digest, no automatic approval',async()=>{
 const {createOperationBroker,decisionSchema}=require('../../lib/browser/operationBroker');let allowed=false;
 const broker=createOperationBroker({describeSession:async()=>({ownerId:'owner1',expiresAt:Date.now()+120000}),onPending:async()=>{},verifyDecision:async()=>{throw Error('not human');},agentAuthorized:async()=>allowed});
 const record={sessionId:'s1',operationId:'operation1',operationDigest:'a'.repeat(64),recipients:[metadata.origin],expiresAt:Date.now()+60000,nonce:'n1',reason:'recipient',method:'POST',origin:metadata.origin,type:'fetch',bodyBytes:20};
 try{let resolved=false;const waiting=broker.request(bound,record).then(p=>{resolved=true;return p;});await new Promise(r=>setImmediate(r));assert.equal(resolved,false);
 await assert.rejects(broker.completeAgent(bound,{operationId:'operation1',operationDigest:record.operationDigest}),{code:'PERMISSION_REQUIRED'});allowed=true;
 await assert.rejects(broker.completeAgent(bound,{operationId:'operation1',operationDigest:'b'.repeat(64)}),{code:'PERMISSION_REQUIRED'});
 await broker.completeAgent(bound,{operationId:'operation1',operationDigest:record.operationDigest});const proof=await waiting;assert.match(proof,/^agent:/);
 const decision=Object.fromEntries(Object.keys(decisionSchema.properties).map(k=>[k,record[k]]));allowed=false;await assert.rejects(broker.verified(bound,proof,decision),{code:'PERMISSION_REQUIRED'});allowed=true;await broker.verified(bound,proof,decision);await assert.rejects(broker.verified(bound,proof,decision),{code:'SESSION_LOST'});
 }finally{broker.close();}
});
