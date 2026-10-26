#!/usr/bin/env python3
"""Render fixed-target, low-resource pull deployment controller. No credentials."""
import hashlib,json
from pathlib import Path
source=(Path(__file__).parent/'controller.cjs').read_text()
name='html2md-auto-deploy'
config=name+'-'+hashlib.sha256(source.encode()).hexdigest()[:12]
meta=lambda n:{'name':n,'namespace':'production','labels':{'app.kubernetes.io/part-of':'html2md','app.kubernetes.io/component':'release-controller'}}
items=[
 {'apiVersion':'v1','kind':'ServiceAccount','metadata':meta(name),'automountServiceAccountToken':False},
 {'apiVersion':'rbac.authorization.k8s.io/v1','kind':'Role','metadata':meta(name),'rules':[{'apiGroups':['apps'],'resources':['deployments'],'resourceNames':['html2md'],'verbs':['get','patch']}]},
 {'apiVersion':'rbac.authorization.k8s.io/v1','kind':'RoleBinding','metadata':meta(name),'roleRef':{'apiGroup':'rbac.authorization.k8s.io','kind':'Role','name':name},'subjects':[{'kind':'ServiceAccount','name':name,'namespace':'production'}]},
 {'apiVersion':'v1','kind':'ConfigMap','metadata':meta(config),'immutable':True,'data':{'controller.cjs':source}},
 {'apiVersion':'batch/v1','kind':'CronJob','metadata':meta(name),'spec':{'schedule':'*/2 * * * *','concurrencyPolicy':'Forbid','startingDeadlineSeconds':60,'successfulJobsHistoryLimit':1,'failedJobsHistoryLimit':2,'jobTemplate':{'spec':{'backoffLimit':0,'activeDeadlineSeconds':600,'template':{'metadata':{'labels':{'app':'html2md-auto-deploy'}},'spec':{'serviceAccountName':name,'automountServiceAccountToken':True,'restartPolicy':'Never','securityContext':{'runAsNonRoot':True,'runAsUser':1000,'runAsGroup':1000,'seccompProfile':{'type':'RuntimeDefault'}},'containers':[{'name':'controller','image':'ghcr.io/traylinx/2md@sha256:acdbc7229c7f427bcb705527ad446cde7365af5e7e4eb459f9ea7d285a78ccba','command':['node','--max-old-space-size=64','/controller/controller.cjs'],'resources':{'requests':{'cpu':'20m','memory':'64Mi'},'limits':{'cpu':'250m','memory':'128Mi'}},'securityContext':{'readOnlyRootFilesystem':True,'allowPrivilegeEscalation':False,'capabilities':{'drop':['ALL']}},'volumeMounts':[{'name':'controller','mountPath':'/controller','readOnly':True},{'name':'state','mountPath':'/state','subPath':'.deployment'}]}],'volumes':[{'name':'controller','configMap':{'name':config}},{'name':'state','persistentVolumeClaim':{'claimName':'html2md-jobs'}}]}}}}}}
]
print(json.dumps({'apiVersion':'v1','kind':'List','items':items},indent=2))
