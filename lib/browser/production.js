'use strict';
const c=require('./contracts');
const {endpoint}=require('../web/dispatch');
const {createRuntimeClients}=require('../web/runtimeClients');
const {createAgentPrincipalResolver}=require('../web/agentPrincipal');
const {createCurrentAgentResolver}=require('./currentAgent');
const {createPostgresGrants}=require('./postgresGrants');
const {createRuntimeAuthority}=require('./authorityAdapter');
const {createBrowserHttpIdentity}=require('./httpIdentity');
const {createNonceStore}=require('./nonceStore');
const {createSessionLeaseClient}=require('./proxyLease');
const {createBrowserRuntime}=require('./runtime');
function configuration(env){
 if(!['0','1',undefined].includes(env.BROWSER_ENABLED)||!['0','1',undefined].includes(env.BROWSER_PRIVATE_ENABLED))c.deny('UNAVAILABLE');
 if(env.BROWSER_ENABLED!=='1'){if(env.BROWSER_PRIVATE_ENABLED==='1')c.deny('UNAVAILABLE');return {enabled:false};}
 if(env.BROWSER_CONTAINMENT!=='isolated-proxy-v1')c.deny('UNAVAILABLE');
 const required=name=>{const value=env[name];if(typeof value!=='string'||!value.trim())c.deny('UNAVAILABLE');return value;};
 const port=Number(env.BROWSER_PORT||8292);if(!Number.isInteger(port)||port<1024||port>65535||[8270,8280,8281,8282,8290,8291].includes(port))c.deny('UNAVAILABLE');
 return {enabled:true,privateEnabled:env.BROWSER_PRIVATE_ENABLED==='1',port,host:env.BROWSER_HOST||'127.0.0.1',
  pairingOrigin:env.BROWSER_PAIRING_ORIGIN,
  projectUrl:env.BROWSER_PRIVATE_ENABLED==='1'?endpoint(required('BROWSER_PROJECT_ACCESS_URL')):null,
  postgresUrl:required('BROWSER_POSTGRES_URL'),redisUrl:required('BROWSER_REDIS_URL'),agentUrl:endpoint(required('BROWSER_AGENT_ACCESS_URL')),currentUrl:endpoint(required('BROWSER_OWNER_ACCESS_URL')),
  apiBaseUrl:endpoint(required('BROWSER_SENTINEL_URL')),clientId:required('BROWSER_SENTINEL_CLIENT_ID'),clientSecret:required('BROWSER_SENTINEL_CLIENT_SECRET'),agentId:required('BROWSER_AGENT_ID'),
  controlUrl:required('BROWSER_PROXY_CONTROL_URL'),proxyToken:required('BROWSER_PROXY_TOKEN'),executablePath:env.PUPPETEER_EXECUTABLE_PATH||'/usr/bin/chromium'};
}
function createProductionBrowser(env=process.env,{clientsFactory=createRuntimeClients,runtimeFactory=createBrowserRuntime,fetchImpl=fetch,loadSdk=()=>require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client')}={}){
 const config=configuration(env);let clients,runtime,server,started=false,closed=false;
 async function stop(){if(closed)return;closed=true;if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}try{await runtime?.stop();}finally{await clients?.close();}}
 return Object.freeze({async start(){
  if(closed||started)c.deny('UNAVAILABLE');started=true;if(!config.enabled)return {enabled:false};
  try{
   const Sdk=loadSdk().TraylinxAuthClient,sdk=new Sdk(config.clientId,config.clientSecret,config.apiBaseUrl,config.agentId,{timeout:3000,maxRetries:0});
   clients=clientsFactory({postgresUrl:config.postgresUrl,redisUrl:config.redisUrl,maxConnections:2});await clients.open();
   // Validate schema presence, never migrate automatically on process boot.
   await clients.pool.query({text:'SELECT grant_id FROM web_browser.grants LIMIT 0',query_timeout:5000});
   const repository=createPostgresGrants({pool:clients.pool}),consumeNonce=createNonceStore({redis:clients.redis});
   const authority=createRuntimeAuthority({repository,resolveCurrentAgent:createCurrentAgentResolver({url:config.currentUrl,sdk,agentId:config.agentId,fetchImpl})});
   const resolveAgent=createAgentPrincipalResolver({url:config.agentUrl,fetchImpl});
   const identity=createBrowserHttpIdentity({repository,consumeNonce,authority:{authorize:(id,b,opts)=>authority.authorizeGrant(id,b,opts)},resolvePrincipal:({credentials,organizationId,projectId,deadline})=>resolveAgent({agentProof:{agentId:credentials['x-agent-user-id'],token:credentials['x-agent-secret-token']},authorization:credentials.authorization,organizationId,projectId,signal:deadline.signal})});
   runtime=runtimeFactory({pairingOrigin:config.pairingOrigin,resolveHuman:config.privateEnabled?require('../web/projectPrincipal').createProjectPrincipalResolver({endpoint:config.projectUrl,fetchImpl}):undefined,authorize:(b,opts)=>authority.authorize(b,opts),resolveCaller:identity.resolveCaller,consumeNonce,privateEnabled:config.privateEnabled,executablePath:config.executablePath,tempRoot:'/tmp',lease:createSessionLeaseClient({controlUrl:config.controlUrl,token:config.proxyToken,fetchImpl})});
   server=runtime.app.listen(config.port,config.host);await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
   server.requestTimeout=40000;server.headersTimeout=5000;return {enabled:true,port:config.port};
  }catch{await stop().catch(()=>{});c.deny('UNAVAILABLE');}
 },stop});
}
module.exports={configuration,createProductionBrowser};
