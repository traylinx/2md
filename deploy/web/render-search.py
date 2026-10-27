#!/usr/bin/env python3
"""Render standalone inert dispatch; never replaces legacy search-engines-ms."""
import argparse
import importlib.util
import ipaddress
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location('web_base_renderer', Path(__file__).with_name('render.py'))
_base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_base)


def render(image, namespace='production', runtime_bindings=False, gateway_cluster_ip=None):
    # Reuse the hardened inert workload template, without READ DB/cache/key bindings.
    baseline = _base.render(image, image, namespace)
    items = baseline['items'][:3]
    old, name = 'traylinx-web-read', 'traylinx-web-search'
    items = json.loads(json.dumps(items).replace(old, name))
    deployment, service, isolation = items
    pod = deployment['spec']['template']['spec']
    pod['terminationGracePeriodSeconds'] = 100
    container = pod['containers'][0]
    container.update(name='search', command=['node', '--max-old-space-size=256', 'dist-web/web-read-server.js'])
    container['ports'][0]['containerPort'] = 8083
    container['env'] = [{'name': k, 'value': v} for k, v in {
        'NODE_ENV': 'production', 'WEB_READ_DISPATCH_ENABLED': '0',
        'WEB_SEARCH_HOST': '0.0.0.0', 'WEB_SEARCH_PORT': '8083',
        'WEB_SEARCH_MAX_CONCURRENT': '2'}.items()]
    service['spec']['ports'][0]['port'] = 8083
    if runtime_bindings:
        container['envFrom'] = [{'secretRef': {'name': name + '-runtime', 'optional': False}}]
    if gateway_cluster_ip is not None:
        try:
            address = ipaddress.ip_address(gateway_cluster_ip)
            subnet = ipaddress.ip_network('10.43.0.0/16')
            valid = address in subnet and address not in (subnet.network_address, subnet.broadcast_address)
        except ValueError:
            valid = False
        if not runtime_bindings or not valid:
            raise ValueError('Gateway requires runtime bindings and verified cluster service IP')
        pod['hostAliases'] = [{'ip': gateway_cluster_ip, 'hostnames': ['api.makakoo.com', 'api.2md.traylinx.com']}]
        gateway = {'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kong'}},
                   'podSelector': {'matchLabels': {'app.kubernetes.io/component': 'app',
                       'app.kubernetes.io/instance': 'kong', 'app.kubernetes.io/name': 'kong'}}}
        items.append({'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy',
            'metadata': {'name': name + '-gateway-access', 'namespace': namespace},
            'spec': {'podSelector': isolation['spec']['podSelector'], 'policyTypes': ['Ingress', 'Egress'],
                     'ingress': [{'from': [gateway], 'ports': [{'protocol': 'TCP', 'port': 8083}]}],
                     'egress': [{'to': [gateway], 'ports': [{'protocol': 'TCP', 'port': 8443}]}]}})
    return {'apiVersion': 'v1', 'kind': 'List', 'items': items}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--namespace', default='production')
    parser.add_argument('--runtime-bindings', action='store_true')
    parser.add_argument('--gateway-cluster-ip')
    args = parser.parse_args()
    try:
        print(json.dumps(render(args.image, args.namespace, args.runtime_bindings, args.gateway_cluster_ip), indent=2))
    except ValueError as error:
        parser.error(str(error))
