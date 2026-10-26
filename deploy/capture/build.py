#!/usr/bin/env python3
"""Build an additive runtime with a source-bound tag; push only with --push."""
import argparse, datetime, hashlib, json, re, subprocess
from pathlib import Path
p = argparse.ArgumentParser(); p.add_argument('--evidence', type=Path, required=True); p.add_argument('--push', action='store_true'); a=p.parse_args()
root=Path(__file__).resolve().parents[2]
files=[root/'deploy/capture/Dockerfile',*sorted((root/'lib/capture').glob('*.js')),root/'routes/capture.js',*sorted((root/'scripts').glob('capture-*'))]
files += [root/'deploy/capture/sentinel-sdk'/name for name in ['package.json', 'package-lock.json', 'traylinx-auth-client-1.1.0-rc.1.tgz']]
hashes={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
source=hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()
tag=f'ghcr.io/makakoo/sentinel-html2md-runtime:capture-{datetime.datetime.now(datetime.timezone.utc):%Y%m%d}-{source[:12]}'
a.evidence.mkdir(parents=True,exist_ok=True)
if (a.evidence/'BUILD.json').exists(): raise SystemExit('Evidence already exists; choose a new output folder')
record={'source_sha256':source,'source_files':hashes,'tag':tag,'registry_pushed':False,'production_promoted':False}
for name,command in [('build',['docker','build','--platform','linux/amd64','-f','deploy/capture/Dockerfile','-t',tag,'.']),*([('push',['docker','push',tag])] if a.push else [])]:
    with (a.evidence/(name+'.log')).open('w') as log:
        result=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT)
    if result.returncode: raise SystemExit(f'{name} failed; inspect retained log')
    print(name+' completed',flush=True)
if a.push:
    log=(a.evidence/'push.log').read_text(); digest=re.findall(r'digest: (sha256:[a-f0-9]{64})',log)
    if len(digest)!=1: raise SystemExit('No unique pushed digest')
    record.update(image='ghcr.io/makakoo/sentinel-html2md-runtime@'+digest[0],registry_pushed=True)
(a.evidence/'BUILD.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['tag','source_sha256','registry_pushed']}))
