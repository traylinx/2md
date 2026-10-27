'use strict';
async function main(env=process.env){
 let server;
 try{
 const c=require('../lib/web/contracts');
 const required=name=>{const v=env[name];if(typeof v!=='string'||!v.trim())c.deny('UNAVAILABLE');return v;};
 const {TraylinxAuthClient}=require('../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client');
 const {createHeadlessClient}=require('../lib/web/headlessClient');const {createAgentMcpServer}=require('../lib/web/mcpServer');
 const {StdioServerTransport}=require('../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
 const agentId=required('TRAYLINX_AGENT_USER_ID');
 const sdk=new TraylinxAuthClient(required('TRAYLINX_CLIENT_ID'),required('TRAYLINX_CLIENT_SECRET'),required('TRAYLINX_API_BASE_URL'),agentId,{timeout:3000,maxRetries:0});
 const backend=createHeadlessClient({url:required('TRAYLINX_WEB_READ_URL'),organizationId:required('TRAYLINX_ORGANIZATION_ID'),projectId:required('TRAYLINX_PROJECT_ID'),agentId,sdk});
 server=createAgentMcpServer({backend});
 await server.connect(new StdioServerTransport());
 const close=()=>{void server.close().catch(()=>{process.exitCode=1;});};
 process.once('SIGTERM',close);process.once('SIGINT',close);
 }catch{process.stderr.write('traylinx-web-agent: configuration unavailable\n');process.exitCode=1;await server?.close().catch(()=>{});}
}
if(require.main===module)void main();
module.exports={main};
