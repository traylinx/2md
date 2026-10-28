'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {InMemoryTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/inMemory.js');
const {createAgentMcpServer}=require('../../lib/web/mcpServer');
const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');
const c=require('../../lib/browser/contracts');
const {observation}=require('./support.cjs');
test('official MCP protocol advertises additive browser tools and actionable errors without legacy removal',async()=>{
 const browserAgent=createBrowserMcpAgent({backend:{call:async(_name,input)=>{if(input.sessionId==='good')return observation();c.deny('STALE_REFERENCE');}}});
 const server=createAgentMcpServer({backend:{plan:async()=>{},read:async()=>{}},browserAgent});const client=new Client({name:'neutral-browser-fixture',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);const tools=(await client.listTools()).tools;assert.equal(tools.length,18);assert.ok(tools.some(t=>t.name==='propose_read'));assert.ok(tools.some(t=>t.name==='browser_authenticate'));
 const ok=await client.callTool({name:'browser_observe',arguments:{sessionId:'good'}});assert.equal(ok.structuredContent.observationId,'o1');
 const reply=await client.callTool({name:'browser_observe',arguments:{sessionId:'s1'}});assert.equal(reply.isError,true);assert.equal(JSON.parse(reply.content[0].text).error,'STALE_REFERENCE');assert.match(JSON.parse(reply.content[0].text).recovery,/Observe again/);
 const invalid=await client.callTool({name:'browser_credentials',arguments:{sessionId:'s1',origin:'https://example.org',purpose:'Login',password:'must-not-echo'}});assert.equal(invalid.isError,true);assert.doesNotMatch(JSON.stringify(invalid),/must-not-echo/);
 }finally{await client.close();await server.close();}
});
test('negotiated URL elicitation preserves protected pending state after client acceptance',async()=>{
 const pending={state:'needs_input',interventionId:'input1',reason:'credentials',expiresAt:Date.now()+60000,inputUrl:'http://127.0.0.1:1234/credentials/input1'};let calls=0,offers=0;
 const browserAgent=createBrowserMcpAgent({backend:{call:async name=>{assert.equal(name,'browser_credentials');calls++;return pending;}}});
 const server=createAgentMcpServer({backend:{plan:async()=>{},read:async()=>{}},browserAgent});
 const client=new Client({name:'independent-url-client',version:'1'},{capabilities:{elicitation:{url:{}}}}),[a,b]=InMemoryTransport.createLinkedPair();
 client.setRequestHandler(require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js').ElicitRequestSchema,async request=>{offers++;assert.equal(request.params.mode,'url');assert.equal(request.params.url,pending.inputUrl);return {action:'accept'};});
 try{
  await server.connect(a);await client.connect(b);
  for(let i=0;i<2;i++){const reply=await client.callTool({name:'browser_credentials',arguments:{sessionId:'s1',origin:'https://example.org',purpose:'Read account'}});assert.equal(reply.isError,false);assert.deepEqual(reply.structuredContent,pending);}
  assert.equal(calls,2);assert.equal(offers,1);
 }finally{await client.close();await server.close();}
});
test('legacy MCP discovery and calls stay unchanged with browser off, enabled and busy',async()=>{
 const backend={plan:async()=>{},read:async()=>{}};
 async function connect(browserAgent){
  const server=createAgentMcpServer({backend,browserAgent});
  const client=new Client({name:'unchanged-legacy-client',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);return {client,server};
 }
 const old=await connect();let enabled,release,busy;
 try{
  const legacy=(await old.client.listTools()).tools;
  const baseline=await old.client.callTool({name:'get_read_capabilities',arguments:{}});
  let entered;const started=new Promise(r=>{entered=r;});
  const browserAgent=createBrowserMcpAgent({backend:{call:async()=>{entered();await new Promise(r=>{release=r;});return observation();}}});
  enabled=await connect(browserAgent);
  const all=(await enabled.client.listTools()).tools;
  assert.deepEqual(all.filter(t=>legacy.some(x=>x.name===t.name)),legacy);
  assert.deepEqual(await enabled.client.callTool({name:'get_read_capabilities',arguments:{}}),baseline);
  busy=enabled.client.callTool({name:'browser_observe',arguments:{sessionId:'s1'}});
  await started;let timer;
  try{
   const during=await Promise.race([enabled.client.callTool({name:'get_read_capabilities',arguments:{}}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('legacy MCP blocked by pending browser command')),2000);})]);
   assert.deepEqual(during,baseline);
  }finally{clearTimeout(timer);release();}
  assert.equal((await busy).isError,false);
 }finally{release?.();await busy?.catch(()=>{});await old.client.close();await old.server.close();await enabled?.client.close();await enabled?.server.close();}
});

test('client-neutral instructions forbid inferred account mismatch from unrelated profile',()=>{
 const {instructions}=require('../../lib/browser/mcpAgent');
 assert.match(instructions,/account explicitly expected for this task/);
 assert.match(instructions,/stop before opening private messages/);
 assert.match(instructions,/identity is absent, say it is unverified/);
});
