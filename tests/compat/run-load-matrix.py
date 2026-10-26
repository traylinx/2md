#!/usr/bin/env python3
"""Owned Docker lab. Never contacts production; all containers have network=none."""
import json
import pathlib
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVIDENCE = ROOT.parent / 'docs/evidence/html2md-implementation-2026-10-22/load'
EVIDENCE.mkdir(parents=True, exist_ok=True)
BASE = 'ghcr.io/traylinx/2md@sha256:acdbc7229c7f427bcb705527ad446cde7365af5e7e4eb459f9ea7d285a78ccba'
CANDIDATE = 'html2md-capture:implementation-20261022'
COMMON = ['--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
          '--memory', '1g', '--pids-limit', '256', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,mode=1777']
FIXTURES = pathlib.Path('/Users/sebastian/MAKAKOO/tmp/html2md-capture-fixtures')

def run(mode, round_number):
    image = BASE if mode == 'baseline' else CANDIDATE
    command = ['docker', 'run', '--rm', *COMMON,
               '-v', f'{ROOT}/tests/compat:/app/tests/compat:ro',
               '-v', f'{ROOT}/tests/fixtures/compat:/app/tests/fixtures/compat:ro',
               image, 'node', '/app/tests/compat/load.cjs']
    result = subprocess.run(command, text=True, capture_output=True, timeout=120)
    (EVIDENCE / f'{round_number}-{mode}.log').write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f'{mode} legacy load failed; inspect retained log')
    data = json.loads(result.stdout.rsplit('LOAD_RESULT=', 1)[1])
    data.update(mode=mode, round=round_number, image=image)
    (EVIDENCE / f'{round_number}-{mode}.json').write_text(json.dumps(data, indent=2) + '\n')
    print(f'round {round_number} {mode}: {sum(c["count"] for c in data["cells"])} requests', flush=True)
    return data

def auxiliary(name, busy=False):
    command = ['docker', 'run', '-d', '--name', name, *COMMON, '--cpus', '1',
               '-v', f'{FIXTURES}:/fixtures:ro']
    if busy:
        command += ['-e', 'CAPTURE_TEST_STRESS=1', '-v', f'{ROOT}/tests/capture/browser.integration.cjs:/app/tests/capture/browser.integration.cjs:ro',
                    CANDIDATE, 'node', '/app/tests/capture/browser.integration.cjs']
    else:
        command += ['-e', 'HTML2MD_ENHANCED_CAPTURE=1', '-e', 'HTML2MD_AUTHENTICATED_CAPTURE=1',
                    '-e', 'CAPTURE_CONTAINMENT=isolated-proxy-v1', '-e', 'CAPTURE_PROXY_CONTROL_URL=http://127.0.0.1:8280',
                    '-e', 'CAPTURE_PROXY_TOKEN=synthetic-lab-only-proxy-key-123456789',
                    '-e', 'CAPTURE_AUTH_URL=https://sentinel.traylinx.com/oauth/token/info', CANDIDATE]
    subprocess.run(command, check=True, capture_output=True)

def stop(name, evidence):
    logs = subprocess.run(['docker', 'logs', name], text=True, capture_output=True)
    evidence.write_text(logs.stdout + logs.stderr)
    subprocess.run(['docker', 'stop', '--time', '2', name], capture_output=True)
    subprocess.run(['docker', 'rm', name], capture_output=True, check=True)

all_runs = []
for number in range(3):
    all_runs.append(run('baseline', number))
    all_runs.append(run('disabled', number))
    name = f'html2md-capture-idle-lab-{number}'
    auxiliary(name)
    try:
        time.sleep(2)
        subprocess.run(['docker', 'exec', name, 'node', '-e',
                        "fetch('http://127.0.0.1:8270/health').then(r=>{if(r.status!==200)process.exit(1)})"], check=True, capture_output=True)
        all_runs.append(run('enabled-idle', number))
    finally:
        stop(name, EVIDENCE / f'{number}-idle.log')
    name = f'html2md-capture-busy-lab-{number}'
    auxiliary(name, True)
    try:
        time.sleep(6)
        all_runs.append(run('enabled-busy', number))
    finally:
        stop(name, EVIDENCE / f'{number}-busy.log')
    events = [json.loads(line) for line in (EVIDENCE / f'{number}-busy.log').read_text().splitlines() if line.startswith('{')]
    completed = [e['stressOperation'] for e in events if 'stressOperation' in e]
    if not completed or not any(e['success'] for e in completed):
        raise RuntimeError('Busy fixture produced no successful completed capture; load is not qualified')

checks = []
for run in all_runs:
    if run['mode'] == 'baseline':
        continue
    baseline = next(r for r in all_runs if r['round'] == run['round'] and r['mode'] == 'baseline')
    for old, new in zip(baseline['cells'], run['cells']):
        threshold = max(old['p95'] * 1.10, old['p95'] + 100)
        checks.append({'round': run['round'], 'mode': run['mode'], 'kind': new['kind'], 'concurrency': new['concurrency'],
                       'baseline_p95': old['p95'], 'candidate_p95': new['p95'], 'limit': threshold,
                       'contract_equal': old['signatures'] == new['signatures'],
                       'passed': new['p95'] <= threshold and old['signatures'] == new['signatures']})
summary = {'scope': 'local Docker lab, not a production SLA; legacy browser/provider effects doubled',
           'requests': sum(c['count'] for r in all_runs for c in r['cells']), 'checks': checks,
           'passed': all(c['passed'] for c in checks)}
(EVIDENCE / 'RESULT.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'passed': summary['passed'], 'requests': summary['requests'], 'checks': len(checks)}))
raise SystemExit(0 if summary['passed'] else 1)
