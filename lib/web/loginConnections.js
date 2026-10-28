'use strict';
const fs=require('node:fs'),path=require('node:path');
const {CaptureError}=require('../capture/errors');
const {parseTarget}=require('../capture/targetPolicy');
const {exactKeys,boundedString}=require('../capture/requestContract');
// Caller-owned, not a server vault. Paths and credentials never enter model tools.
function createLoginConnections(file){
 function load(){
  if(!file)return [];
  let fd,bytes;
  try{
   if(!path.isAbsolute(file)||!fs.constants.O_NOFOLLOW)throw Error();
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   const stat=fs.fstatSync(fd);
   if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||stat.size>65536)throw Error();
   bytes=Buffer.alloc(65537);const count=fs.readSync(fd,bytes,0,bytes.length,0);if(count>65536)throw Error();
   const data=JSON.parse(bytes.subarray(0,count).toString('utf8'));exactKeys(data,['connections']);
   if(!Array.isArray(data.connections)||data.connections.length>16)throw Error();
   const ids=new Set();
   for(const v of data.connections){
    exactKeys(v,['id','label','origins','postUrls','username','password','loginUrl','login'],['id','label','origins','postUrls','username','password']);
    if(typeof v.id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(v.id)||ids.has(v.id))throw Error();ids.add(v.id);
    boundedString(v.label,128);boundedString(v.username,512);boundedString(v.password,4096);
    if(!Array.isArray(v.origins)||!v.origins.length||v.origins.length>16||!v.origins.every(o=>parseTarget(o).origin===o&&o.startsWith('https:')))throw Error();
    if(!Array.isArray(v.postUrls)||v.postUrls.length>3||!v.postUrls.every(u=>{const p=parseTarget(u);return p.href===u&&!p.search&&v.origins.includes(p.origin);}))throw Error();
    if(v.loginUrl&&!v.origins.includes(parseTarget(v.loginUrl).origin))throw Error();
   }
   return data.connections;
  }catch{throw new CaptureError('UNAVAILABLE');}finally{bytes?.fill(0);if(fd!==undefined)fs.closeSync(fd);}
 }
 return Object.freeze({
  list(){return load().map(({id,label,origins,postUrls,loginUrl,login})=>({id,label,origins,postUrls,...(loginUrl?{loginUrl}:{}),...(login?{login}:{} )}));},
  get(id){const all=load(),found=all.find(v=>v.id===id);for(const v of all)if(v!==found){v.username='';v.password='';}if(!found)throw new CaptureError('FORBIDDEN');return found;}
 });
}
module.exports={createLoginConnections};
