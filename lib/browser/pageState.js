'use strict';
// Fixed browser-session state reader. Legacy capture heuristics stay unchanged.
// Read rendered text and labels only, never input values/cookies/storage.
function readBrowserPageState(){
 let visited=0,password=false,gate=null,text='',truncated=false,credentialsRejected=false;const loginPrompts=[];
 function visible(el){const s=getComputedStyle(el);return !el.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';}
 function walk(root,depth=0){
  if(depth>128){truncated=true;return;}
  for(const node of root.childNodes||[]){
   if(++visited>50000||text.length>100000){truncated=true;return;}
   if(node.nodeType===Node.TEXT_NODE){text+=' '+node.textContent;continue;}
   if(node.nodeType!==Node.ELEMENT_NODE||!visible(node))continue;
   if(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(node.tagName))continue;
   if(node.matches('[id*="captcha"],[class*="captcha"],iframe[src*="challenge"]'))gate='captcha';
   if(node.getAttribute('role')==='alert'&&/\b(?:invalid credentials|incorrect (?:username or )?password|invalid (?:username or )?password|authentication failed)\b/i.test(node.innerText||''))credentialsRejected=true;
   if(node.tagName==='LABEL'&&loginPrompts.length<32)loginPrompts.push(node.textContent.slice(0,160));
   if(node.tagName==='INPUT'){
    if(node.type==='password')password=true;
    const label=(node.getAttribute('aria-label')||Array.from(node.labels||[]).map(x=>x.textContent).join(' ')).trim();
    if(node.autocomplete==='one-time-code'&&!gate)gate='mfa';
    if(/\b(invitation|invite|beta access) code\b/i.test(label)&&!gate)gate='invitation';
    continue;
   }
   if(node.tagName==='SLOT'){
    const assigned=node.assignedNodes({flatten:true});if(assigned.length){walk({childNodes:assigned},depth+1);continue;}
   }
   walk(node.shadowRoot||node,depth+1);
  }
 }
 walk(document.body||document);
 if(/^(?:just a moment|verify you are human|attention required)/i.test(document.title))gate='captcha';
 if(/^access denied/i.test(document.title)&&!gate)gate='access';
 return {password,challenge:!!gate,accessGate:gate,text:text.slice(0,100001),loginPrompts,truncated,credentialsRejected};
}
module.exports={readBrowserPageState};
