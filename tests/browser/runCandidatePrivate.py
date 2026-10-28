"""Owned fixture only. Exact local candidate, no network, synthetic TLS/account."""
import pathlib
import subprocess
import tempfile
import sys
import uuid

image = sys.argv[1]
if not image.startswith('sha256:') or len(image) != 71:
    raise SystemExit('An exact local sha256 image ID is required')
fixture = sys.argv[2] if len(sys.argv) > 2 else 'privateWorker.integration.cjs'
if fixture not in {'privateWorker.integration.cjs', 'dynamicJourney.integration.cjs'}:
    raise SystemExit('Unsupported owned fixture')
rpc = len(sys.argv) > 3 and sys.argv[3] == '--rpc'
if rpc and fixture != 'dynamicJourney.integration.cjs':
    raise SystemExit('RPC is public-fixture-only')
tests = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='gb01-private-owned-') as directory:
    root = pathlib.Path(directory)
    root.chmod(0o755)
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                    '-keyout', str(root/'fixture.key'), '-out', str(root/'fixture.crt'),
                    '-days', '1', '-subj', '/CN=example.com'], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    (root/'chromium').write_text('#!/bin/sh\nexec /usr/bin/chromium --ignore-certificate-errors "$@"\n')
    (root/'chromium').chmod(0o755)
    for name in ['fixture.key', 'fixture.crt']:
        (root/name).chmod(0o444)
    name = 'gb01-private-' + uuid.uuid4().hex[:12]
    args = ['docker', 'run', '--rm', '--name', name, '--network', 'none', '--add-host', 'example.com:93.184.216.34',
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
            '--tmpfs', '/tmp:rw,nosuid,size=256m',
            '--mount', f'type=bind,src={tests},dst=/app/tests/browser,readonly',
            '--mount', f'type=bind,src={root},dst=/fixture,readonly',
            '-e', 'FIXTURE_KEY=/fixture/fixture.key', '-e', 'FIXTURE_CERT=/fixture/fixture.crt',
            '-e', 'FIXTURE_CHROMIUM_WRAPPER=/fixture/chromium', image, 'node', '-e',
            'require("./lib/browser/processProtection").verifyProcessProtection(); require("./tests/browser/' + fixture + '")']
    # Fixture itself owns a bounded lifetime and finally closes browser/proxy.
    if rpc:
        args[2:2] = ['-i', '-e', 'FIXTURE_RPC=1']
    try:
        result = subprocess.run(args, timeout=260 if rpc else 100)
    except subprocess.TimeoutExpired:
        subprocess.run(['docker', 'stop', '--time', '2', name], timeout=10, check=False)
        raise SystemExit('Owned fixture exceeded its bounded harness deadline')
    raise SystemExit(result.returncode)
