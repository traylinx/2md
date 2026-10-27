import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[2] / 'deploy/web/render.py'
spec = importlib.util.spec_from_file_location('web_deployment', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeploymentTest(unittest.TestCase):
    image = 'ghcr.io/traylinx/web-read@sha256:' + 'a' * 64

    def test_inert_separate_resources(self):
        items = module.render(self.image, self.image)['items']
        self.assertEqual(len(items), 6)
        deployments = [r for r in items if r['kind'] == 'Deployment']
        self.assertEqual([d['metadata']['name'] for d in deployments], ['traylinx-web-read', 'traylinx-web-control'])
        for deployment in deployments:
            self.assertEqual(deployment['spec']['replicas'], 0)
            pod = deployment['spec']['template']['spec']
            self.assertFalse(pod['automountServiceAccountToken'])
            self.assertTrue(pod['securityContext']['runAsNonRoot'])
            container = pod['containers'][0]
            self.assertTrue(container['securityContext']['readOnlyRootFilesystem'])
            self.assertEqual(container['securityContext']['capabilities']['drop'], ['ALL'])
            self.assertEqual(container['image'], self.image)
            self.assertTrue(all(e['value'] == '0' for e in container['env'] if e['name'].endswith('_ENABLED')))
            self.assertNotIn('envFrom', container)
            self.assertNotIn('volumes', pod)
            self.assertEqual(container['readinessProbe']['httpGet']['path'], '/health/ready')
        for policy in (r for r in items if r['kind'] == 'NetworkPolicy'):
            self.assertEqual(policy['spec']['ingress'], [])
            self.assertEqual(policy['spec']['egress'], [])
        self.assertFalse(any(r['kind'] in ['Ingress', 'Secret', 'Job', 'Namespace'] for r in items))

    def test_rejects_mutable_and_foreign_images(self):
        for value in ['node:22', 'ghcr.io/traylinx/web:latest', self.image + ':latest', self.image.replace('traylinx', 'untrusted')]:
            with self.assertRaises(ValueError):
                module.render(value, self.image)
            with self.assertRaises(ValueError):
                module.render(self.image, value)

    def test_namespace_validation(self):
        for value in ['', '../production', 'production-', 'A', 'a' * 64]:
            with self.assertRaises(ValueError):
                module.render(self.image, self.image, value)
        self.assertEqual(module.render(self.image, self.image, 'web-staging')['items'][0]['metadata']['namespace'], 'web-staging')


if __name__ == '__main__':
    unittest.main()
