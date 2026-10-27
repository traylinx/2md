import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('search_renderer', Path(__file__).resolve().parents[2] / 'deploy/web/render-search.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
IMAGE = 'ghcr.io/traylinx/web-intelligence-agent@sha256:' + 'a' * 64


class SearchRenderTest(unittest.TestCase):
    def test_inert_separate_transport_only(self):
        deployment, service, policy = module.render(IMAGE)['items']
        self.assertEqual(deployment['metadata']['name'], 'traylinx-web-search')
        self.assertEqual(deployment['spec']['replicas'], 0)
        pod = deployment['spec']['template']['spec']
        self.assertFalse(pod['automountServiceAccountToken'])
        self.assertNotIn('volumes', pod)
        self.assertEqual(pod['terminationGracePeriodSeconds'], 100)
        container = pod['containers'][0]
        self.assertEqual(container['command'][-1], 'dist-web/web-read-server.js')
        self.assertIn({'name': 'WEB_READ_DISPATCH_ENABLED', 'value': '0'}, container['env'])
        self.assertNotIn('envFrom', container)
        self.assertEqual(service['spec']['ports'][0]['port'], 8083)
        self.assertEqual(policy['spec']['egress'], [])
        self.assertEqual(service['spec']['selector'], deployment['spec']['selector']['matchLabels'])

    def test_scoped_gateway_without_database_or_public_egress(self):
        items = module.render(IMAGE, runtime_bindings=True, gateway_cluster_ip='10.43.131.119')['items']
        pod = items[0]['spec']['template']['spec']
        self.assertEqual(pod['containers'][0]['envFrom'][0]['secretRef']['name'], 'traylinx-web-search-runtime')
        self.assertEqual(len(pod['hostAliases']), 1)
        self.assertEqual(items[-1]['spec']['egress'][0]['ports'], [{'protocol': 'TCP', 'port': 8443}])
        self.assertEqual(items[-1]['spec']['ingress'][0]['ports'][0]['port'], 8083)
        self.assertNotIn('ipBlock', str(items))
        self.assertNotIn('traylinx-db', str(items))

    def test_invalid_inputs(self):
        for address in ['1.1.1.1', '10.43.0.0', '10.43.255.255', 'invalid']:
            with self.assertRaises(ValueError):
                module.render(IMAGE, runtime_bindings=True, gateway_cluster_ip=address)
        with self.assertRaises(ValueError):
            module.render(IMAGE, gateway_cluster_ip='10.43.131.119')
        with self.assertRaises(ValueError):
            module.render('image:latest')


if __name__ == '__main__':
    unittest.main()
