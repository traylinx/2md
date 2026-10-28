'use strict';
const fs=require('node:fs'),path=require('node:path');
const c=require('./contracts');
const {endpoint}=require('./dispatch');
const fields={clientId:'TRAYLINX_CLIENT_ID',clientSecret:'TRAYLINX_CLIENT_SECRET',agentUserId:'TRAYLINX_AGENT_USER_ID',apiBaseUrl:'TRAYLINX_API_BASE_URL'};
// Host-owned file only. Never accept this path or credentials as model tool input.
// Read through one descriptor: refuse symlinks, non-regular files and broad modes.
function hostEnvironment(env){
 const file=env.TRAYLINX_CREDENTIALS_FILE;
 if(file===undefined)return env; // Existing environment-only integrations unchanged.
 let fd;
 try{
  if(typeof file!=='string'||!path.isAbsolute(file)||typeof process.getuid!=='function'||!fs.constants.O_NOFOLLOW)c.deny('UNAVAILABLE');
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||stat.size>16384)c.deny('UNAVAILABLE');
  const bytes=Buffer.alloc(16385);const count=fs.readSync(fd,bytes,0,bytes.length,0);
  if(count>16384)c.deny('UNAVAILABLE');
  const data=JSON.parse(bytes.subarray(0,count).toString('utf8'));bytes.fill(0);
  c.exact(data,Object.keys(fields));
  for(const key of ['clientId','clientSecret'])if(typeof data[key]!=='string'||!/^[^\s,\x00-\x1f\x7f]{1,16384}$/.test(data[key]))c.deny('UNAVAILABLE');
  c.identifier(data.agentUserId);endpoint(data.apiBaseUrl);
  const result={...env};
  for(const [key,name] of Object.entries(fields)){
   if(env[name]!==undefined&&env[name]!==data[key])c.deny('UNAVAILABLE');
   result[name]=data[key];
  }
  return result;
 }catch{c.deny('UNAVAILABLE');}finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={hostEnvironment};
