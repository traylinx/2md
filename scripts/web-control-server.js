'use strict';
const {createProductionControl}=require('../lib/web/controlProduction');
async function main(){
 let service,stopping;
 const stop=()=>{
 if(stopping)return stopping;
 const timer=setTimeout(()=>process.exit(1),15000);timer.unref();
 stopping=(async()=>{try{await service?.stop();}catch{process.exitCode=1;}
 finally{clearTimeout(timer);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}})();return stopping;
 };
 try{service=createProductionControl();process.once('SIGTERM',stop);process.once('SIGINT',stop);await service.start();process.stdout.write('web-control: started\n');}
 catch{process.stderr.write('web-control: startup unavailable\n');process.exitCode=1;await stop();}
}
if(require.main===module)void main();
module.exports={main};
