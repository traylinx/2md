'use strict';
const fs=require('node:fs');
const c=require('./contracts');
// Verify kernel-visible protection, not an environment flag. Linux changes proc
// sensitive-file ownership to root when a non-root process is non-dumpable.
// Inspect same-UID ancestors too: init/launcher may retain the original env.
function verifyProcessProtection(){
 try{
  if(process.platform!=='linux'||typeof process.getuid!=='function'||process.getuid()===0)c.deny('UNAVAILABLE');
  const uid=process.getuid();let pid=process.pid,seen=new Set();
  while(pid>0){
   if(seen.has(pid)||seen.size>=32)c.deny('UNAVAILABLE');seen.add(pid);
   const status=fs.readFileSync(`/proc/${pid}/status`,'utf8');
   const ids=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m.exec(status);
   if(!ids)c.deny('UNAVAILABLE');
   if(ids.slice(1).some(n=>Number(n)===uid)){
    if(ids.slice(1).some(n=>Number(n)!==uid)||fs.statSync(`/proc/${pid}/environ`).uid!==0)c.deny('UNAVAILABLE');
    if(!/^CapEff:\s+0+$/m.test(status)||!/^CapPrm:\s+0+$/m.test(status))c.deny('UNAVAILABLE');
   }
   const parent=/^PPid:\s+(\d+)/m.exec(status);if(!parent)c.deny('UNAVAILABLE');pid=Number(parent[1]);
  }
  return true;
 }catch{c.deny('UNAVAILABLE');}
}
module.exports={verifyProcessProtection};
