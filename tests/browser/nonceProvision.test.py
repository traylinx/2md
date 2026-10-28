import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard_tests = load('guard_tests', ROOT / 'tests/web/result-cache-provision.test.py')
n = load('nonce_provision', ROOT / 'deploy/browser/provision-nonces.py')
guard_tests.m = n.m
n.m.INCLUDE, n.m.BACKUP = n.INCLUDE, n.BACKUP
READ_INCLUDE = Path('/etc/valkey/web-read-users.conf')


class FakeValkey(guard_tests.FakeValkey):
    def call(self, *args, last=None):
        if args == ('CONFIG', 'GET', 'maxmemory-policy'): return ['maxmemory-policy', 'noeviction']
        if args == ('CONFIG', 'GET', 'appendonly'): return ['appendonly', 'yes']
        if args[:2] == ('ACL', 'DRYRUN') and args[3:4] in [('SET',), ('INFO',)]:
            if args[3] == 'INFO' or args[4].startswith('browser-v1:nonce:'): return 'OK'
        return super().call(*args, last=last)


class NonceProvisionTest(guard_tests.ProvisionTest):
    def setUp(self):
        super().setUp()
        self.client = FakeValkey()
        self.fs[READ_INCLUDE] = b'owned-read-include'

    def run_provision(self, apply=True):
        return n.provision(guard_tests.PASSWORD, n.m.digest(guard_tests.BASE), apply,
                           read_include_hash=n.m.digest(b'owned-read-include'),
                           uid=100, gid=100, client=self.client)

    def test_manifest_rules_match_versioned_policy(self):
        self.assertEqual(n.policy.RULES, n.m.RULES)
        row = guard_tests.acl(); row[row.index('commands') + 1] += ' +flushall'
        self.assertFalse(n.m.matches(row, n.m.digest(guard_tests.PASSWORD.encode())))

    def test_read_include_drift_refuses_before_any_write(self):
        self.fs[READ_INCLUDE] += b'drift'
        with self.assertRaisesRegex(n.m.Refused, 'EXTRA_INCLUDE_DRIFT'): self.run_provision()
        self.assertFalse(self.file_writes or self.client.writes)

    def test_nonce_policy_requires_persistence_and_no_eviction(self):
        for value in [{'maxmemory-policy': ['maxmemory-policy', 'allkeys-lru'], 'appendonly': ['appendonly', 'yes']},
                      {'maxmemory-policy': ['maxmemory-policy', 'noeviction'], 'appendonly': ['appendonly', 'no']}]:
            with self.assertRaises(n.m.Refused): n.policy_check(value)

    def test_apply_is_nonce_specific_not_lua(self):
        result = self.run_provision()
        self.assertTrue(result['scoped_auth_and_nonce_commands'])
        self.assertNotIn('scoped_auth_and_lua', result)
        self.assertEqual(6, result['denial_checks'])
        self.assertEqual(b'owned-read-include', self.fs[READ_INCLUDE])


if __name__ == '__main__':
    unittest.main()
