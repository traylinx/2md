#!/usr/bin/env python3
"""Render additive HTTPS routes, always blocked by a route-scoped release gate."""
import argparse
import json
import re


def render(namespace='production'):
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', namespace):
        raise ValueError('Invalid namespace')
    gate = 'traylinx-web-release-paused'
    items = [{'apiVersion': 'configuration.konghq.com/v1', 'kind': 'KongPlugin',
              'metadata': {'name': gate, 'namespace': namespace},
              'plugin': 'request-termination',
              'config': {'status_code': 503, 'content_type': 'application/json',
                         'body': '{"error":"WEB_RELEASE_NOT_ACTIVE"}'}}]
    # Native backend paths, no rewrite or stripping. Never edit legacy ingress plugins.
    routes = [
        ('workspace', 'api.makakoo.com', 'api-makakoo-com-tls', 'metrics-wsp-ms', 3000,
         [('/web/project-access', 'Exact'), ('/web/agent-project-access', 'Exact'),
          ('/web/background-project-access', 'Exact')]),
        ('search', 'api.makakoo.com', 'api-makakoo-com-tls', 'search-engines-ms', 8005,
         [('/internal/web/read', 'Exact')]),
        ('read', 'api.2md.traylinx.com', 'api-2md-traylinx-com-tls', 'traylinx-web-read', 8081,
         [('/web/v1', 'Prefix')]),
        ('control', 'api.2md.traylinx.com', 'api-2md-traylinx-com-tls', 'traylinx-web-control', 8082,
         [('/approvals', 'Prefix')]),
    ]
    for name, host, tls, service, port, paths in routes:
        items.append({'apiVersion': 'networking.k8s.io/v1', 'kind': 'Ingress',
                      'metadata': {'name': 'traylinx-web-' + name + '-ingress', 'namespace': namespace,
                                   'annotations': {'konghq.com/strip-path': 'false',
                                                   'konghq.com/protocols': 'https',
                                                   'konghq.com/https-redirect-status-code': '426',
                                                   'konghq.com/plugins': gate}},
                      'spec': {'ingressClassName': 'kong',
                               'tls': [{'hosts': [host], 'secretName': tls}],
                               'rules': [{'host': host, 'http': {'paths': [
                                   {'path': path, 'pathType': kind, 'backend': {
                                       'service': {'name': service, 'port': {'number': port}}}}
                                   for path, kind in paths]}}]}})
    return {'apiVersion': 'v1', 'kind': 'List', 'items': items}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--namespace', default='production')
    args = parser.parse_args()
    try:
        print(json.dumps(render(args.namespace), indent=2))
    except ValueError as error:
        parser.error(str(error))
