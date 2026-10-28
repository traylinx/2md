#!/usr/bin/env python3
"""Render additive resources only. Never modifies the legacy html2md Deployment."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
parser.add_argument('--namespace', default='production')
parser.add_argument('--grants', type=Path)
parser.add_argument('--ingress', action='store_true', help='Separate explicit promotion step after qualification')
args = parser.parse_args()
if not re.fullmatch(r'ghcr\.io/traylinx/2md@sha256:[a-f0-9]{64}', args.image):
    raise SystemExit('An immutable repository image digest is required')
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,62}', args.namespace):
    raise SystemExit('Invalid namespace')

def resource(kind, name, spec=None, **extra):
    api = 'apps/v1' if kind == 'Deployment' else 'networking.k8s.io/v1' if kind in ('NetworkPolicy', 'Ingress') else 'v1'
    result = {'apiVersion': api, 'kind': kind,
              'metadata': {'name': name, 'namespace': args.namespace, 'labels': {'app.kubernetes.io/part-of': 'html2md-capture'}}, **extra}
    if spec is not None:
        result['spec'] = spec
    return result

def service(role, port):
    result = resource('Service', role, {'selector': {'app': role}, 'ports': [
        {'name': f'tcp-{p}', 'port': p, 'targetPort': p} for p in port]})
    if role == 'html2md-capture':
        result['metadata']['annotations'] = {
            'konghq.com/protocol': 'https', 'konghq.com/host-header': 'api.2md.traylinx.com',
            'konghq.com/read-timeout': '65000', 'konghq.com/write-timeout': '65000',
            'konghq.com/connect-timeout': '5000', 'konghq.com/retries': '0',
        }
    return result

def deployment(role, proxy=False):
    env = [{'name': 'CAPTURE_PROXY_TOKEN', 'valueFrom': {'secretKeyRef': {'name': 'html2md-capture-control', 'key': 'token'}}}]
    if not proxy:
        env += [{'name': k, 'value': v} for k, v in {
            'HTML2MD_ENHANCED_CAPTURE': '1', 'HTML2MD_AUTHENTICATED_CAPTURE': '1',
            'CAPTURE_CONTAINMENT': 'isolated-proxy-v1',
            'CAPTURE_AUTH_URL': 'https://sentinel.traylinx.com/oauth/token/info',
            'CAPTURE_PROXY_CONTROL_URL': 'http://html2md-capture-egress:8280',
            'CAPTURE_GRANTS_FILE': '/capture-config/grants.json',
            'CAPTURE_TLS_TERMINATED_LOOPBACK': '1',
            'PUPPETEER_EXECUTABLE_PATH': '/usr/bin/chromium',
        }.items()]
    container = {'name': 'egress' if proxy else 'capture', 'image': args.image,
                 'imagePullPolicy': 'IfNotPresent',
                 'command': ['dumb-init', '--', '/app/scripts/capture-entrypoint.sh', 'node',
                             '--max-old-space-size=128' if proxy else '--max-old-space-size=256',
                             'scripts/capture-egress.js' if proxy else 'scripts/capture-server.js'],
                 'env': env,
                 'securityContext': {'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True,
                                     'capabilities': {'drop': ['ALL']}},
                 'resources': {'requests': {'cpu': '50m' if proxy else '100m', 'memory': '64Mi' if proxy else '256Mi'},
                               'limits': {'cpu': '250m' if proxy else '1', 'memory': '192Mi' if proxy else '1Gi'}},
                 'ports': [{'containerPort': 8280 if proxy else 8271, 'name': 'http'}],
                 'readinessProbe': {'httpGet': {'path': '/health', 'port': 'http', 'scheme': 'HTTP' if proxy else 'HTTPS'}, 'periodSeconds': 5, 'timeoutSeconds': 2},
                 'livenessProbe': {'httpGet': {'path': '/health', 'port': 'http', 'scheme': 'HTTP' if proxy else 'HTTPS'}, 'initialDelaySeconds': 10,
                                   'periodSeconds': 10, 'timeoutSeconds': 2, 'failureThreshold': 3},
                 'volumeMounts': [{'name': 'scratch', 'mountPath': '/tmp'}]}
    volumes = [{'name': 'scratch', 'emptyDir': {'medium': 'Memory', 'sizeLimit': '128Mi'}}]
    if not proxy:
        volumes.append({'name': 'tls', 'secret': {'secretName': 'api-2md-traylinx-com-tls', 'defaultMode': 0o440}})
        volumes.append({'name': 'configuration', 'configMap': {'name': 'html2md-capture-policy'}})
        container['volumeMounts'].append({'name': 'configuration', 'mountPath': '/capture-config', 'readOnly': True})
    containers = [container]
    if not proxy:
        # No certificate/private-key mount in the browser/API container. Containers
        # have separate PID and filesystem namespaces; only loopback is shared.
        container['readinessProbe'] = {'exec': {'command': ['node', '-e',
            "fetch('http://127.0.0.1:8271/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"]},
            'periodSeconds': 10, 'timeoutSeconds': 3}
        container['livenessProbe'] = {**container['readinessProbe'], 'initialDelaySeconds': 10, 'failureThreshold': 3}
        containers.append({'name': 'tls-frontend', 'image': args.image,
            'command': ['dumb-init', '--', '/app/scripts/capture-entrypoint.sh', 'node', '--max-old-space-size=64', 'scripts/capture-frontend.js'],
            'env': [{'name': 'CAPTURE_TLS_CERT_FILE', 'value': '/capture-tls/tls.crt'},
                    {'name': 'CAPTURE_TLS_KEY_FILE', 'value': '/capture-tls/tls.key'}],
            'securityContext': {'runAsUser': 1001, 'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True,
                                'capabilities': {'drop': ['ALL']}},
            'resources': {'requests': {'cpu': '20m', 'memory': '32Mi'}, 'limits': {'cpu': '100m', 'memory': '128Mi'}},
            'ports': [{'name': 'https', 'containerPort': 8270}],
            'readinessProbe': {'httpGet': {'path': '/health', 'port': 'https', 'scheme': 'HTTPS'}, 'periodSeconds': 5, 'timeoutSeconds': 3},
            'livenessProbe': {'httpGet': {'path': '/health', 'port': 'https', 'scheme': 'HTTPS'}, 'periodSeconds': 10, 'timeoutSeconds': 3, 'failureThreshold': 3},
            'volumeMounts': [{'name': 'tls', 'mountPath': '/capture-tls', 'readOnly': True}]})
    return resource('Deployment', role, {'replicas': 1, 'strategy': {'type': 'Recreate'},
        'selector': {'matchLabels': {'app': role}}, 'template': {'metadata': {'labels': {'app': role}},
        'spec': {'automountServiceAccountToken': False, 'terminationGracePeriodSeconds': 70,
                 'nodeSelector': {'kubernetes.io/hostname': 'traylinx-k3s-02'},
                 'securityContext': {'runAsNonRoot': True, 'runAsUser': 1000, 'runAsGroup': 1000,
                                     'fsGroup': 1000, 'seccompProfile': {'type': 'RuntimeDefault'}},
                 'containers': containers, 'volumes': volumes}}})

dns = {'to': [{'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kube-system'}},
               'podSelector': {'matchLabels': {'k8s-app': 'kube-dns'}}}],
       'ports': [{'protocol': protocol, 'port': 53} for protocol in ('UDP', 'TCP')]}
private = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
           '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
           '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4']
capture_policy = resource('NetworkPolicy', 'html2md-capture-isolation', {
    'podSelector': {'matchLabels': {'app': 'html2md-capture'}}, 'policyTypes': ['Ingress', 'Egress'],
    'ingress': [{'from': [{'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kong'}}}],
                 'ports': [{'protocol': 'TCP', 'port': 8270}]}],
    'egress': [dns, {'to': [{'podSelector': {'matchLabels': {'app': 'html2md-capture-egress'}}}],
                    'ports': [{'protocol': 'TCP', 'port': p} for p in (8280, 8281, 8282)]},
               # In-cluster NAT may translate the public Sentinel endpoint to
               # Kong's TLS target port. Only that identity transport is allowed.
               {'to': [{'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kong'}},
                         'podSelector': {'matchLabels': {'app.kubernetes.io/name': 'kong'}}}],
                'ports': [{'protocol': 'TCP', 'port': 8443}]},
               # Exact current Sentinel ingress IPs; re-qualify if infrastructure changes.
               {'to': [{'ipBlock': {'cidr': f'{ip}/32'}} for ip in ('31.70.91.72', '31.70.66.143', '31.70.90.168')],
                'ports': [{'protocol': 'TCP', 'port': 443}]}]})
proxy_policy = resource('NetworkPolicy', 'html2md-capture-egress-isolation', {
    'podSelector': {'matchLabels': {'app': 'html2md-capture-egress'}}, 'policyTypes': ['Ingress', 'Egress'],
    'ingress': [{'from': [{'podSelector': {'matchLabels': {'app': 'html2md-capture'}}}],
                 'ports': [{'protocol': 'TCP', 'port': p} for p in (8280, 8281, 8282)]}],
    'egress': [dns,
               # Public ingress addresses may be DNATed to Kong pod endpoints.
               # DNS pinning still refuses URLs resolving directly to private IPs.
               {'to': [{'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kong'}},
                         'podSelector': {'matchLabels': {'app.kubernetes.io/name': 'kong'}}}],
                'ports': [{'protocol': 'TCP', 'port': p} for p in (8000, 8443)]},
               {'to': [{'ipBlock': {'cidr': '0.0.0.0/0', 'except': private}}],
                     'ports': [{'protocol': 'TCP', 'port': 80}, {'protocol': 'TCP', 'port': 443}]}]})

grants = json.loads(args.grants.read_text()) if args.grants else {}
policy = resource('ConfigMap', 'html2md-capture-policy', data={
    'grants.json': json.dumps(grants)})
items = [capture_policy, proxy_policy, policy, service('html2md-capture', [8270]),
         service('html2md-capture-egress', [8280, 8281, 8282]), deployment('html2md-capture-egress', True), deployment('html2md-capture')]
if args.ingress:
    ingress = resource('Ingress', 'html2md-capture-ingress', {
        'ingressClassName': 'kong', 'rules': [{'host': 'api.2md.traylinx.com', 'http': {'paths': [
            {'path': p, 'pathType': 'Exact', 'backend': {'service': {'name': 'html2md-capture', 'port': {'number': 8270}}}}
            for p in ('/api/capture/v1', '/api/capture/v1/authenticated', '/api/capture/v1/login-inspection')
        ]}}], 'tls': [{'hosts': ['api.2md.traylinx.com'], 'secretName': 'api-2md-traylinx-com-tls'}]})
    ingress['metadata']['annotations'] = {
        'konghq.com/strip-path': 'false', 'konghq.com/preserve-host': 'false',
        'konghq.com/protocols': 'https', 'konghq.com/https-redirect-status-code': '426',
        'konghq.com/request-buffering': 'false', 'konghq.com/response-buffering': 'false',
        'konghq.com/plugins': 'html2md-capture-verified-tls',
    }
    # KIC 3.3 cannot set service.tls_verify via annotations. The route-scoped
    # supported PDK call fails closed. Kong's upstream CA bundle must be configured
    # and negative-TLS tests must pass BEFORE this ingress is applied.
    plugin = {'apiVersion': 'configuration.konghq.com/v1', 'kind': 'KongPlugin',
        'metadata': {'name': 'html2md-capture-verified-tls', 'namespace': args.namespace},
        'plugin': 'pre-function', 'config': {'access': [
            Path(__file__).with_name('verify-upstream.lua').read_text()
        ]}}
    items.extend([plugin, ingress])
print(json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': items}, indent=2))
