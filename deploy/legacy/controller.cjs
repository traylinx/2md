// Fixed-purpose pull deployment controller. No repository code is executed here.
const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');
const REPO = 'traylinx/2md';
const IMAGE = 'ghcr.io/traylinx/2md';
const PREFIX = 'html2md.traylinx.com/';
const DEPLOY = '/apis/apps/v1/namespaces/production/deployments/html2md';
const HEALTH = 'https://api.2md.traylinx.com/api/health';
const shaPattern = /^[a-f0-9]{40}$/;
const imagePattern = /^ghcr\.io\/traylinx\/2md@sha256:[a-f0-9]{64}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function request(url, { method = 'GET', headers = {}, body, ca } = {}) {
  return new Promise((resolve, reject) => {
    const r = https.request(url, { method, headers, ca, timeout: 15000 }, res => {
      const chunks = []; let size = 0;
      res.on('data', data => {
        size += data.length;
        if (size > 2 * 1024 * 1024) return r.destroy(new Error('response_too_large'));
        chunks.push(data);
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    r.on('timeout', () => r.destroy(new Error('request_timeout')));
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
function json(r) {
  if (r.status !== 200) throw new Error(`http_${r.status}`);
  return JSON.parse(r.bytes.toString());
}
function revisionFromRefs(bytes) {
  const matches = [...bytes.toString().matchAll(/([a-f0-9]{40}) refs\/heads\/production(?:\x00|\n)/g)];
  if (matches.length !== 1) throw new Error('ambiguous_production_ref');
  return matches[0][1];
}
async function productionRevision() {
  const r = await request(`https://github.com/${REPO}.git/info/refs?service=git-upload-pack`);
  if (r.status !== 200) throw new Error(`git_refs_http_${r.status}`);
  return revisionFromRefs(r.bytes);
}
function validateDeployment(d) {
  if (d.metadata.name !== 'html2md' || d.metadata.namespace !== 'production') throw new Error('wrong_deployment');
  const spec = d.spec.template.spec;
  if (d.spec.replicas !== 1 || d.spec.strategy.type !== 'Recreate') throw new Error('unexpected_strategy');
  if (spec.containers.length !== 2 || spec.containers[0].name !== 'api' || spec.containers[1].name !== 'worker') throw new Error('unexpected_containers');
  if (spec.containers.some(c => !imagePattern.test(c.image))) throw new Error('unpinned_previous_image');
  if (spec.containers[0].image !== spec.containers[1].image) throw new Error('mixed_previous_images');
  const volume = spec.volumes.find(v => v.name === 'jobs');
  if (volume?.persistentVolumeClaim?.claimName !== 'html2md-jobs') throw new Error('job_storage_not_preserved');
  return d;
}
function annotationKey(key) { return `/metadata/annotations/${(PREFIX + key).replaceAll('~', '~0').replaceAll('/', '~1')}`; }
function patchFor(d, image, annotations) {
  validateDeployment(d);
  if (!imagePattern.test(image)) throw new Error('invalid_candidate_image');
  const ops = [
    { op: 'test', path: '/metadata/resourceVersion', value: d.metadata.resourceVersion },
    { op: 'test', path: '/spec', value: d.spec },
  ];
  if (!d.metadata.annotations) ops.push({ op: 'add', path: '/metadata/annotations', value: {} });
  for (const [key, value] of Object.entries(annotations)) ops.push({ op: 'add', path: annotationKey(key), value });
  for (let i = 0; i < 2; i++) ops.push({ op: 'replace', path: `/spec/template/spec/containers/${i}/image`, value: image });
  return ops;
}
function ready(d, image) {
  return d.status?.observedGeneration >= d.metadata.generation &&
    d.status.updatedReplicas === 1 && d.status.availableReplicas === 1 &&
    (d.status.unavailableReplicas || 0) === 0 &&
    d.spec.template.spec.containers.every(c => c.image === image);
}
function checkedDigest(r, expected) {
  if (r.status !== 200) throw new Error(`registry_http_${r.status}`);
  const actual = 'sha256:' + crypto.createHash('sha256').update(r.bytes).digest('hex');
  if (expected && actual !== expected) throw new Error('registry_digest_mismatch');
  if (r.headers['docker-content-digest'] && r.headers['docker-content-digest'] !== actual) throw new Error('registry_header_mismatch');
  return actual;
}
async function candidate(revision) {
  if (!shaPattern.test(revision)) throw new Error('invalid_revision');
  const token = json(await request('https://ghcr.io/token?scope=repository:traylinx/2md:pull&service=ghcr.io')).token;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' };
  const base = 'https://ghcr.io/v2/traylinx/2md/';
  let r = await request(base + 'manifests/legacy-' + revision, { headers });
  if (r.status === 404) return null;
  const digest = checkedDigest(r);
  let manifest = json(r);
  if (manifest.manifests) {
    const amd = manifest.manifests.filter(m => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
    if (amd.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(amd[0].digest)) throw new Error('invalid_platform_manifest');
    r = await request(base + 'manifests/' + amd[0].digest, { headers });
    checkedDigest(r, amd[0].digest); manifest = json(r);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.config?.digest)) throw new Error('invalid_config_digest');
  // GHCR blob requests can redirect to its HTTPS blob storage. Config is public,
  // but do not forward the registry bearer token to any redirect target.
  r = await request(base + 'blobs/' + manifest.config.digest, { headers });
  if ([302, 307].includes(r.status)) {
    const target = new URL(r.headers.location);
    if (target.protocol !== 'https:' || !['pkg-containers.githubusercontent.com', 'ghcr.io'].includes(target.hostname)) throw new Error('unexpected_blob_redirect');
    r = await request(target);
  }
  checkedDigest(r, manifest.config.digest);
  const config = json(r);
  if (config.config?.Labels?.['org.opencontainers.image.revision'] !== revision || config.config?.Labels?.['org.opencontainers.image.source'] !== 'https://github.com/' + REPO) throw new Error('image_source_mismatch');
  return IMAGE + '@' + digest;
}
async function successfulBuild(revision) {
  const headers = { 'User-Agent': 'html2md-production-controller', Accept: 'application/vnd.github+json' };
  const base = `https://api.github.com/repos/${REPO}/actions`;
  const runs = json(await request(`${base}/workflows/deploy-production.yml/runs?branch=production&head_sha=${revision}&per_page=10`, { headers })).workflow_runs;
  for (const run of runs) {
    if (run.head_sha !== revision || run.head_branch !== 'production' || !['push', 'workflow_dispatch'].includes(run.event) || run.run_attempt !== 1) continue;
    const jobs = json(await request(`${base}/runs/${run.id}/jobs?per_page=100`, { headers })).jobs;
    if (jobs.some(j => j.name === 'Build immutable Kubernetes candidate' && j.status === 'completed' && j.conclusion === 'success')) return run.id;
  }
  return null;
}
function kubeClient() {
  const root = '/var/run/secrets/kubernetes.io/serviceaccount/';
  const token = fs.readFileSync(root + 'token', 'utf8').trim();
  const ca = fs.readFileSync(root + 'ca.crt');
  const base = 'https://kubernetes.default.svc';
  return {
    get: async () => validateDeployment(json(await request(base + DEPLOY, { ca, headers: { Authorization: `Bearer ${token}` } }))),
    patch: async ops => json(await request(base + DEPLOY, { ca, method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(ops) })),
  };
}
async function healthy(revision) {
  try {
    const r = await request(HEALTH + '?release-check=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
    return r.status === 200 && r.headers['x-2md-revision'] === revision && json(r).status === 'ok';
  } catch { return false; }
}
async function waitReady(kube, image, revision, timeout = 180000) {
  const end = Date.now() + timeout;
  do {
    const d = await kube.get();
    if (d.spec.template.spec.containers.some(c => c.image !== image)) throw new Error('deployment_changed_during_rollout');
    if (ready(d, image) && (!revision || await healthy(revision))) return d;
    await sleep(5000);
  } while (Date.now() < end);
  throw new Error('rollout_or_health_timeout');
}
function writeVerified(revision, image) {
  const file = '/state/verified.json';
  const temp = file + '.' + crypto.randomBytes(8).toString('hex');
  try {
    fs.writeFileSync(temp, JSON.stringify({ status: 'verified', revision, image }), { flag: 'wx', mode: 0o644 });
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
async function main() {
  const kube = kubeClient();
  let d = await kube.get();
  const revision = await productionRevision();
  const annotations = d.metadata.annotations || {};
  if (annotations[PREFIX + 'deployed-revision'] === revision) {
    const image = d.spec.template.spec.containers[0].image;
    let proof;
    try { proof = JSON.parse(fs.readFileSync('/state/verified.json', 'utf8')); } catch {}
    if (proof?.status !== 'verified' || proof?.revision !== revision || proof?.image !== image) {
      await waitReady(kube, image, revision);
      if (process.env.DRY_RUN !== 'true') writeVerified(revision, image);
    }
    return console.log(JSON.stringify({ status: 'current', revision }));
  }
  if (annotations[PREFIX + 'failed-revision'] === revision) return console.log(JSON.stringify({ status: 'held_failed_revision', revision }));
  const image = await candidate(revision);
  if (!image) return console.log(JSON.stringify({ status: 'waiting_for_image_or_docs_only', revision }));
  const run = await successfulBuild(revision);
  if (!run) return console.log(JSON.stringify({ status: 'waiting_for_successful_build', revision }));
  if (await productionRevision() !== revision) return console.log(JSON.stringify({ status: 'superseded_before_promotion', revision }));
  const recovering = annotations[PREFIX + 'pending-revision'] === revision && d.spec.template.spec.containers[0].image === image;
  const previous = recovering ? annotations[PREFIX + 'rollback-image'] : d.spec.template.spec.containers[0].image;
  if (!imagePattern.test(previous)) throw new Error('invalid_rollback_image');
  if (process.env.DRY_RUN === 'true') return console.log(JSON.stringify({ status: 'dry_run_ready', revision, image, run }));
  let promoted = recovering;
  try {
    if (!recovering) {
      await kube.patch(patchFor(d, image, { 'pending-revision': revision, 'rollback-image': previous, 'build-run': String(run) }));
      promoted = true;
    }
    d = await waitReady(kube, image, revision);
    await kube.patch(patchFor(d, image, { 'deployed-revision': revision, 'pending-revision': '', 'failed-revision': '' }));
    writeVerified(revision, image);
    console.log(JSON.stringify({ status: 'deployed_verified', revision, image, run }));
  } catch (error) {
    if (promoted) {
      d = await kube.get();
      if (d.spec.template.spec.containers.every(c => c.image === image) && d.metadata.annotations?.[PREFIX + 'pending-revision'] === revision) {
        await kube.patch(patchFor(d, previous, { 'failed-revision': revision, 'pending-revision': '' }));
        await waitReady(kube, previous, null);
        console.log(JSON.stringify({ status: 'rolled_back', revision, image: previous }));
      }
    }
    throw error;
  }
}
module.exports = { revisionFromRefs, validateDeployment, patchFor, ready, checkedDigest, candidate, successfulBuild, main };
if (require.main === module) main().catch(error => {
  // Never serialize kubeconfigs, tokens, API bodies or request options.
  console.error(JSON.stringify({ status: 'error', reason: String(error.message).slice(0,180) }));
  process.exitCode = 1;
});
