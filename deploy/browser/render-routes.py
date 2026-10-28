#!/usr/bin/env python3
"""Render separate browser routes behind a closed release gate; never apply."""
import argparse
import json
import re


def render(namespace='production'):
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', namespace):
        raise ValueError('Invalid namespace')
    gate = 'traylinx-browser-release-paused'
    host = 'api.2md.traylinx.com'
    return {'apiVersion': 'v1', 'kind': 'List', 'items': [
        {'apiVersion': 'configuration.konghq.com/v1', 'kind': 'KongPlugin',
         'metadata': {'name': gate, 'namespace': namespace},
         'plugin': 'request-termination',
         'config': {'status_code': 503, 'content_type': 'application/json',
                    'body': '{"error":"BROWSER_RELEASE_NOT_ACTIVE"}'}},
        {'apiVersion': 'networking.k8s.io/v1', 'kind': 'Ingress',
         'metadata': {'name': 'traylinx-browser-ingress', 'namespace': namespace,
                      'annotations': {'konghq.com/strip-path': 'false',
                                      'konghq.com/protocols': 'https',
                                      'konghq.com/https-redirect-status-code': '426',
                                      'konghq.com/plugins': gate}},
         'spec': {'ingressClassName': 'kong',
                  'tls': [{'hosts': [host], 'secretName': 'api-2md-traylinx-com-tls'}],
                  'rules': [{'host': host, 'http': {'paths': [
                      {'path': path, 'pathType': 'Prefix', 'backend': {
                          'service': {'name': 'traylinx-browser-runtime',
                                      'port': {'number': 8292}}}}
                      for path in ['/api/browser/v1', '/api/browser/enrollment/v1',
                                   '/api/browser/control/v1']]}}]}}
    ]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--namespace', default='production')
    args = parser.parse_args()
    try:
        print(json.dumps(render(args.namespace), indent=2))
    except ValueError as error:
        parser.error(str(error))
