'use strict';
const {randomUUID}=require('node:crypto');
const {deny}=require('./contracts');

// Executed only by the trusted worker; no caller script or selectors accepted.
// Deliberately never reads value, selectedOptions, cookies or storage.
function describeElement(el) {
  const style=getComputedStyle(el);
  const visible=el.isConnected&&el.getClientRects().length>0&&style.visibility!=='hidden'&&style.display!=='none'&&style.opacity!=='0'&&!el.closest('[inert]');
  const tag=el.tagName.toLowerCase(),type=tag==='input'?el.type:'';
  const role=el.getAttribute('role')||({a:'link',button:'button',select:'combobox',textarea:'textbox',input:type==='checkbox'?'checkbox':type==='radio'?'radio':['submit','button'].includes(type)?'button':'textbox'}[tag]||'control');
  const root=el.getRootNode();
  const labelled=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>root.getElementById?.(id)?.textContent||'').join(' ');
  const name=(el.getAttribute('aria-label')||labelled||Array.from(el.labels||[]).map(x=>x.textContent).join(' ')||(['input','textarea','select'].includes(tag)?el.getAttribute('placeholder')||'':el.textContent)||'').trim().slice(0,512);
  return {tag,type,role,name,visible,disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',href:tag==='a'?el.href:'',action:el.form?.action||'',method:el.form?.method||'',formAction:el.getAttribute('formaction')||'',formMethod:el.getAttribute('formmethod')||''};
}
function collectElements() {
  const nodes=[];let visited=0,truncated=false;
  function walk(root){for(const el of root.children||[]){if(++visited>10000){truncated=true;return;}if(el.matches('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="tab"]')){if(nodes.length<400)nodes.push(el);else truncated=true;}if(el.shadowRoot)walk(el.shadowRoot);walk(el);}}
  walk(document);return {nodes,truncated};
}
function stale(){deny('STALE_REFERENCE');}
class Observations {
  constructor(page,pageId){this.page=page;this.pageId=pageId;this.refs=new Map();this.observationId=null;}
  async clear(){const old=this.refs;this.refs=new Map();this.observationId=null;await Promise.all([...old.values()].flatMap(x=>[x.handle.dispose(),x.form.dispose()]).map(p=>p.catch(()=>{})));}
  async observe(target=this.page){
    await this.clear();this.page=target;const observationId=randomUUID();const controls=[],links=[];let truncated=false;
    const collected=await this.page.evaluateHandle(collectElements);const array=await collected.getProperty('nodes');
    try{
      const flag=await collected.getProperty('truncated');try{truncated=await flag.jsonValue();}finally{await flag.dispose();}
      const properties=await array.getProperties();
      for(const handle of properties.values()){
        if(!handle.asElement()){await handle.dispose();continue;}
        const meta=await handle.evaluate(describeElement);
        if(!meta.visible||meta.disabled){await handle.dispose();continue;}
        const target=meta.role==='link'?links:controls;
        if(target.length>=200){truncated=true;await handle.dispose();continue;}
        const ref=randomUUID(),form=await handle.evaluateHandle(el=>el.form);
        this.refs.set(ref,{handle,form,meta});
        if(meta.role==='link')target.push({ref,name:meta.name,...(/^https:\/\//.test(meta.href)?{url:meta.href}:{})});
        else controls.push({ref,role:meta.role,name:meta.name,...(meta.type?{inputType:meta.type}:{})});
      }
      this.observationId=observationId;
      return {observationId,controls,links,truncated};
    }catch(error){await this.clear();throw error;}finally{await array.dispose();await collected.dispose();}
  }
  async resolve(observationId,ref){
    if(observationId!==this.observationId)stale();const record=this.refs.get(ref);if(!record)stale();
    try{
      const current=await record.handle.evaluate(describeElement);
      if(JSON.stringify(current)!==JSON.stringify(record.meta)||!await record.handle.evaluate((el,form)=>el.form===form,record.form))stale();
    }catch{stale();}
    return record.handle;
  }
}
module.exports={Observations,describeElement,collectElements};
