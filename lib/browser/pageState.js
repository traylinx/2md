'use strict';
// Fixed browser-session state reader. Legacy capture heuristics stay unchanged.
// Read rendered text and labels only, never input values/cookies/storage.
function readBrowserPageState(){
 let visited=0,password=false,gate=null,text='',truncated=false,credentialsRejected=false,challengeContext=false,verification='none';const loginPrompts=[];
 function visible(el){const s=getComputedStyle(el);return !el.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';}
 function walk(root,depth=0){
  if(depth>128){truncated=true;return;}
  for(const node of root.childNodes||[]){
   if(++visited>50000||text.length>100000){truncated=true;return;}
   if(node.nodeType===Node.TEXT_NODE){text+=' '+node.textContent;continue;}
   if(node.nodeType!==Node.ELEMENT_NODE||!visible(node))continue;
   if(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(node.tagName))continue;
   // A loaded widget, hidden token or provider badge is not an interactive gate.
   // Use rendered instructions, never provider internals or response-token values.
   if(node.matches('[id*="captcha"],[class*="captcha"],iframe[src*="challenge"]'))challengeContext=true;
   const hint=(node.getAttribute('aria-label')||'')+' '+(node.tagName==='IFRAME'?(node.getAttribute('title')||''):'');
   if(verification!=='interactive'&&/(?:captcha challenge|security challenge|human verification)/i.test(hint))verification='pending';
   if(node.matches('input[type="checkbox"],[role="checkbox"],button,[role="button"]')&&/\b(?:i(?: am|'m) not a robot|verify (?:that )?(?:you are|you're) human)\b/i.test(hint+' '+(node.innerText||'')+' '+Array.from(node.labels||[]).map(x=>x.textContent).join(' ')))verification='interactive';
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
 const challengeTitle=/^(?:just a moment|verify you are human|attention required)/i.test(document.title);
 // A captcha-named CSS class alone must not block a normal form.
 const interactive=/\b(?:please (?:complete|solve) (?:the )?(?:re)?captcha|select all (?:images|squares|tiles)|click (?:the )?checkbox (?:to|below)|i(?: am|'m) not a robot)\b/i.test(text);
 const pending=/\b(?:verifying (?:that )?(?:you are|you're) human|checking your browser|performing (?:a )?security verification|verification (?:is )?in progress)\b/i.test(text);
 if((challengeContext||challengeTitle||pending)&&interactive)verification='interactive';
 else if(verification!=='interactive'&&(challengeTitle||pending))verification='pending';
 if((challengeContext||challengeTitle||verification!=='none')&&/\b(?:verification (?:failed|timed out)|challenge (?:failed|expired))\b/i.test(text))verification='failed';
 if(verification==='pending'&&!pending&&/\bverification (?:successful|succeeded|complete)\b/i.test(text))verification='none';
 if(verification==='interactive')gate='captcha';
 else if(verification==='pending')gate='verification';
 else if(verification==='failed')gate='verification_failed';
 if(/^access denied/i.test(document.title)&&!gate)gate='access';
 return {password,challenge:!!gate,accessGate:gate,verification,text:text.slice(0,100001),loginPrompts,truncated,credentialsRejected};
}
module.exports={readBrowserPageState};
