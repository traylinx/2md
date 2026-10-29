'use strict';
const {performance}=require('node:perf_hooks');
const {readBrowserPageState}=require('./pageState');

// Passive, site-managed verification only. No clicks, reloads, token inspection,
// provider scripts or solving. Keep the existing action/session deadlines.
async function waitForVerification(frame,deadline,{timeoutMs=8000,pollMs=200}={}){
 const end=performance.now()+Math.min(timeoutMs,Math.max(0,deadline.remaining()-1000));
 let last;
 for(;;){
  try{last=await deadline.run(()=>frame.evaluate(readBrowserPageState));}
  catch(error){
   // A successful check may replace the document. Retry only this transition,
   // and only after pending verification was actually observed.
   if(last?.verification!=='pending'||!/Execution context was destroyed|Cannot find context with specified id/.test(error.message||''))throw error;
  }
  if(last.verification!=='pending'||performance.now()>=end||deadline.remaining()<=1000)return last;
  await deadline.sleep(Math.min(pollMs,Math.max(1,end-performance.now())));
 }
}
function verificationWarnings(state){
 if(state.verification==='pending')return ['VERIFICATION_PENDING'];
 if(state.verification==='failed')return ['VERIFICATION_FAILED'];
 return state.accessGate?[state.accessGate.toUpperCase()+'_REQUIRED']:[];
}
module.exports={waitForVerification,verificationWarnings};
