#!/usr/bin/env python3
"""Native, isolated k3s qualification. No modification of production workloads."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
parser.add_argument('--namespace', required=True)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = args.evidence.resolve()
EVIDENCE.mkdir(parents=True, exist_ok=True)
BASE = 'ghcr.io/traylinx/2md@sha256:acdbc7229c7f427bcb705527ad446cde7365af5e7e4eb459f9ea7d285a78ccba'
if not args.namespace.startswith('html2md-qualification-') or not args.image.startswith('ghcr.io/traylinx/2md@sha256:'):
    raise SystemExit('Only a scoped qualification namespace and immutable image are accepted')

def kubectl(command, data=None, timeout=240, check=True):
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', 'traylinx-k3s-01',
                             'kubectl ' + ' '.join(shlex.quote(s) for s in command)],
                            input=data, text=True, capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError(result.stderr[-1500:])
    return result

def apply(document):
    kubectl(['apply', '-f', '-'], json.dumps(document))

ns = args.namespace
if kubectl(['get', 'namespace', ns], check=False).returncode == 0:
    raise SystemExit('Qualification namespace already exists; preserve evidence and choose a fresh name')
apply({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': ns,
       'labels': {'purpose': 'html2md-qualification'}}})
apply({'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy',
       'metadata': {'name': 'deny-all-network', 'namespace': ns},
       'spec': {'podSelector': {}, 'policyTypes': ['Ingress', 'Egress'], 'ingress': [], 'egress': []}})

data = {}
mounts = []
sources = [ROOT/'tests/compat/load.cjs', *sorted((ROOT/'tests/compat/support').glob('*.cjs')),
           *sorted((ROOT/'tests/fixtures/compat').glob('*')),
           ROOT/'tests/capture/browser.integration.cjs']
for i, source in enumerate(sources):
    if not source.is_file():
        continue
    key = f'f{i}'
    data[key] = source.read_text()
    mounts.append({'name': 'fixtures', 'mountPath': '/app/' + str(source.relative_to(ROOT)), 'subPath': key, 'readOnly': True})
for name in ('key.pem', 'cert.pem'):
    data[name] = (Path('/Users/sebastian/MAKAKOO/tmp/html2md-capture-fixtures')/name).read_text()
    mounts.append({'name': 'fixtures', 'mountPath': '/fixtures/' + name, 'subPath': name, 'readOnly': True})
apply({'apiVersion': 'v1', 'kind': 'ConfigMap', 'metadata': {'name': 'owned-fixtures', 'namespace': ns}, 'data': data})

def pod(name, mode, image):
    busy = mode == 'enabled-busy'
    idle = mode == 'enabled-idle'
    isolated_capture = busy or idle
    script = 'scripts/capture-server.js' if idle else '/app/tests/capture/browser.integration.cjs' if busy else '/app/tests/compat/load.cjs'
    env = [{'name': 'CAPTURE_TEST_STRESS', 'value': '1'}] if busy else []
    if idle:
        env = [{'name': k, 'value': v} for k, v in {
            'HTML2MD_ENHANCED_CAPTURE': '1', 'HTML2MD_AUTHENTICATED_CAPTURE': '1',
            'CAPTURE_CONTAINMENT': 'isolated-proxy-v1', 'CAPTURE_PROXY_CONTROL_URL': 'http://127.0.0.1:8280',
            'CAPTURE_PROXY_TOKEN': 'synthetic-lab-only-proxy-key-123456789',
            'CAPTURE_AUTH_URL': 'https://sentinel.traylinx.com/oauth/token/info',
            'CAPTURE_TLS_TERMINATED_LOOPBACK': '1'}.items()]
    doc = {'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'name': name, 'namespace': ns,
            'labels': {'purpose': 'html2md-qualification', 'mode': mode}},
            'spec': {'restartPolicy': 'Never', 'activeDeadlineSeconds': 180, 'automountServiceAccountToken': False,
                     'nodeSelector': {'kubernetes.io/hostname': 'traylinx-k3s-02' if isolated_capture else 'traylinx-k3s-01'},
                     'securityContext': {'runAsUser': 1000, 'runAsGroup': 1000, 'fsGroup': 1000, 'runAsNonRoot': True,
                                         'seccompProfile': {'type': 'RuntimeDefault'}},
                     'containers': [{'name': 'lab', 'image': image, 'imagePullPolicy': 'IfNotPresent',
                       'workingDir': '/app', 'command': ['dumb-init', '--', 'node', '--max-old-space-size=512', script],
                       'env': env, 'securityContext': {'readOnlyRootFilesystem': True, 'allowPrivilegeEscalation': False,
                                                      'capabilities': {'drop': ['ALL']}},
                       'resources': {'requests': {'cpu': '100m', 'memory': '256Mi'}, 'limits': {'cpu': '1', 'memory': '1Gi'}},
                       'volumeMounts': [*mounts, {'name': 'scratch', 'mountPath': '/tmp'}]}],
                     'volumes': [{'name': 'fixtures', 'configMap': {'name': 'owned-fixtures'}},
                                 {'name': 'scratch', 'emptyDir': {'medium': 'Memory', 'sizeLimit': '128Mi'}}]}}

    if idle:
        doc['spec']['containers'].append({
            'name': 'tls-frontend', 'image': image,
            'command': ['dumb-init', '--', 'node', 'scripts/capture-frontend.js'],
            'env': [{'name': 'CAPTURE_TLS_CERT_FILE', 'value': '/fixtures/cert.pem'},
                    {'name': 'CAPTURE_TLS_KEY_FILE', 'value': '/fixtures/key.pem'}],
            'securityContext': {'runAsUser': 1001, 'readOnlyRootFilesystem': True,
                                'allowPrivilegeEscalation': False, 'capabilities': {'drop': ['ALL']}},
            'resources': {'requests': {'cpu': '20m', 'memory': '32Mi'}, 'limits': {'cpu': '100m', 'memory': '128Mi'}},
            'volumeMounts': [m for m in mounts if m['mountPath'].startswith('/fixtures/')],
        })
    return doc

def wait(name, completion=False):
    end = time.time() + 180
    while time.time() < end:
        doc = json.loads(kubectl(['-n', ns, 'get', 'pod', name, '-o', 'json']).stdout)
        phase = doc['status']['phase']
        if phase == 'Failed':
            log = kubectl(['-n', ns, 'logs', name, '-c', 'lab'], check=False).stdout
            (EVIDENCE/f'{name}.log').write_text(log)
            raise RuntimeError(f'Failed pod {name}; see retained log')
        if phase == ('Succeeded' if completion else 'Running'):
            return doc
        time.sleep(2)
    raise RuntimeError(f'Timeout waiting for {name}; inspect namespace {ns}')

def run(mode, number):
    name = f'legacy-{number}-{mode}'
    apply(pod(name, 'legacy', BASE if mode == 'baseline' else args.image))
    doc = wait(name, True)
    text = kubectl(['-n', ns, 'logs', name, '-c', 'lab']).stdout
    (EVIDENCE/f'{number}-{mode}.log').write_text(text)
    result = json.loads(text.rsplit('LOAD_RESULT=', 1)[1])
    result.update(mode=mode, round=number, pod_uid=doc['metadata']['uid'], node=doc['spec']['nodeName'])
    (EVIDENCE/f'{number}-{mode}.json').write_text(json.dumps(result, indent=2)+'\n')
    print(f'round {number} {mode}: {sum(c["count"] for c in result["cells"])} requests', flush=True)
    return result

def remove_capture(name):
    logs = kubectl(['-n', ns, 'logs', name, '-c', 'lab'], check=False).stdout
    (EVIDENCE/f'{name}.log').write_text(logs)
    kubectl(['-n', ns, 'delete', 'pod', name, '--wait=true', '--timeout=90s'])
    return logs

runs = []
for number in range(3):
    runs.append(run('baseline', number))
    runs.append(run('disabled', number))
    name = f'capture-idle-{number}'
    apply(pod(name, 'enabled-idle', args.image)); wait(name)
    try:
        kubectl(['-n', ns, 'exec', name, '-c', 'lab', '--', 'node', '-e',
                 "require('https').get({hostname:'127.0.0.1',port:8270,path:'/health',ca:require('fs').readFileSync('/fixtures/cert.pem'),servername:'capture.example.com'},r=>{if(r.statusCode!==200)process.exit(1)}).on('error',()=>process.exit(1))"])
        runs.append(run('enabled-idle', number))
    finally:
        remove_capture(name)
    name = f'capture-busy-{number}'
    apply(pod(name, 'enabled-busy', args.image)); wait(name)
    try:
        time.sleep(6)
        runs.append(run('enabled-busy', number))
        logs = kubectl(['-n', ns, 'logs', name, '-c', 'lab']).stdout
        events = [json.loads(line) for line in logs.splitlines() if line.startswith('{')]
        if not any(e.get('stressOperation', {}).get('success') for e in events):
            raise RuntimeError('No successful capture during native busy qualification')
    finally:
        remove_capture(name)

checks = []
for candidate in runs:
    if candidate['mode'] == 'baseline':
        continue
    baseline = next(r for r in runs if r['round'] == candidate['round'] and r['mode'] == 'baseline')
    for old, new in zip(baseline['cells'], candidate['cells']):
        limit = max(old['p95']*1.10, old['p95']+100)
        checks.append({'round': candidate['round'], 'mode': candidate['mode'], 'kind': new['kind'], 'concurrency': new['concurrency'],
                       'old_p95': old['p95'], 'new_p95': new['p95'], 'limit': limit,
                       'contract_equal': old['signatures'] == new['signatures'],
                       'passed': new['p95'] <= limit and old['signatures'] == new['signatures']})
result = {'scope': 'isolated native k3s lab; API node 01, capture node 02; no production traffic',
          'namespace': ns, 'passed': all(c['passed'] for c in checks), 'checks': checks,
          'requests': sum(c['count'] for r in runs for c in r['cells'])}
(EVIDENCE/'RESULT.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({'passed': result['passed'], 'requests': result['requests'], 'checks': len(checks)}))
print(f'Qualification namespace retained for audit: {ns}; no production deployment changed.')
raise SystemExit(0 if result['passed'] else 1)
