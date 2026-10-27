#!/usr/bin/env python3
"""Render inert READ/control Kubernetes preparation; never applies resources."""
import argparse
import json
import re


def render(read_image, control_image, namespace='production'):
    for image in (read_image, control_image):
        if not re.fullmatch(r'ghcr\.io/(?:traylinx|makakoo)/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}', image):
            raise ValueError('Expected immutable Traylinx/Makakoo GHCR image digest')
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', namespace):
        raise ValueError('Invalid namespace')

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
                'securityContext': {'runAsNonRoot': True, 'runAsUser': 1000, 'runAsGroup': 1000,
                                    'seccompProfile': {'type': 'RuntimeDefault'}},
                'containers': [container]}}}))
        items.append(resource('Service', name, {'type': 'ClusterIP', 'selector': labels,
            'ports': [{'name': 'http', 'port': port, 'targetPort': 'http'}]}))
        items.append(resource('NetworkPolicy', name + '-isolate', {
            'podSelector': {'matchLabels': labels}, 'policyTypes': ['Ingress', 'Egress'],
            'ingress': [], 'egress': []}))
    return {'apiVersion': 'v1', 'kind': 'List', 'items': items}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--read-image', required=True)
    parser.add_argument('--control-image', required=True)
    parser.add_argument('--namespace', default='production')
    args = parser.parse_args()
    try:
        result = render(args.read_image, args.control_image, args.namespace)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
