// Fixed-target pull release for the private capture image. Never executes Git source.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {request,json,productionRevision,candidate,successfulBuild,sleep} = require('./legacy-controller.cjs');
const PREFIX = 'html2md-capture.traylinx.com/';
const TARGETS = {'html2md-capture-egress':['egress'],'html2md-capture':['capture','tls-frontend']};
const IMAGE = /^ghcr\.io\/traylinx\/2md-capture@sha256:[a-f0-9]{64}$/;
const PREVIOUS = /^ghcr\.io\/(?:traylinx\/(?:2md|2md-capture)|makakoo\/sentinel-html2md-runtime)@sha256:[a-f0-9]{64}$/;
function validate(d) {
 const names=TARGETS[d.metadata?.name];
 if(!names || d.metadata.namespace!=='production' || d.spec.replicas!==1 || d.spec.strategy.type!=='Recreate') throw new Error('unexpected_target');
 const containers=d.spec.template.spec.containers;
 if(containers.length!==names.length || !containers.every((c,i)=>c.name===names[i] && PREVIOUS.test(c.image)) || new Set(containers.map(c=>c.image)).size!==1) throw new Error('unexpected_containers');
 if(!d.spec.template.spec.imagePullSecrets?.some(s=>s.name==='registry-ghcr')) throw new Error('private_pull_secret_not_prepared');
 return d;
}
function patchFor(d,image,values) {
 validate(d);
 if(!PREVIOUS.test(image)) throw new Error('invalid_image');
 const ops=[{op:'test',path:'/metadata/resourceVersion',value:d.metadata.resourceVersion},{op:'test',path:'/spec',value:d.spec}];
 if(!d.metadata.annotations)ops.push({op:'add',path:'/metadata/annotations',value:{}});
 for(const [key,value] of Object.entries(values))ops.push({op:'add',path:'/metadata/annotations/'+(PREFIX+key).replaceAll('/','~1'),value});
 d.spec.template.spec.containers.forEach((_,i)=>ops.push({op:'replace',path:`/spec/template/spec/containers/${i}/image`,value:image}));
 return ops;
}
function normalized(d) {
 const s=structuredClone(d.spec);for(const c of s.template.spec.containers)delete c.image;return JSON.stringify(s);
}
function ready(d,image) {
 return d.status?.observedGeneration>=d.metadata.generation && d.status.updatedReplicas===1 && d.status.availableReplicas===1 && (d.status.unavailableReplicas||0)===0 && d.spec.template.spec.containers.every(c=>c.image===image);
}
function registryAuthorization(file='/registry/.dockerconfigjson') {
 const a=JSON.parse(fs.readFileSync(file,'utf8')).auths;
 const auth=a?.['ghcr.io']?.auth || a?.['https://ghcr.io']?.auth;
 if(typeof auth!=='string' || !/^[A-Za-z0-9+/]+=*$/.test(auth))throw new Error('private_registry_auth_unavailable');
 return 'Basic '+auth;
}
function kubeClient() {
 const root='/var/run/secrets/kubernetes.io/serviceaccount/';
 const ca=fs.readFileSync(root+'ca.crt'),token=fs.readFileSync(root+'token','utf8').trim();
 const url=name=>{if(!TARGETS[name])throw new Error('unknown_target');return 'https://kubernetes.default.svc/apis/apps/v1/namespaces/production/deployments/'+name;};
 return {
  get:async name=>validate(json(await request(url(name),{ca,headers:{Authorization:'Bearer '+token}}))),
  patch:async (name,ops)=>json(await request(url(name),{ca,method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json-patch+json'},body:JSON.stringify(ops)}))
 };
}
async function waitReady(kube,name,image) {
 const end=Date.now()+180000;
 do{const d=await kube.get(name);if(d.spec.template.spec.containers.some(c=>c.image!==image))throw new Error('rollout_drift');if(ready(d,image))return d;await sleep(5000);}while(Date.now()<end);
 throw new Error('rollout_timeout');
}
function writeProof(revision,image,file='/state/capture-verified.json') {
 const temp=file+'.'+crypto.randomBytes(8).toString('hex');
 try{fs.writeFileSync(temp,JSON.stringify({status:'verified',revision,image}),{flag:'wx',mode:0o644});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
async function promote(kube,original,revision,image,run,{wait=waitReady,proof=writeProof}={}) {
 if(!/^[a-f0-9]{40}$/.test(revision)||!IMAGE.test(image))throw new Error('invalid_candidate');
 // Validate both before writing either. Pending annotations preserve rollback on job interruption.
 for(const name of Object.keys(TARGETS))validate(original[name]);
 const touched=[];
 try {
  for(const name of Object.keys(TARGETS)) {
   const before=original[name];let d=await kube.get(name);
   if(d.metadata.uid!==before.metadata.uid || normalized(d)!==normalized(before))throw new Error('runtime_drift');
   const annotations=d.metadata.annotations||{};
   const recovering=annotations[PREFIX+'pending-revision']===revision && d.spec.template.spec.containers[0].image===image;
   const previous=recovering?annotations[PREFIX+'rollback-image']:d.spec.template.spec.containers[0].image;
   if(!PREVIOUS.test(previous))throw new Error('invalid_rollback_image');
   touched.push({name,before,previous});
   if(!recovering)await kube.patch(name,patchFor(d,image,{'pending-revision':revision,'rollback-image':previous,'build-run':String(run)}));
   await wait(kube,name,image);
  }
  for(const name of Object.keys(TARGETS)) {
   const d=await kube.get(name);
   if(!ready(d,image)||normalized(d)!==normalized(original[name]))throw new Error('final_readiness_or_drift');
  }
  // Keep pending rollback information until the durable group proof exists.
  proof(revision,image);
  for(const name of Object.keys(TARGETS)) {
   const d=await kube.get(name);
   await kube.patch(name,patchFor(d,image,{'deployed-revision':revision,'pending-revision':'','failed-revision':''}));
  }
  return {status:'deployed_verified',revision,image,run};
 } catch(error) {
  const restored=[],held=[];
  for(const {name,before,previous} of touched.reverse()) {
   try {
    const d=await kube.get(name);
    if(d.metadata.uid!==before.metadata.uid||normalized(d)!==normalized(before)||!d.spec.template.spec.containers.every(c=>c.image===image)||d.metadata.annotations?.[PREFIX+'pending-revision']!==revision)throw new Error('rollback_drift');
    await kube.patch(name,patchFor(d,previous,{'failed-revision':revision,'pending-revision':''}));await wait(kube,name,previous);restored.push(name);
   }catch{held.push(name);}
  }
  // A published proof must not survive a failed group finalization.
  try{fs.unlinkSync('/state/capture-verified.json');}catch{}
  console.error(JSON.stringify({status:'release_failed',revision,rolled_back:restored,manual_recovery_required:held}));throw error;
 }
}
async function main() {
 const kube=kubeClient(),revision=await productionRevision(),original={};
 for(const name of Object.keys(TARGETS))original[name]=await kube.get(name);
 if(Object.values(original).some(d=>d.metadata.annotations?.[PREFIX+'failed-revision']===revision))return {status:'held_failed_revision',revision};
 if(Object.values(original).every(d=>d.metadata.annotations?.[PREFIX+'deployed-revision']===revision)) {
  const image=original['html2md-capture'].spec.template.spec.containers[0].image;
  if(!IMAGE.test(image)||!Object.values(original).every(d=>ready(d,image)))throw new Error('current_release_not_ready');
  if(process.env.DRY_RUN!=='true')writeProof(revision,image);return {status:'current',revision,image};
 }
 const run=await successfulBuild(revision,'Build private capture candidate');
 if(!run)return {status:'waiting_for_successful_build',revision};
 const image=await candidate(revision,{repository:'traylinx/2md-capture',tagPrefix:'capture-',authorization:registryAuthorization()});
 if(!image)return {status:'waiting_for_image',revision};
 if(await productionRevision()!==revision)return {status:'superseded',revision};
 if(process.env.DRY_RUN==='true')return {status:'dry_run_ready',revision,image,run};
 return promote(kube,original,revision,image,run);
}
module.exports={TARGETS,PREFIX,validate,patchFor,normalized,ready,registryAuthorization,promote};
if(require.main===module)main().then(value=>console.log(JSON.stringify(value))).catch(e=>{console.error(JSON.stringify({status:'error',reason:String(e.message).slice(0,160)}));process.exitCode=1;});
