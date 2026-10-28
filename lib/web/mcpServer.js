'use strict';
const {Server}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js');
const {createHeadlessAgent}=require('./headlessAgent');const c=require('./contracts');
function createAgentMcpServer({backend,privateReads,browserAgent}){
 const agent=createHeadlessAgent({backend});const server=new Server({name:'traylinx-web-agent',version:'0.2.0'},{capabilities:{tools:{}},instructions:require('./approvalHandoff').instructions+(browserAgent?'\n\n'+browserAgent.instructions:'')});
 const presentBrowserInput=browserAgent?require('../browser/urlElicitation').createUrlElicitation(server):null;
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...agent.listTools(),...(privateReads?.definitions||[]),...(browserAgent?.definitions||[])]}));
 server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
 try{const call={name:request.params.name,arguments:request.params.arguments,signal:extra.signal};
 let result=await (browserAgent?.definitions.some(t=>t.name===call.name)?browserAgent.call(call):privateReads?.definitions.some(t=>t.name===call.name)?privateReads.call(call):agent.callTool(call));
 if(call.name==='get_read_capabilities'&&privateReads)result={...result,authenticatedRead:{configured:true,discoveryTool:'list_login_connections',serverPermissionChecked:false},unsupported:result.unsupported.filter(x=>!['private login','form submission'].includes(x))};
 if(presentBrowserInput&&browserAgent.definitions.some(t=>t.name===call.name))await presentBrowserInput(result,extra.signal);
 return {content:[{type:'text',text:JSON.stringify(result)}],...(browserAgent?.definitions.some(t=>t.name===call.name)?{structuredContent:result}:{}),isError:false};
 }catch(e){if(e instanceof require('../browser/contracts').BrowserError)return {content:[{type:'text',text:JSON.stringify(require('../browser/contracts').publicError(e).body)}],isError:true};const error=e instanceof c.WebBoundaryError||e instanceof require('../capture/errors').CaptureError?e.code:'UNAVAILABLE';return {content:[{type:'text',text:JSON.stringify({error,recovery:require('./hostGuide').recovery(error,request.params.name)})}],isError:true};}
 });return server;
}
module.exports={createAgentMcpServer};
