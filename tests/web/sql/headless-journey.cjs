'use strict';
const assert=require('node:assert/strict');const {Pool}=require('pg');const Redis=require('ioredis');const request=require('supertest');
const {spawn}=require('node:child_process');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {randomBytes,generateKeyPairSync}=require('node:crypto');
const {createWebApplication}=require('../../../lib/web/application');const {createHeadlessApprovalApplication}=require('../../../lib/web/headlessApproval');const c=require('../../../lib/web/contracts');const fixture=require('../fixtures/result.cjs');const {alice}=require('../fixtures/principals.json');
async function main(){
 assert.match(process.env.WEB_TEST_PG_SOCKET||'',/^\/.*web-headless-/);
 const config={host:process.env.WEB_TEST_PG_SOCKET,port:55439,database:'postgres',max:1,connectionTimeoutMillis:2000,statement_timeout:5000};
 const pool=new Pool({...config,options:'-c role=web_read_runtime'}),controlPool=new Pool({...config,options:'-c role=web_read_control'});
 const dir=await fs.mkdtemp(path.join(process.env.WEB_TEST_PG_SOCKET,'redis-'));const socket=path.join(dir,'redis.sock');
 const child=spawn(process.env.REDIS_SERVER||'redis-server',['--port','0','--unixsocket',socket,'--unixsocketperm','700','--save','','--appendonly','no','--maxmemory','32mb','--dir',dir],{stdio:'ignore'});
 let spawnError;child.once('error',e=>{spawnError=e;});const exited=new Promise(resolve=>child.once('exit',resolve));let redis,app;
 try{
 for(let i=0;i<100;i++){if(spawnError)throw spawnError;try{await fs.stat(socket);break;}catch{await new Promise(r=>setTimeout(r,20));}}
 redis=new Redis({path:socket,lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,retryStrategy:()=>null});await redis.connect();
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');const keys={issuer:'control',keyId:'key-1',policyVersion:'v1'};
 const actor={...alice,kind:'agent',authorizationRef:{tokenId:12,clientId:'client-a',generation:'a'.repeat(64),expiresAt:Date.now()+180000}};
 let revoked=false,dispatches=0,ownerChecks=0;
 const authorizeOwner=async plan=>{ownerChecks++;if(revoked)c.deny('FORBIDDEN');assert.deepEqual(plan.authorizationRef,actor.authorizationRef);return actor;};
 const resolvePrincipal=async input=>{if(input.agentProof?.agentId==='agent-a'&&input.agentProof.token==='synthetic-proof')return actor;c.deny('UNAUTHENTICATED');};
 app=createWebApplication({enabled:true,agentExecutionEnabled:true,allowedOrigins:['https://app.example'],dependencies:{pool,redis,resultKey:randomBytes(32),resolvePrincipal,authorizeOwner,
 confirmationAuthority:{publicKey:publicKey.export({type:'spki',format:'pem'}),issuer:keys.issuer,keyId:keys.keyId},verifySearchService:async()=>({id:'agent:search-id',operations:['web:consume-dispatch']}),
 readSdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'read-id','X-Agent-Secret-Token':'synthetic-service'})},readAgentId:'read-id',searchAgentId:'search-id',searchEndpoint:'https://search.example/internal/read',policyVersion:'v1',workerId:'worker-journey',
 fetchImpl:async(_url,options)=>{dispatches++;const ref=JSON.parse(options.body);
 const grant=await app.runtime.grant(new Request('https://read.example/internal/dispatch-grants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ref)}));assert.equal(grant.status,200);const granted=await grant.json();assert.deepEqual(granted.urls,fixture().plan.urls);
 const duplicate=await app.runtime.grant(new Request('https://read.example/internal/dispatch-grants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ref)}));assert.equal(duplicate.status,403);
 const result=fixture().result;return Response.json({executionId:ref.executionId,planDigest:ref.planDigest,state:result.state,result},{headers:{'Cache-Control':'no-store'}});}}});
 const control=createHeadlessApprovalApplication({enabled:true,pool:controlPool,privateKey:privateKey.export({type:'pkcs8',format:'pem'}),...keys,resolveHuman:async()=>({...alice,effectiveRole:'OWNER'}),authorizeOwner});
 const scope='?organizationId=org-a&projectId=project-a';
 const agent=req=>req.set('X-Agent-User-Id','agent-a').set('X-Agent-Secret-Token','synthetic-proof');
 const propose=async()=>{const response=await agent(request(app.app).post('/web/v1/plans'+scope)).send({urls:fixture().plan.urls,deadlineMs:10000,maxResponseBytes:65536}).expect(201);return response.body;};
 const approve=async(plan,id)=>{await request(control.app).post('/approvals/'+plan.planId+scope).set('Authorization','Bearer synthetic-human').send({planDigest:c.digest(plan),confirmationId:id}).expect(200);};
 const admit=(plan,id,key)=>agent(request(app.app).post('/web/v1/runs'+scope)).set('Idempotency-Key',key).send({planId:plan.planId,confirmationId:id});
 const plan=await propose();await admit(plan,'consent-a','key-a').expect(403);await approve(plan,'consent-a');
 const run=(await admit(plan,'consent-a','key-a').expect(202)).body;
 const replay=(await admit(plan,'consent-a','key-a').expect(200)).body;assert.equal(replay.executionId,run.executionId);
 await admit(plan,'consent-a','different-key').expect(409);
 await app.runtime.dispatcher.tick();
 const result=(await agent(request(app.app).get('/web/v1/runs/'+run.executionId+'/result'+scope)).expect(200)).body;
 assert.equal(result.state,'completed');assert.equal(result.result.pages[0].markdown,'private output');assert.equal(dispatches,1);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM web_read.runs')).rows[0].n,1);
 const denied=await propose();await approve(denied,'consent-b');const deniedRun=(await admit(denied,'consent-b','key-b').expect(202)).body;
 revoked=true;await app.runtime.dispatcher.tick();assert.equal(dispatches,1);
 const state=(await agent(request(app.app).get('/web/v1/runs/'+deniedRun.executionId+scope)).expect(200)).body;assert.equal(state.state,'failed');
 assert.ok(ownerChecks>=4);console.log('HEADLESS_ISOLATED_PG_REDIS_APPROVAL_ADMISSION_DISPATCH_RESULT_REVOCATION_PASS');
 console.log('Real SQL scoped roles, Redis encryption and Node routes; AUTH/Workspace identity and SEARCH capture are fixtures. No production qualification.');
 }finally{
 await app?.stop();redis?.disconnect();if(!spawnError){child.kill('SIGTERM');await exited;}
 await Promise.all([pool.end(),controlPool.end()]);await fs.rm(dir,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
