'use strict';
// Serialized fixed worker primitive. Flatten the rendered open-shadow/slot tree,
// never form values. No caller scripts. Separate from legacy capture semantics.
function renderedDocument(){
 let count=0,truncated=false;
 function copy(node,depth){
  if(++count>50000||depth>128){truncated=true;return null;}
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE)return null;
  const style=getComputedStyle(node);
  if(node.hidden||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||['INPUT','TEXTAREA','SCRIPT','NOSCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName))return null;
  if(node.tagName==='SLOT'){
   const fragment=document.createDocumentFragment(),assigned=node.assignedNodes({flatten:true});
   for(const child of assigned.length?assigned:node.childNodes){const out=copy(child,depth+1);if(out)fragment.append(out);}return fragment;
  }
  const out=document.createElement(node.tagName.includes('-')?'div':node.tagName);
  for(const attribute of node.attributes){if(!/^on/i.test(attribute.name)&&!['value','srcdoc'].includes(attribute.name))out.setAttribute(attribute.name,attribute.value);}
  for(const child of (node.shadowRoot||node).childNodes){const result=copy(child,depth+1);if(result)out.append(result);}
  return out;
 }
 const body=copy(document.body,0);if(truncated)return null;
 const html='<html><head><title></title></head>'+ (body?.outerHTML||'<body></body>')+'</html>';
 return html.length>5*1024*1024?null:html;
}
module.exports={renderedDocument};
