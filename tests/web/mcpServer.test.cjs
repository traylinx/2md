'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {InMemoryTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/inMemory.js');
const {StdioClientTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');
const {createAgentMcpServer}=require('../../lib/web/mcpServer');const {createHeadlessClient}=require('../../lib/web/headlessClient');
const {alice}=require('./fixtures/principals.json');
test('official MCP client initializes, lists and invokes bounded tool; approval absent',async()=>{
 const backend={plan:async({spec})=>({principalKind:'agent',version:1,planId:'p1',authSubject:alice.authSubject,workspaceUserId:alice.workspaceUserId,organizationId:alice.organizationId,projectId:alice.projectId,operation:'public-read',policyVersion:'v1',outputSchema:'captured-pages-v1',retention:'transient',expiresAt:Date.now()+60000,...spec}),read:async()=>{throw Error('private backend credentials');}};
 const server=createAgentMcpServer({backend});const client=new Client({name:'fixture',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);assert.equal((await client.listTools()).tools.length,4);
 const reply=await client.callTool({name:'propose_read',arguments:{urls:['https://example.com/'],deadlineMs:1000,maxResponseBytes:1024}});assert.equal(JSON.parse(reply.content[0].text).state,'awaiting_confirmation');
 const denied=await client.callTool({name:'approval_sign',arguments:{}});assert.equal(denied.isError,true);
 const error=await client.callTool({name:'read_run_status',arguments:{executionId:'r1'}});assert.equal(error.content[0].text,'{"error":"UNAVAILABLE"}');
 }finally{await client.close();await server.close();}
});
test('HTTP bridge pins project and sends fresh proof only, refuses redirects/no-store violations',async()=>{
 const seen=[];let valid=true;const backend=createHeadlessClient({url:'https://read.example/web/v1',organizationId:'org-a',projectId:'project-a',agentId:'agent-a',sdk:{getAgentRequestHeaders:async()=>({'X-Agent-User-Id':'agent-a','X-Agent-Secret-Token':'synthetic-proof',Authorization:'Bearer must-not-forward'})},fetchImpl:async(url,options)=>{seen.push({url,options});return Response.json({executionId:'r1'},{headers:valid?{'Cache-Control':'no-store'}:{}});}});
 await backend.read({executionId:'r1'});assert.equal(seen[0].options.headers.Authorization,undefined);assert.match(seen[0].url,/organizationId=org-a/);assert.equal(seen[0].options.redirect,'error');valid=false;await assert.rejects(backend.read({executionId:'r1'}),/UNAVAILABLE/);
});
test('actual stdio executable initializes and lists tools with environment-only synthetic credentials',async()=>{
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve(__dirname,'../../scripts/web-agent-mcp.js')],stderr:'pipe',env:{
 TRAYLINX_CLIENT_ID:'synthetic-client',TRAYLINX_CLIENT_SECRET:'synthetic-secret',TRAYLINX_API_BASE_URL:'https://auth.example/api',TRAYLINX_AGENT_USER_ID:'11111111-1111-4111-8111-111111111111',TRAYLINX_WEB_READ_URL:'https://read.example/web/v1',TRAYLINX_ORGANIZATION_ID:'org-a',TRAYLINX_PROJECT_ID:'project-a'}});
 const client=new Client({name:'stdio-fixture',version:'1'});
 try{await client.connect(transport);const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['inspect_read_plan','propose_read','read_run_status','read_run_result']);}finally{await client.close();}
});
