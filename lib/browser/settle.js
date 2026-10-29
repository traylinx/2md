'use strict';
// Network idle is a settling hint, not proof of action completion or login.
// Background requests must not consume the entire action budget. A held access
// decision remains pending, however: never detach it by returning a success.
async function settlePage(page,deadline,{pending=()=>false,warnings=new Set(),timeoutMs=1500}={}){
 for(;;){
  deadline.remaining();
  try{await deadline.run(()=>page.waitForNetworkIdle({idleTime:500,timeout:timeoutMs}));return;}
  catch(error){
   deadline.remaining(); // cancellation/action expiry is never downgraded
   if(error?.name!=='TimeoutError')throw error;
   if(pending()){
    while(pending())await deadline.sleep(50);
    continue;
   }
   warnings.add('NETWORK_NOT_IDLE');return;
  }
 }
}
module.exports={settlePage};
