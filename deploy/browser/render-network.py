#!/usr/bin/env python3
"""Render scoped candidate network permissions. No apply, secrets or activation."""
import argparse
import ipaddress
import json
import re

p = argparse.ArgumentParser()
p.add_argument('--database-ip', required=True)
p.add_argument('--namespace', default='production')
a = p.parse_args()
try:
    database = ipaddress.ip_address(a.database_ip)
    if database.version != 4 or database not in ipaddress.ip_network('100.64.0.0/10'):
        raise ValueError()
except ValueError:
    p.error('explicit verified Tailscale IPv4 database address required')
if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', a.namespace):
    p.error('invalid namespace')

def ports(*values):
    return [{'protocol': 'TCP', 'port': port} for port in values]

def pod(name):
    return {'podSelector': {'matchLabels': {'app': 'traylinx-browser-' + name}}}

gateway = {'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kong'}},
           'podSelector': {'matchLabels': {'app.kubernetes.io/name': 'kong', 'app.kubernetes.io/instance': 'kong', 'app.kubernetes.io/component': 'app'}}}
dns = {'to': [{'namespaceSelector': {'matchLabels': {'kubernetes.io/metadata.name': 'kube-system'}},
              'podSelector': {'matchLabels': {'k8s-app': 'kube-dns'}}}],
       'ports': [{'protocol': proto, 'port': 53} for proto in ['UDP', 'TCP']]}
nonpublic = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
             '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
             '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4']
runtime_egress = [dns, {'to': [pod('egress')], 'ports': ports(8290, 8291)},
                  {'to': [gateway], 'ports': ports(8443)},
                  {'to': [{'ipBlock': {'cidr': str(database) + '/32'}}], 'ports': ports(5432, 6379)}]
egress_egress = [dns, {'to': [{'ipBlock': {'cidr': '0.0.0.0/0', 'except': nonpublic}}], 'ports': ports(80, 443)}]
items = []
for role, inbound, outbound in [
    ('runtime', [{'from': [gateway], 'ports': ports(8292)}], runtime_egress),
    ('egress', [{'from': [pod('runtime')], 'ports': ports(8290, 8291)}], egress_egress),
]:
    items.append({'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy',
                  'metadata': {'name': 'traylinx-browser-' + role + '-access', 'namespace': a.namespace},
                  'spec': {'podSelector': pod(role)['podSelector'], 'policyTypes': ['Ingress', 'Egress'],
                           'ingress': inbound, 'egress': outbound}})
print(json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': items}, indent=2))
