'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHeadlessAgent}=require('../../lib/web/headlessAgent');
const {approvalHandoff,admissionKey}=require('../../lib/web/approvalHandoff');
const {createHeadlessClient}=require('../../lib/web/headlessClient');
const {createPostgresAdmission}=require('../../lib/web/postgresAdmission');
const {alice}=require('./fixtures/principals.json');
const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {InMemoryTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/inMemory.js');
const {createAgentMcpServer}=require('../../lib/web/mcpServer');
const args={planId:'plan-a',confirmationId:'consent-a'};
const tool={name:'run_approved_read',arguments:args};
function agent(admit){return createHeadlessAgent({backend:{plan:async()=>{},read:async()=>{},admit}});}

test('handoff explains exact separate owner action before chat approval, no credentials',()=>{
 const h=approvalHandoff('plan-a',false);
 assert.equal(h.chatApprovalSupported,false);assert.equal(h.approvalStateVerified,false);
 assert.deepEqual(h.ownerCommand.argv,['node','scripts/web-agent-approve.js','plan-a']);
 assert.equal(h.afterApproval.tool,'run_approved_read');
 assert.equal(approvalHandoff('plan-a',true).ownerCommand,null);
 assert.equal(approvalHandoff('plan-a',true).afterApproval,null);
 assert.throws(()=>approvalHandoff('p1;whoami',false),/INVALID_INPUT/);
});
test('admission key is stable across restarts and unambiguous across plan/confirmation pairs',()=>{
 assert.equal(admissionKey(...Object.values(args)),admissionKey(...Object.values(args)));
 assert.notEqual(admissionKey('a-b','c'),admissionKey('a','b-c'));
 assert.notEqual(admissionKey('plan-a','consent-a'),admissionKey('plan-a','consent-b'));
});
test('missing or invented consent cannot pass the existing repository approval check',async()=>{
 let approved=false,admissions=0;
 const repository=createPostgresAdmission({policyVersion:'v1',authorizeConfirmation:async()=>{},pool:{query:async(sql)=>{
  if(sql.startsWith('SELECT c.approved_by'))return {rows:approved?[{approved_by:'human-admin'}]:[]};
  admissions++;return {rows:[{execution_id:'run-a',plan_digest:'a'.repeat(64),state:'admitted',replayed:admissions>1}]};
 }}});
 const a=agent(input=>repository.admit({...input,planDigest:'a'.repeat(64),principal:{...alice,kind:'agent'}}));
 await assert.rejects(a.callTool(tool),/INVALID_CONFIRMATION/);assert.equal(admissions,0);
 approved=true;
 assert.deepEqual(await a.callTool(tool),{executionId:'run-a',state:'admitted',replayed:false});
 assert.equal((await a.callTool(tool)).replayed,true);
});
test('HTTP transport uncertainty preserves the same admission key on explicit retry',async()=>{
 const keys=[];
 const backend=createHeadlessClient({url:'https://read.example/web/v1',organizationId:'org-a',projectId:'project-a',agentId:'agent-a',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent-a','X-Agent-Secret-Token':'synthetic'})},fetchImpl:async(url,options)=>{
  keys.push(options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(options.body),args);assert.equal(options.headers.Authorization,undefined);
  if(keys.length===1)throw Error('response lost after admission');
  return Response.json({executionId:'run-a',state:'admitted',replayed:true},{headers:{'Cache-Control':'no-store'}});
 }});
 const a=createHeadlessAgent({backend});await assert.rejects(a.callTool(tool),/UNAVAILABLE/);
 assert.equal(keys.length,1);assert.equal((await a.callTool(tool)).replayed,true);assert.equal(keys[0],keys[1]);
});
test('no injected identity, credentials, chat boolean or automatic retry',async()=>{
 let calls=0;const a=agent(async()=>{calls++;throw Error('synthetic transport');});
 for(const extra of ['confirmed','authorization','organizationId','projectId','idempotencyKey','clientSecret'])
  await assert.rejects(a.callTool({...tool,arguments:{...args,[extra]:'x'}}),/INVALID_INPUT/);
 await assert.rejects(a.callTool({...tool,arguments:{planId:'plan-a'}}),/INVALID_INPUT/);
 assert.equal(calls,0);
 const controller=new AbortController();controller.abort();await assert.rejects(a.callTool({...tool,signal:controller.signal}),/CANCELLED/);assert.equal(calls,0);
 await assert.rejects(a.callTool(tool),/synthetic transport/);assert.equal(calls,1);
});
test('approved result is whitelisted and malformed results are rejected',async()=>{
 const result={executionId:'run-a',state:'admitted',replayed:false,secret:'never return'};
 assert.equal((await agent(async()=>result).callTool(tool)).secret,undefined);
 for(const bad of [{...result,state:'approved'},{...result,replayed:'yes'},{...result,executionId:'bad/id'}])
  await assert.rejects(agent(async()=>bad).callTool(tool));
});
test('official MCP client receives approval instructions and can resume only recorded consent',async()=>{
 let approved=false;
 const server=createAgentMcpServer({backend:{plan:async()=>{},read:async()=>({state:'completed'}),admit:async()=>{
  if(!approved)require('../../lib/web/contracts').deny('INVALID_CONFIRMATION');
  return {executionId:'run-a',state:'admitted',replayed:false};
 }}});
 const client=new Client({name:'handoff-test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  assert.match(client.getInstructions(),/chat yes\/go alone is not/i);
  assert.equal((await client.listTools()).tools.some(t=>t.name==='run_approved_read'),true);
  const rejected=await client.callTool(tool);assert.equal(rejected.isError,true);assert.match(rejected.content[0].text,/INVALID_CONFIRMATION/);
  approved=true;const ok=await client.callTool(tool);assert.equal(ok.isError,false);assert.equal(JSON.parse(ok.content[0].text).executionId,'run-a');
 }finally{await client.close();await server.close();}
});
