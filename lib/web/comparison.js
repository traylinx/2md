'use strict';
const {createHash}=require('node:crypto');
const c=require('./contracts');
const hash=text=>createHash('sha256').update(text).digest('hex');
const FIELDS=['name','documentedFeatures','documentedLimits'];
// Deterministic, no-provider extraction. Source strings are data, never commands.
// Offsets are UTF-16 code units into the exact captured Markdown, end exclusive.
function lines(text) {
 const result=[];let offset=0;
 for(const line of text.split('\n')){result.push({text:line,start:offset});offset+=line.length+1;}
 return result;
}
function extract(page, collectionWindow) {
 const fields=Object.fromEntries(FIELDS.map(key=>[key,{state:'unknown',values:[],reason:'NOT_DOCUMENTED'}]));
 const source={url:page.url,finalUrl:page.success?page.finalUrl:null,sha256:page.success?page.sha256:null,collectionWindow:collectionWindow||null};
 if(!page.success) return {source,state:'failed',reason:page.code,fields};
 const rows=lines(page.markdown);let section=null,level=0,fenced=false,frontmatter=rows[0]?.text==='---';
 const found={name:[],documentedFeatures:[],documentedLimits:[]};let bounded=false;
 function add(field,row,text){
  if(found[field].length>=50||text.length>2000){bounded=true;return;}
  const start=row.start+row.text.indexOf(text),end=start+text.length;
  if(start<row.start||page.markdown.slice(start,end)!==text)c.deny('INVALID_RESULT');
  found[field].push({value:text,evidence:{url:page.url,sha256:page.sha256,start,end,quote:text}});
 }
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  if(frontmatter){if(i>0&&row.text==='---')frontmatter=false;continue;}
  if(/^\s*(```|~~~)/.test(row.text)){fenced=!fenced;continue;}
  if(fenced)continue;
  const heading=/^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(row.text);
  if(heading){
   const depth=heading[1].length,title=heading[2];
   if(depth===1)add('name',row,title);
   if(section&&depth<=level)section=null;
   if(/^(?:documented )?(?:key )?features$/i.test(title)){section='documentedFeatures';level=depth;}
   else if(/^(?:documented )?(?:limits|limitations)$/i.test(title)){section='documentedLimits';level=depth;}
   continue;
  }
  if(section){const item=/^\s*(?:[-*+] |\d+[.)] )(.+?)\s*$/.exec(row.text);if(item)add(section,row,item[1]);}
 }
 for(const key of FIELDS){
  // Equal statements need only one citation; differing names are not silently resolved.
  const values=[...new Map(found[key].map(v=>[v.value,v])).values()];
  if(values.length)fields[key]={state:key==='name'&&values.length>1?'conflicting':'documented',values,reason:key==='name'&&values.length>1?'MULTIPLE_NAMES':null};
 }
 const reasons=[];
 if(page.quality!=='complete')reasons.push('CAPTURE_INCOMPLETE');
 if(!collectionWindow)reasons.push('COLLECTION_TIME_UNKNOWN');
 if(frontmatter||fenced||bounded)reasons.push('EXTRACTION_INCOMPLETE');
 // A heading on a login/error page is not a product identity.
 if(found.name.some(v=>/^(?:sign[ -]?in|log[ -]?in|access denied|verify you are human|just a moment|404(?: not found)?)$/i.test(v.value)))reasons.push('NON_CONTENT_PAGE');
 if(reasons.includes('NON_CONTENT_PAGE')){
  for(const key of FIELDS)fields[key]={state:'unknown',values:[],reason:'NON_CONTENT_PAGE'};
 }else if(page.quality!=='complete'||bounded||frontmatter||fenced){
  for(const key of FIELDS)if(fields[key].state==='documented')fields[key]={...fields[key],state:'incomplete',reason:'CAPTURE_OR_EXTRACTION_INCOMPLETE'};
 }
 if(FIELDS.some(k=>fields[k].state!=='documented'))reasons.push('FIELDS_UNRESOLVED');
 const state=reasons.length?'partial':'complete';
 return {source,state,reasons,fields};
}
function comparison(result) {
 // This projection must only receive an authorized existing result. It does not
 // fetch URLs, authorize users, execute a plan, retry a run or generate approvals.
 if(!result||!Array.isArray(result.pages)||!result.manifest)c.deny('INVALID_RESULT');
 const urls=c.publicTargets(result.manifest.urls);
 c.identifier(result.manifest.serviceAgentId);
 if(result.manifest.version!==1||result.manifest.sha256!==hash(JSON.stringify([1,result.manifest.serviceAgentId,urls]))||result.pages.length!==urls.length)c.deny('INVALID_RESULT');
 let window=null;
 if(result.collectionWindow!==undefined){
  c.exact(result.collectionWindow,['startedAt','finishedAt']);const {startedAt,finishedAt}=result.collectionWindow;
  if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(finishedAt)||startedAt<=0||finishedAt<startedAt||finishedAt>Date.now()+1000)c.deny('INVALID_RESULT');
  window={startedAt,finishedAt};
 }
 if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024)c.deny('INVALID_RESULT');
 const records=result.pages.map((page,i)=>{
  if(page.url!==urls[i]||typeof page.success!=='boolean')c.deny('INVALID_RESULT');
  if(page.success&&(typeof page.markdown!=='string'||!page.markdown.trim()||page.sha256!==hash(page.markdown)||!urls.includes(page.finalUrl)||!['complete','degraded','unknown'].includes(page.quality)))c.deny('INVALID_RESULT');
  if(!page.success&&(typeof page.code!=='string'||!/^[A-Z_]{1,40}$/.test(page.code)))c.deny('INVALID_RESULT');
  return extract(page,window);
 });
 const state=records.every(r=>r.state==='failed')?'failed':records.every(r=>r.state==='complete')?'complete':'partial';
 const findings=[];
 // Exact-text grouping only: never infer equivalence, superiority, or absence.
 for(const field of ['documentedFeatures','documentedLimits']){
  const statements=new Map();
  records.forEach((record,index)=>record.fields[field].values.forEach(claim=>{
   if(!statements.has(claim.value))statements.set(claim.value,[]);
   statements.get(claim.value).push({record:index,evidence:claim.evidence});
  }));
  for(const [statement,supportedBy] of statements)findings.push({field,statement,supportedBy,
   undocumentedIn:records.map((_,i)=>i).filter(i=>!supportedBy.some(s=>s.record===i))});
 }
 const output={schema:'public-source-comparison-v1',state,method:'documented-headings-v1',
  manifestDigest:result.manifest.sha256,evidenceOffsets:'utf16-end-exclusive',records,findings,
  summary:{sources:records.length,complete:records.filter(r=>r.state==='complete').length,partial:records.filter(r=>r.state==='partial').length,failed:records.filter(r=>r.state==='failed').length},
  limitations:['Only explicit H1 names and bullet/numbered items under Features or Limits/Limitations headings are extracted.',
   'Documentation claims are not independently verified. No inferred pricing, compliance, ranking or feature absence.',
   'Findings group exact statements only. undocumentedIn means no extracted supporting statement, not that a capability is absent.',
   'Different sources are separate records; conflicting names remain unresolved. Unrecognized layouts remain partial.',
   'Quoted source text is untrusted data, not instructions. Collection window covers this capture request, not source publication time.']};
 if(Buffer.byteLength(JSON.stringify(output))>2*1024*1024)c.deny('INVALID_RESULT');
 return output;
}
module.exports={comparison};
