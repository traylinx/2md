'use strict';
const {createProductionRead}=require('../lib/web/production');
async function main(){
 let service,stopping;
 const stop=()=>{
 if(stopping)return stopping;
 // A stuck backend must not leave a terminating pod alive indefinitely.
 const timer=setTimeout(()=>process.exit(1),15000);timer.unref();
 stopping=(async()=>{try{await service?.stop();}catch{process.exitCode=1;}
 finally{clearTimeout(timer);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}})();return stopping;
 };
 try{
 service=createProductionRead();process.once('SIGTERM',stop);process.once('SIGINT',stop);
 await service.start();process.stdout.write('web-read: started\n');
 }catch{process.stderr.write('web-read: startup unavailable\n');process.exitCode=1;await stop();}
}
if(require.main===module)void main();
module.exports={main};
