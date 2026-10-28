'use strict';
const {createHash}=require('node:crypto');
// Evidence comes from the same sanitized rendered Markdown, never a second fetch.
function extractionEvidence({source,markdown,warnings=[],state={}}){
  let truncated=false;const notes=new Set(warnings);
  const encoded=Buffer.from(markdown);if(encoded.length>512*1024){markdown=encoded.subarray(0,512*1024).toString('utf8').replace(/\uFFFD$/,'');truncated=true;notes.add('CONTENT_TRUNCATED');}
  const evidence=[];
  for(const paragraph of markdown.split(/\n\s*\n/)){
    if(!paragraph.trim())continue;
    if(evidence.length>=200){truncated=true;notes.add('EVIDENCE_TRUNCATED');break;}
    for(let start=0;start<paragraph.length;start+=8192){
      if(evidence.length>=200){truncated=true;notes.add('EVIDENCE_TRUNCATED');break;}
      const text=paragraph.slice(start,start+8192),id='ev_'+createHash('sha256').update(source.url+'\0'+text).digest('hex').slice(0,24);
      if(!evidence.some(x=>x.id===id))evidence.push({id,text});
    }

  }
  let quality='usable';
  if(state.challenge||state.password){quality='blocked';notes.add(state.challenge?'ACCESS_CHALLENGE':'LOGIN_REQUIRED');}
  else if(!markdown.trim()){quality='blocked';notes.add('EMPTY_CONTENT');}
  else if(truncated||notes.size){quality='degraded';}
  return {source,markdown,evidence,quality,warnings:[...notes].slice(0,64),truncated};
}
module.exports={extractionEvidence};
