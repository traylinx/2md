#!/usr/bin/env python3
"""Render inert additive candidate resources. Does not allocate, apply or enable."""
import argparse
import json
import re
p=argparse.ArgumentParser()
p.add_argument('--image',required=True)
p.add_argument('--node-name',required=True)
p.add_argument('--namespace',default='production')
a=p.parse_args()
if not re.fullmatch(r'ghcr\.io/[a-z0-9-]+/[a-z0-9_-]+@sha256:[a-f0-9]{64}',a.image):p.error('immutable candidate image required')
for value in [a.namespace,a.node_name]:
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,62}',value):p.error('invalid name')
def obj(kind,name,spec):
    return {'apiVersion':'apps/v1' if kind=='Deployment' else 'networking.k8s.io/v1' if kind=='NetworkPolicy' else 'v1','kind':kind,'metadata':{'name':name,'namespace':a.namespace,'labels':{'app.kubernetes.io/part-of':'traylinx-browser'}},'spec':spec}
items=[]
for role,port,cpu,ram in [('runtime',8292,'1','1Gi'),('egress',8290,'250m','192Mi')]:
    name='traylinx-browser-'+role
    env=[{'name':'BROWSER_ENABLED','value':'0'},{'name':'BROWSER_PRIVATE_ENABLED','value':'0'},{'name':'BROWSER_ENROLLMENT_ENABLED','value':'0'}]
    if role=='egress':env=[{'name':'BROWSER_PROXY_TOKEN','valueFrom':{'secretKeyRef':{'name':'traylinx-browser-proxy','key':'token'}}}]
    container={'name':role,'image':a.image,'imagePullPolicy':'IfNotPresent','command':['dumb-init','--','/app/scripts/capture-entrypoint.sh','node','--max-old-space-size=256' if role=='runtime' else '--max-old-space-size=128','scripts/browser-server.js' if role=='runtime' else 'scripts/browser-egress.js'],'env':env,'securityContext':{'allowPrivilegeEscalation':False,'readOnlyRootFilesystem':True,'capabilities':{'drop':['ALL']}},'resources':{'requests':{'cpu':'100m' if role=='runtime' else '50m','memory':'256Mi' if role=='runtime' else '64Mi'},'limits':{'cpu':cpu,'memory':ram}},'ports':[{'name':'http','containerPort':port}],'volumeMounts':[{'name':'scratch','mountPath':'/tmp'}]}
    if role=='egress':container['readinessProbe']={'httpGet':{'path':'/health','port':port},'periodSeconds':10,'timeoutSeconds':2}
    items.append(obj('Deployment',name,{'replicas':0,'strategy':{'type':'Recreate'},'selector':{'matchLabels':{'app':name}},'template':{'metadata':{'labels':{'app':name}},'spec':{'nodeSelector':{'kubernetes.io/hostname':a.node_name},'automountServiceAccountToken':False,'securityContext':{'runAsNonRoot':True,'runAsUser':1000,'runAsGroup':1000,'seccompProfile':{'type':'RuntimeDefault'}},'terminationGracePeriodSeconds':15,'containers':[container],'volumes':[{'name':'scratch','emptyDir':{'medium':'Memory','sizeLimit':'256Mi' if role=='runtime' else '32Mi'}}]}}}))
    items.append(obj('Service',name,{'selector':{'app':name},'ports':[{'name':'http','port':port,'targetPort':port}]+([{'name':'proxy','port':8291,'targetPort':8291}] if role=='egress' else [])}))
    # Explicit deny until measured placement and endpoint policy are qualified.
    items.append(obj('NetworkPolicy',name,{'podSelector':{'matchLabels':{'app':name}},'policyTypes':['Ingress','Egress'],'ingress':[],'egress':[]}))
print(json.dumps({'apiVersion':'v1','kind':'List','items':items},indent=2))
