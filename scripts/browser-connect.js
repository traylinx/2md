'use strict';
// Run by the host installer, not inside the MCP model tool surface.
async function main(env=process.env){
 let setup;
 const stop=()=>setup?.close();
 try{
  env=require('../lib/web/hostCredentials').hostEnvironment(env);
  const c=require('../lib/browser/contracts');
  const required=name=>{const value=env[name];if(typeof value!=='string'||!value.trim())c.deny('UNAVAILABLE');return value;};
  const {TraylinxAuthClient}=require('../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client');
  const agentId=required('TRAYLINX_AGENT_USER_ID');
  const sdk=new TraylinxAuthClient(required('TRAYLINX_CLIENT_ID'),required('TRAYLINX_CLIENT_SECRET'),required('TRAYLINX_API_BASE_URL'),agentId,{timeout:3000,maxRetries:0});
  setup=await require('../lib/browser/enrollmentSetup').startEnrollmentSetup({
   url:required('TRAYLINX_BROWSER_ENROLLMENT_URL'),ownerSetupUrl:required('TRAYLINX_BROWSER_OWNER_SETUP_URL'),
   file:required('TRAYLINX_BROWSER_CONNECTION_FILE'),organizationId:required('TRAYLINX_ORGANIZATION_ID'),projectId:required('TRAYLINX_PROJECT_ID'),agentId,sdk,
  });
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  // No pass, private key, callback code or PKCE verifier in console output.
  process.stdout.write(`Connect this agent in Traylinx:\n${setup.url}\nHost fingerprint: ${setup.hostKeyFingerprint}\n`);
  await setup.done;process.stdout.write('Browser connection saved. Restart your MCP client to load it.\n');
 }catch{process.stderr.write('Browser connection not completed. Check host setup configuration or retry owner setup.\n');process.exitCode=1;}
 finally{setup?.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)void main();
module.exports={main};
