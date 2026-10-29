'use strict';
async function main(env=process.env){
 let server,browserHost,protectedHost;
 try{
 env=require('../lib/web/hostCredentials').hostEnvironment(env);
 const c=require('../lib/web/contracts');
 const required=name=>{const v=env[name];if(typeof v!=='string'||!v.trim())c.deny('UNAVAILABLE');return v;};
 const {TraylinxAuthClient}=require('../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client');
 const {createHeadlessClient}=require('../lib/web/headlessClient');const {createAgentMcpServer}=require('../lib/web/mcpServer');
 const {StdioServerTransport}=require('../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
 const agentId=required('TRAYLINX_AGENT_USER_ID');
 const sdk=new TraylinxAuthClient(required('TRAYLINX_CLIENT_ID'),required('TRAYLINX_CLIENT_SECRET'),required('TRAYLINX_API_BASE_URL'),agentId,{timeout:3000,maxRetries:0});
 const backend=createHeadlessClient({url:required('TRAYLINX_WEB_READ_URL'),organizationId:required('TRAYLINX_ORGANIZATION_ID'),projectId:required('TRAYLINX_PROJECT_ID'),agentId,sdk});
 let privateReads;
 if(env.TRAYLINX_LOGIN_CONNECTIONS_FILE||env.TRAYLINX_WEB_CAPTURE_URL){
  const connections=require('../lib/web/loginConnections').createLoginConnections(required('TRAYLINX_LOGIN_CONNECTIONS_FILE'));
  connections.list(); // Fail closed on unsafe host file before exposing tools.
  const capture=require('../lib/web/privateReadClient').createPrivateReadClient({url:required('TRAYLINX_WEB_CAPTURE_URL'),agentId,sdk,backend});
  privateReads=require('../lib/web/privateReadAgent').createPrivateReadAgent({connections,capture});
 }
 let browserAgent;
 const inputMode=env.TRAYLINX_BROWSER_INPUT_MODE||'protected_owner';
 if(!['protected_owner','agent_supplied'].includes(inputMode))c.deny('UNAVAILABLE');
 if(env.TRAYLINX_BROWSER_CONNECTION_FILE){
  const connection=require('../lib/browser/hostConnection').loadHostConnection(env.TRAYLINX_BROWSER_CONNECTION_FILE);
  const browserBackend=require('../lib/browser/httpClient').createBrowserHttpClient({...connection,agentId,sdk});
  if(inputMode==='agent_supplied')protectedHost=require('../lib/browser/agentInputHost').createAgentInputHost({client:browserBackend});
  else if(env.TRAYLINX_BROWSER_OWNER_SETUP_URL)protectedHost=await require('../lib/browser/protectedHost').createProtectedHost({...connection,client:browserBackend,ownerSetupUrl:env.TRAYLINX_BROWSER_OWNER_SETUP_URL});
  const privateAvailable=!!protectedHost;
  protectedHost=await require('../lib/browser/humanHost').createHumanHost({client:protectedHost||browserBackend});
  browserHost=require('../lib/browser/hostLifecycle').createHostLifecycle({backend:protectedHost||browserBackend,privateAvailable});
  browserAgent=require('../lib/browser/mcpAgent').createBrowserMcpAgent({backend:browserHost,agentInput:inputMode==='agent_supplied',human:true});
 }
 server=createAgentMcpServer({backend,privateReads,browserAgent});
 server.onclose=()=>{void (async()=>{await browserHost?.close().catch(()=>{});await protectedHost?.close().catch(()=>{});})();};
 await server.connect(new StdioServerTransport());
 const close=()=>{void server.close().catch(()=>{process.exitCode=1;});};
 process.once('SIGTERM',close);process.once('SIGINT',close);
 }catch{process.stderr.write('traylinx-web-agent: configuration unavailable\n');process.exitCode=1;await server?.close().catch(()=>{});await browserHost?.close().catch(()=>{});await protectedHost?.close().catch(()=>{});}
}
if(require.main===module)void main();
module.exports={main};
