'use strict';
// User-operated command, intentionally not registered as an MCP tool.
async function main(){
 const {randomUUID}=require('node:crypto');const readline=require('node:readline/promises');
 const c=require('../lib/web/contracts');const {endpoint,jsonBody}=require('../lib/web/dispatch');const {Deadline}=require('../lib/capture/deadline');
 let terminal;
 try{
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error();
 const planId=c.identifier(process.argv[2]),confirmationId=c.identifier(process.argv[3]||randomUUID());
 const env=process.env;const token=env.TRAYLINX_CONTROL_HUMAN_TOKEN;if(typeof token!=='string'||!/^[^\s,]{1,8192}$/.test(token))throw Error();
 const target=new URL(endpoint(env.TRAYLINX_CONTROL_URL).replace(/\/$/,'')+'/'+planId);
 target.searchParams.set('organizationId',c.identifier(env.TRAYLINX_ORGANIZATION_ID));target.searchParams.set('projectId',c.identifier(env.TRAYLINX_PROJECT_ID));
 async function call(method,body){const deadline=new Deadline(5000);try{
 const response=await deadline.run(()=>fetch(target,{method,redirect:'error',cache:'no-store',signal:deadline.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 if(response.status!==200||response.redirected||response.headers.get('cache-control')!=='no-store'||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error();
 return await jsonBody(response,deadline,16384);
 }finally{deadline.close();}}
 const plan=await call('GET');if(plan.planId!==planId||!/^[a-f0-9]{64}$/.test(plan.planDigest))throw Error();
 // JSON escaping prevents source URLs from injecting terminal control sequences.
 process.stdout.write(JSON.stringify(plan,null,2)+'\nConfirmation ID (reuse on retry): '+confirmationId+'\n');
 terminal=readline.createInterface({input:process.stdin,output:process.stdout});
 const answer=await terminal.question('To approve this exact plan, type its full planDigest: ');
 if(answer!==plan.planDigest){process.stdout.write('Not approved.\n');return;}
 const result=await call('POST',{planDigest:plan.planDigest,confirmationId});
 if(result.confirmationId!==confirmationId||result.planDigest!==plan.planDigest)throw Error();
 process.stdout.write(JSON.stringify(result)+'\nApproved; execution is a separate operation.\n');
 }catch{process.stderr.write('Approval unavailable or outcome unknown; inspect before retrying with the same confirmation ID.\n');process.exitCode=1;}
 finally{terminal?.close();}
}
if(require.main===module)void main();
module.exports={main};
