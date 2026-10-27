#!/usr/bin/env python3
"""Render inert READ/control Kubernetes preparation; never applies resources."""
import argparse
import ipaddress
import json
import re


def render(read_image, control_image, namespace='production', runtime_bindings=False, gateway_cluster_ip=None):
    for image in (read_image, control_image):
        if not re.fullmatch(r'ghcr\.io/(?:traylinx|makakoo)/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}', image):
            raise ValueError('Expected immutable Traylinx/Makakoo GHCR image digest')
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', namespace):
        raise ValueError('Invalid namespace')

    if gateway_cluster_ip is not None:
        try:
            address = ipaddress.ip_address(gateway_cluster_ip)
            subnet = ipaddress.ip_network('10.43.0.0/16')
            valid = address in subnet and address not in (subnet.network_address, subnet.broadcast_address)
        except ValueError:
            valid = False
        if not runtime_bindings or not valid:
            raise ValueError('Gateway requires runtime bindings and a verified cluster service IP')

    def resource(kind, name, spec):
        version = {'Deployment': 'apps/v1', 'NetworkPolicy': 'networking.k8s.io/v1'}.get(kind, 'v1')
        return {'apiVersion': version, 'kind': kind,
                'metadata': {'name': name, 'namespace': namespace,
                             'labels': {'app.kubernetes.io/part-of': 'traylinx-web'}}, 'spec': spec}

    items = []
    for role, image, port in [('read', read_image, 8081), ('control', control_image, 8082)]:
        name = 'traylinx-web-' + role
        labels = {'app.kubernetes.io/name': name, 'app.kubernetes.io/part-of': 'traylinx-web'}
        prefix = 'WEB_' + role.upper()
        container = {
            'name': role, 'image': image, 'imagePullPolicy': 'IfNotPresent',
            'command': ['node', '--max-old-space-size=256', 'scripts/web-' + role + '-server.js'],
            'ports': [{'name': 'http', 'containerPort': port}],
            'env': [{'name': prefix + '_ENABLED', 'value': '0'},
                    {'name': prefix + '_HOST', 'value': '0.0.0.0'},
                    {'name': prefix + '_PORT', 'value': str(port)},
                    {'name': 'NODE_ENV', 'value': 'production'}],
            'securityContext': {'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True,
                                'capabilities': {'drop': ['ALL']}},
            'resources': {'requests': {'cpu': '100m', 'memory': '128Mi'},
                          'limits': {'cpu': '500m', 'memory': '384Mi'}},
            'startupProbe': {'httpGet': {'path': '/health/live', 'port': 'http'},
                             'periodSeconds': 2, 'failureThreshold': 15, 'timeoutSeconds': 1},
            'livenessProbe': {'httpGet': {'path': '/health/live', 'port': 'http'},
                              'periodSeconds': 10, 'failureThreshold': 3, 'timeoutSeconds': 1},
            'readinessProbe': {'httpGet': {'path': '/health/ready', 'port': 'http'},
                               'periodSeconds': 5, 'failureThreshold': 2, 'timeoutSeconds': 1}}
        if role == 'read':
            container['env'].append({'name': 'WEB_READ_AGENT_EXECUTION_ENABLED', 'value': '0'})
        items.append(resource('Deployment', name, {
            # Explicit inert preparation. Activation needs scoped credentials,
            # approved egress/ingress and migrations, not merely a scale command.
            'replicas': 0, 'revisionHistoryLimit': 2, 'progressDeadlineSeconds': 120,
            'strategy': {'type': 'Recreate'}, 'selector': {'matchLabels': labels},
            'template': {'metadata': {'labels': labels}, 'spec': {
                'automountServiceAccountToken': False, 'enableServiceLinks': False,
                'terminationGracePeriodSeconds': 20,
                'imagePullSecrets': [{'name': 'registry-ghcr'}],
                'securityContext': {'runAsNonRoot': True, 'runAsUser': 1000, 'runAsGroup': 1000,
                                    'seccompProfile': {'type': 'RuntimeDefault'}},
                'containers': [container]}}}))
        if runtime_bindings:
            pod = items[-1]['spec']['template']['spec']
            # Bind pre-provisioned secrets only. Never render secret values or enable traffic.
            container['envFrom'] = [{'secretRef': {'name': name + '-runtime', 'optional': False}}]
            if role == 'read':
                pod['volumes'] = [{'name': 'confirmation-public', 'secret': {
                    'secretName': 'traylinx-web-confirmation-public', 'defaultMode': 292,
                    'items': [{'key': 'public.pem', 'path': 'public.pem'}]}}]
                container['volumeMounts'] = [{'name': 'confirmation-public', 'mountPath': '/confirmation-public', 'readOnly': True}]
                container['env'].append({'name': 'WEB_READ_CONFIRM_PUBLIC_KEY_FILE', 'value': '/confirmation-public/public.pem'})
            else:
                pod['securityContext'].update({'fsGroup': 1000, 'fsGroupChangePolicy': 'OnRootMismatch'})
                pod['volumes'] = [
                    {'name': 'signing-source', 'secret': {'secretName': 'traylinx-web-confirmation-private',
                     'defaultMode': 288, 'items': [{'key': 'private.pem', 'path': 'private.pem'}]}},
                    {'name': 'signing-key', 'emptyDir': {'medium': 'Memory', 'sizeLimit': '1Mi'}}]
                container['volumeMounts'] = [{'name': 'signing-key', 'mountPath': '/signing-key', 'readOnly': True}]
                container['env'].append({'name': 'WEB_CONTROL_SIGNING_KEY_FILE', 'value': '/signing-key/private.pem'})
                # Secret volumes are symlinks; production control deliberately rejects those.
                # Copy only the selected key to a private regular file as the service UID.
                stage_key = "const fs=require('node:fs');const p='/signing-key/private.pem';const b=fs.readFileSync('/signing-source/private.pem');if(b.length>8192)throw Error('key size');const fd=fs.openSync(p,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);try{fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,b);}finally{fs.closeSync(fd);}"
                pod['initContainers'] = [{
                    'name': 'stage-signing-key', 'image': image, 'imagePullPolicy': 'IfNotPresent',
                    'command': ['node', '-e', stage_key],
                    'securityContext': {'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True,
                                        'capabilities': {'drop': ['ALL']}},
                    'resources': {'requests': {'cpu': '25m', 'memory': '32Mi'},
                                  'limits': {'cpu': '100m', 'memory': '64Mi'}},
                    'volumeMounts': [{'name': 'signing-source', 'mountPath': '/signing-source', 'readOnly': True},
                                     {'name': 'signing-key', 'mountPath': '/signing-key'}]}]
            # Existing PostgreSQL certificate identifies traylinx-db, not its IP.
            # Pin public trust material and retain hostname verification.
            pod['hostAliases'] = [{'ip': '100.69.18.112', 'hostnames': ['traylinx-db']}]
            pod['volumes'].append({'name': 'postgres-tls', 'configMap': {
                'name': 'traylinx-web-postgres-ca', 'defaultMode': 292,
                'items': [{'key': 'server.pem', 'path': 'server.pem'}]}})
            container['volumeMounts'].append({'name': 'postgres-tls', 'mountPath': '/postgres-tls', 'readOnly': True})
        items.append(resource('Service', name, {'type': 'ClusterIP', 'selector': labels,
            'ports': [{'name': 'http', 'port': port, 'targetPort': 'http'}]}))
        items.append(resource('NetworkPolicy', name + '-isolate', {
            'podSelector': {'matchLabels': labels}, 'policyTypes': ['Ingress', 'Egress'],
            'ingress': [], 'egress': []}))
        if gateway_cluster_ip is not None:
            # Fixed service hosts only. Preserve HTTPS Host/SNI/certificate checks;
            # avoid unrestricted Internet egress or public-IP DNS assumptions.
            pod['hostAliases'].append({'ip': gateway_cluster_ip,
                'hostnames': ['api.makakoo.com', 'api.2md.traylinx.com']})
            gateway = {'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kong'}},
                       'podSelector': {'matchLabels': {'app.kubernetes.io/component': 'app',
                           'app.kubernetes.io/instance': 'kong', 'app.kubernetes.io/name': 'kong'}}}
            items.append(resource('NetworkPolicy', name + '-gateway-access', {
                'podSelector': {'matchLabels': labels}, 'policyTypes': ['Ingress', 'Egress'],
                'ingress': [{'from': [gateway], 'ports': [{'protocol': 'TCP', 'port': port}]}],
                'egress': [{'to': [gateway], 'ports': [{'protocol': 'TCP', 'port': 8443}]}]}))
    return {'apiVersion': 'v1', 'kind': 'List', 'items': items}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--read-image', required=True)
    parser.add_argument('--control-image', required=True)
    parser.add_argument('--namespace', default='production')
    parser.add_argument('--runtime-bindings', action='store_true', help='Reference pre-provisioned secrets and stage control key; remain inert')
    parser.add_argument('--gateway-cluster-ip', help='Verified Kong proxy ClusterIP in this cluster; retain HTTPS identity and scoped pod egress')
    args = parser.parse_args()
    try:
        result = render(args.read_image, args.control_image, args.namespace, args.runtime_bindings, args.gateway_cluster_ip)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
