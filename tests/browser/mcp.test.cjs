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
