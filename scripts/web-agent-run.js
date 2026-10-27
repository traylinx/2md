'use strict';
// Host-operated submission, not a model approval tool. Requires existing consent.
async function main(env=process.env,args=process.argv.slice(2)){
 try{
 const c=require('../lib/web/contracts');
 if(args.length!==3)c.deny('INVALID_INPUT');
 const [planId,confirmationId,idempotencyKey]=args.map(c.identifier);
 const required=name=>{const v=env[name];if(typeof v!=='string'||!v.trim())c.deny('UNAVAILABLE');return v;};
 const {TraylinxAuthClient}=require('../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client');
 const {createHeadlessClient}=require('../lib/web/headlessClient');
 const agentId=required('TRAYLINX_AGENT_USER_ID');
 const sdk=new TraylinxAuthClient(required('TRAYLINX_CLIENT_ID'),required('TRAYLINX_CLIENT_SECRET'),required('TRAYLINX_API_BASE_URL'),agentId,{timeout:3000,maxRetries:0});
 const backend=createHeadlessClient({url:required('TRAYLINX_WEB_READ_URL'),organizationId:required('TRAYLINX_ORGANIZATION_ID'),projectId:required('TRAYLINX_PROJECT_ID'),agentId,sdk});
 const result=await backend.admit({planId,confirmationId,idempotencyKey});
 c.identifier(result.executionId);
 if(!['admitted','running','completed','failed','needs_reconciliation','expired'].includes(result.state)||typeof result.replayed!=='boolean')c.deny('UNAVAILABLE');
 process.stdout.write(JSON.stringify({executionId:result.executionId,state:result.state,replayed:result.replayed})+'\n');
 }catch{process.stderr.write('traylinx-web-run: submission unavailable; preserve the same plan, confirmation and idempotency key for recovery\n');process.exitCode=1;}
}
if(require.main===module)void main();
module.exports={main};
