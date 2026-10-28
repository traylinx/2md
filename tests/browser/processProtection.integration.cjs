'use strict';
// Candidate-only Linux probe. Synthetic marker; never prints environment content.
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
assert.equal(require('../../lib/browser/processProtection').verifyProcessProtection(),true);
const probe=spawnSync(process.execPath,['-e',`
const fs=require('node:fs');let pid=process.ppid,checked=0,readable=0;
while(pid>0){
 const status=fs.readFileSync('/proc/'+pid+'/status','utf8');
 if(Number(/^Uid:\\s+(\\d+)/m.exec(status)[1])===process.getuid()){
  checked++;try{fs.readFileSync('/proc/'+pid+'/environ');readable++;}catch(e){if(!['EACCES','EPERM'].includes(e.code))throw e;}
 }
 pid=Number(/^PPid:\\s+(\\d+)/m.exec(status)[1]);
}
console.log(JSON.stringify({checked,readable,childInheritedMarker:!!process.env.GB01_SYNTHETIC_PARENT_SECRET}));
`],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8'});
assert.equal(probe.status,0,probe.stderr);
const result=JSON.parse(probe.stdout);assert.ok(result.checked>=1);assert.equal(result.readable,0);assert.equal(result.childInheritedMarker,false);
console.log(JSON.stringify({processProtection:'PASS',...result}));
