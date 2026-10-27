import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[2] / 'deploy/web/render-routes.py'
spec = importlib.util.spec_from_file_location('routes', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RoutesTest(unittest.TestCase):
    def test_always_paused_https_and_preserved_native_paths(self):
        gate, *routes = module.render()['items']
        self.assertEqual(gate['plugin'], 'request-termination')
        self.assertEqual(gate['config']['status_code'], 503)
        self.assertNotIn('trigger', gate['config'])
        self.assertNotIn('echo', gate['config'])
        self.assertEqual(len(routes), 4)
        paths = set()
        for route in routes:
            self.assertTrue(route['metadata']['name'].startswith('traylinx-web-'))
            a = route['metadata']['annotations']
            self.assertEqual(a['konghq.com/plugins'], gate['metadata']['name'])
            self.assertEqual(a['konghq.com/protocols'], 'https')
            self.assertEqual(a['konghq.com/strip-path'], 'false')
            for rule in route['spec']['rules']:
                self.assertEqual(route['spec']['tls'][0]['hosts'], [rule['host']])
                for p in rule['http']['paths']:
                    paths.add(p['path'])
                    if 'access' in p['path'] or p['path'].startswith('/internal/'):
                        self.assertEqual(p['pathType'], 'Exact')
        self.assertEqual(paths, {'/web/project-access', '/web/agent-project-access', '/web/background-project-access', '/internal/web/read', '/web/v1', '/approvals'})

    def test_dispatch_never_targets_legacy_python_search(self):
        routes = module.render()["items"]
        route = next(r for r in routes if r["metadata"]["name"] == "traylinx-web-search-ingress")
        backend = route["spec"]["rules"][0]["http"]["paths"][0]["backend"]["service"]
        self.assertEqual(backend, {"name": "traylinx-web-search", "port": {"number": 8083}})

    def test_invalid_namespace(self):
        for namespace in ['', '../production', 'Upper', 'trailing-']:
            with self.assertRaises(ValueError):
                module.render(namespace)


if __name__ == '__main__':
    unittest.main()
