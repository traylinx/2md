#!/usr/bin/env python3
"""Render narrowly scoped capture pull controller. Existing registry secret is read-only."""
import hashlib,json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
d=json.loads(subprocess.check_output([sys.executable,str(root/'legacy/render-controller.py')]))
old='html2md-auto-deploy';name='html2md-capture-auto-deploy'
sources={'controller.cjs':(root/'capture/release-controller.cjs').read_text(),'legacy-controller.cjs':(root/'legacy/controller.cjs').read_text()}
config=name+'-'+hashlib.sha256(json.dumps(sources,sort_keys=True).encode()).hexdigest()[:12]
for item in d['items']:
 item['metadata']['name']=config if item['kind']=='ConfigMap' else name
 if item['kind']=='Role':item['rules'][0]['resourceNames']=['html2md-capture','html2md-capture-egress']
 if item['kind']=='RoleBinding':item['roleRef']['name']=name;item['subjects'][0]['name']=name
 if item['kind']=='ConfigMap':item['data']=sources
 if item['kind']=='CronJob':
  job=item['spec']['jobTemplate']['spec'];job['activeDeadlineSeconds']=900
  pod=job['template'];pod['metadata']['labels']['app']=name
  s=pod['spec'];s['serviceAccountName']=name;s['volumes'][0]['configMap']['name']=config
  s['volumes'].append({'name':'registry','secret':{'secretName':'registry-ghcr','defaultMode':292,'items':[{'key':'.dockerconfigjson','path':'.dockerconfigjson'}]}})
  s['containers'][0]['volumeMounts'].append({'name':'registry','mountPath':'/registry','readOnly':True})
print(json.dumps(d,indent=2))
