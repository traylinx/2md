#!/usr/bin/env python3
"""Render inert additive candidate resources. Does not allocate, apply or enable."""
import argparse
import ipaddress
import json
import re
p=argparse.ArgumentParser()
p.add_argument('--image',required=True)
p.add_argument('--node-name',required=True)
p.add_argument('--namespace',default='production')
p.add_argument('--runtime-bindings',action='store_true')
p.add_argument('--database-ip')
p.add_argument('--gateway-cluster-ip')
a=p.parse_args()
if a.runtime_bindings:
    try:
        db=ipaddress.ip_address(a.database_ip)
        gateway=ipaddress.ip_address(a.gateway_cluster_ip)
        if db.version!=4 or db not in ipaddress.ip_network('100.64.0.0/10'):raise ValueError()
        network=ipaddress.ip_network('10.43.0.0/16')
        if gateway not in network or gateway in (network.network_address,network.broadcast_address):raise ValueError()
    except (ValueError,TypeError):p.error('verified database Tailscale IPv4 and gateway ClusterIP required')
elif a.database_ip or a.gateway_cluster_ip:p.error('endpoint bindings require --runtime-bindings')
if not re.fullmatch(r'ghcr\.io/[a-z0-9-]+/[a-z0-9_-]+@sha256:[a-f0-9]{64}',a.image):p.error('immutable candidate image required')
for value in [a.namespace,a.node_name]:
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,62}',value):p.error('invalid name')
def obj(kind,name,spec):
    return {'apiVersion':'apps/v1' if kind=='Deployment' else 'networking.k8s.io/v1' if kind=='NetworkPolicy' else 'v1','kind':kind,'metadata':{'name':name,'namespace':a.namespace,'labels':{'app.kubernetes.io/part-of':'traylinx-browser'}},'spec':spec}
items=[]
for role,port,cpu,ram in [('runtime',8292,'1','1Gi'),('egress',8290,'250m','192Mi')]:
    name='traylinx-browser-'+role
    env=[{'name':'BROWSER_ENABLED','value':'0'},{'name':'BROWSER_PRIVATE_ENABLED','value':'0'},{'name':'BROWSER_ENROLLMENT_ENABLED','value':'0'}]
    if role=='runtime':env += [{'name':'BROWSER_HOST','value':'0.0.0.0'},{'name':'BROWSER_PORT','value':str(port)},{'name':'NODE_ENV','value':'production'}]
    if role=='egress':env=[{'name':'BROWSER_PROXY_TOKEN','valueFrom':{'secretKeyRef':{'name':'traylinx-browser-proxy','key':'token'}}}]
    container={'name':role,'image':a.image,'imagePullPolicy':'IfNotPresent','command':['dumb-init','--','/app/scripts/capture-entrypoint.sh','node','--max-old-space-size=256' if role=='runtime' else '--max-old-space-size=128','scripts/browser-server.js' if role=='runtime' else 'scripts/browser-egress.js'],'env':env,'securityContext':{'allowPrivilegeEscalation':False,'readOnlyRootFilesystem':True,'capabilities':{'drop':['ALL']}},'resources':{'requests':{'cpu':'100m' if role=='runtime' else '50m','memory':'256Mi' if role=='runtime' else '64Mi'},'limits':{'cpu':cpu,'memory':ram}},'ports':[{'name':'http','containerPort':port}],'volumeMounts':[{'name':'scratch','mountPath':'/tmp'}]}
    container['readinessProbe']={'httpGet':{'path':'/health','port':port},'periodSeconds':5,'timeoutSeconds':2,'failureThreshold':2}
    container['startupProbe']={'httpGet':{'path':'/health','port':port},'periodSeconds':2,'timeoutSeconds':2,'failureThreshold':30}
    items.append(obj('Deployment',name,{'replicas':0,'strategy':{'type':'Recreate'},'selector':{'matchLabels':{'app':name}},'template':{'metadata':{'labels':{'app':name}},'spec':{'nodeSelector':{'kubernetes.io/hostname':a.node_name},'automountServiceAccountToken':False,'enableServiceLinks':False,'securityContext':{'runAsNonRoot':True,'runAsUser':1000,'runAsGroup':1000,'seccompProfile':{'type':'RuntimeDefault'}},'terminationGracePeriodSeconds':15,'containers':[container],'volumes':[{'name':'scratch','emptyDir':{'medium':'Memory','sizeLimit':'256Mi' if role=='runtime' else '32Mi'}}]}}}))
    if a.runtime_bindings:
        pod=items[-1]['spec']['template']['spec']
        pod['imagePullSecrets']=[{'name':'registry-ghcr'}]
        if role=='runtime':
            # Values remain in a dedicated pre-provisioned Secret, not envFrom.
            # Feature flags above remain explicitly off even when secrets exist.
            keys=['POSTGRES_URL','ENROLLMENT_POSTGRES_URL','REDIS_URL','AGENT_ACCESS_URL','OWNER_ACCESS_URL','PROJECT_ACCESS_URL','SENTINEL_URL','SENTINEL_CLIENT_ID','SENTINEL_CLIENT_SECRET','AGENT_ID','PAIRING_ORIGIN']
            container['env'] += [{'name':'BROWSER_'+key,'valueFrom':{'secretKeyRef':{'name':'traylinx-browser-runtime','key':'BROWSER_'+key}}} for key in keys]
            container['env'] += [{'name':'BROWSER_PROXY_CONTROL_URL','value':'http://traylinx-browser-egress:8290'}, {'name':'BROWSER_PROXY_TOKEN','valueFrom':{'secretKeyRef':{'name':'traylinx-browser-proxy','key':'token'}}}]
            pod['hostAliases']=[{'ip':str(db),'hostnames':['traylinx-db']},{'ip':str(gateway),'hostnames':['api.makakoo.com']}]
            pod['volumes'].append({'name':'postgres-tls','configMap':{'name':'traylinx-web-postgres-ca','defaultMode':292,'items':[{'key':'server.pem','path':'server.pem'}]}})
            container['volumeMounts'].append({'name':'postgres-tls','mountPath':'/postgres-tls','readOnly':True})
    items.append(obj('Service',name,{'selector':{'app':name},'ports':[{'name':'http','port':port,'targetPort':port}]+([{'name':'proxy','port':8291,'targetPort':8291}] if role=='egress' else [])}))
    # Explicit deny until measured placement and endpoint policy are qualified.
    items.append(obj('NetworkPolicy',name,{'podSelector':{'matchLabels':{'app':name}},'policyTypes':['Ingress','Egress'],'ingress':[],'egress':[]}))
print(json.dumps({'apiVersion':'v1','kind':'List','items':items},indent=2))
