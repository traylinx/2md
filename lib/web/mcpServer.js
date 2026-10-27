'use strict';
const {Server}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js');
const {createHeadlessAgent}=require('./headlessAgent');const c=require('./contracts');
function createAgentMcpServer({backend}){
 const agent=createHeadlessAgent({backend});const server=new Server({name:'traylinx-web-agent',version:'0.1.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:agent.listTools()}));
 server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
 try{const result=await agent.callTool({name:request.params.name,arguments:request.params.arguments,signal:extra.signal});
 return {content:[{type:'text',text:JSON.stringify(result)}],isError:false};
 }catch(e){return {content:[{type:'text',text:JSON.stringify({error:e instanceof c.WebBoundaryError?e.code:'UNAVAILABLE'})}],isError:true};}
 });return server;
}
module.exports={createAgentMcpServer};
