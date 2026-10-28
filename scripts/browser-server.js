'use strict';
const {createProductionBrowser}=require('../lib/browser/production');
async function main(){
 let service,stopping;
 const stop=()=>{if(stopping)return stopping;const timer=setTimeout(()=>process.exit(1),10000);timer.unref();stopping=Promise.resolve(service?.stop()).finally(()=>clearTimeout(timer));return stopping;};
 try{service=createProductionBrowser();process.once('SIGTERM',stop);process.once('SIGINT',stop);const result=await service.start();process.stdout.write(result.enabled?'browser: started\n':'browser: disabled\n');}
 catch{process.stderr.write('browser: startup unavailable\n');process.exitCode=1;await stop().catch(()=>{});}
}
if(require.main===module)void main();
module.exports={main};
