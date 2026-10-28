'use strict';
// Fixed worker function. Only an already observed, revalidated semantic region
// handle may reach it; no caller selector/script. Never reads input values.
function renderedRegion(root){
 if(!root.matches('main,article,table,section[aria-label],[role="region"]'))return null;
 const nodes=[root,...root.querySelectorAll('*')];if(nodes.length>50000)return {html:null,text:''};
 const clone=root.cloneNode(true),copies=[clone,...clone.querySelectorAll('*')];
 for(let i=nodes.length-1;i>=0;i--){const el=nodes[i],copy=copies[i],style=getComputedStyle(el);
  if(['INPUT','TEXTAREA','SELECT','SCRIPT','NOSCRIPT','STYLE','IFRAME','OBJECT'].includes(el.tagName)||el.hidden||style.display==='none'||style.visibility==='hidden'||style.opacity==='0')copy.remove();
 }
 const html=clone.outerHTML,text=(clone.textContent||'').slice(0,5*1024*1024+1);
 return {html:html.length>5*1024*1024?null:'<html><body>'+html+'</body></html>',text};
}
module.exports={renderedRegion};
