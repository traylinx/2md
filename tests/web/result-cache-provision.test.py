import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('provision', ROOT / 'deploy/web/provision-result-cache.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
PASSWORD = 'synthetic_' + 'abcdefghijklmnopqrstuvwxyz0123456789_ABCDE'
BASE = b'# synthetic fixture\nrequirepass existing-synthetic-password\nappendonly yes\n'


def acl(password=PASSWORD):
    return ['flags', ['on', 'sanitize-payload'], 'passwords', [m.digest(password.encode())],
            'commands', '-@all ' + ' '.join(x for x in m.RULES if x.startswith('+')),
            'keys', ' '.join(x for x in m.RULES if x.startswith('~')),
            'channels', '', 'selectors', []]


class FakeValkey:
    def __init__(self):
        self.user = None
        self.writes = []
        self.fail_apply = False

    def __call__(self, password, username=None):
        return self

    def call(self, *args, last=None):
        if args == ('ACL', 'USERS'): return ['default', 'sentinel-limiter-v1']
        if args == ('ACL', 'GETUSER', 'sentinel-limiter-v1'): return ['sentinel', 'unchanged']
        if args == ('PING',): return 'PONG'
        if args == ('INFO', 'server'): return 'valkey_version:7.2.13\r\n'
        if args[:2] == ('CONFIG', 'GET'): return [args[2], '']
        if args == ('ACL', 'GETUSER', 'default'): return ['existing', 'unchanged']
        if args == ('ACL', 'GETUSER', m.USER): return self.user
        if args[:2] == ('ACL', 'SETUSER'):
            self.writes.append(args)
            if self.fail_apply: raise m.Refused('VALKEY_COMMAND')
            self.user = acl()
            return 'OK'
        if args[:2] == ('ACL', 'DRYRUN'): return 'User has no permissions to run command'
        if args[0] == 'EVAL': return ['123', '456']
        raise AssertionError(args)


class ProvisionTest(unittest.TestCase):
    def setUp(self):
        self.fs = {m.CONFIG: BASE, m.SENTINEL_INCLUDE: b'synthetic-sentinel'}
        self.client = FakeValkey()
        self.file_writes = []
        self.patches = [patch.object(m, 'SENTINEL_HASH', m.digest(b'synthetic-sentinel')), patch.object(m, 'read_regular', side_effect=lambda p, *a: self.fs[p]),
                        patch.object(m.Path, 'exists', lambda p: p in self.fs),
                        patch.object(m.os.path, 'lexists', side_effect=lambda p: p in self.fs),
                        patch.object(m, 'atomic_write', side_effect=self.write)]
        for p in self.patches: p.start()
        self.addCleanup(lambda: [p.stop() for p in reversed(self.patches)])

    def write(self, path, data, uid, gid, mode, absent=False):
        if absent and path in self.fs: raise FileExistsError()
        self.file_writes.append((path, mode))
        self.fs[path] = data

    def run_provision(self, apply=True):
        return m.provision(PASSWORD, m.digest(BASE), apply, uid=100, gid=100, client=self.client)

    def test_existing_sentinel_include_drift_refuses(self):
        self.fs[m.SENTINEL_INCLUDE] += b'drift'
        with self.assertRaisesRegex(m.Refused, 'SENTINEL_INCLUDE_DRIFT'):
            self.run_provision()
        self.assertFalse(self.file_writes or self.client.writes)

    def test_egress_is_read_only_and_single_endpoint(self):
        p = json.loads((ROOT / 'deploy/web/result-cache-egress.json').read_text())
        self.assertEqual(p['metadata']['namespace'], 'production')
        self.assertEqual(p['spec'], {
            'podSelector': {'matchLabels': {'app.kubernetes.io/name': 'traylinx-web-read'}},
            'policyTypes': ['Egress'],
            'egress': [{'to': [{'ipBlock': {'cidr': '100.69.18.112/32'}}],
                        'ports': [{'protocol': 'TCP', 'port': 6379}]}],
        })

    def test_inspect_has_no_writes(self):
        self.assertEqual('READY', self.run_provision(False)['status'])
        self.assertFalse(self.file_writes or self.client.writes)

    def test_apply_preserves_original_and_resumes_without_writes(self):
        result = self.run_provision()
        self.assertEqual('PASS', result['status'])
        self.assertEqual(BASE, self.fs[m.BACKUP])
        self.assertEqual(BASE + m.DIRECTIVE, self.fs[m.CONFIG])
        self.assertEqual([(m.BACKUP, 0o600), (m.INCLUDE, 0o600), (m.CONFIG, 0o640)], self.file_writes)
        self.file_writes.clear(); self.client.writes.clear()
        self.assertEqual('PASS', self.run_provision()['status'])
        self.assertFalse(self.file_writes or self.client.writes)

    def test_config_drift_refuses_before_writes(self):
        self.fs[m.CONFIG] += b'# concurrent change\n'
        with self.assertRaisesRegex(m.Refused, 'CONFIG_PREIMAGE'): self.run_provision()
        self.assertFalse(self.file_writes or self.client.writes)

    def test_conflicting_include_refuses_before_writes(self):
        self.fs[m.INCLUDE] = b'different user\n'
        with self.assertRaisesRegex(m.Refused, 'INCLUDE_CONFLICT'): self.run_provision()
        self.assertFalse(self.file_writes or self.client.writes)

    def test_existing_user_is_never_reset_or_rotated(self):
        self.client.user = acl('another-password')
        with self.assertRaisesRegex(m.Refused, 'EXISTING_USER_CONFLICT'): self.run_provision()
        self.assertFalse(self.file_writes or self.client.writes)

    def test_partial_acl_failure_preserves_files_and_resumes_exactly(self):
        self.client.fail_apply = True
        with self.assertRaisesRegex(m.Refused, 'VALKEY_COMMAND'): self.run_provision()
        self.assertEqual(BASE, self.fs[m.BACKUP])
        self.assertIn(m.INCLUDE, self.fs)
        self.client.fail_apply = False; self.file_writes.clear()
        self.assertEqual('PASS', self.run_provision()['status'])
        self.assertFalse(self.file_writes)

    def test_existing_configuration_manager_refused(self):
        for directive in ('include x', 'aclfile x', 'user default on nopass'):
            with self.assertRaisesRegex(m.Refused, 'ACL_MANAGER_CONFLICT|UNEXPECTED_INCLUDE'):
                m.original_config(BASE + directive.encode())

    def test_manifest_rules_match_versioned_policy(self):
        policy = json.loads((ROOT / 'deploy/web/result-cache-acl.json').read_text())
        self.assertEqual(policy['rules'], m.RULES)
        row = acl(); row[row.index('commands') + 1] += ' +flushall'
        self.assertFalse(m.matches(row, m.digest(PASSWORD.encode())))

    def test_cli_hash_is_stdin_only(self):
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '"OK"', '')) as run:
            self.assertEqual('OK', m.Valkey(PASSWORD).call('ACL', 'SETUSER', m.USER, last='#synthetic-hash'))
        args, kw = run.call_args
        self.assertNotIn(PASSWORD, str(args))
        self.assertNotIn('synthetic-hash', str(args))
        self.assertEqual('#synthetic-hash', kw['input'])
        self.assertEqual(PASSWORD, kw['env']['REDISCLI_AUTH'])

    def test_cli_errors_are_static(self):
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, PASSWORD, PASSWORD)):
            with self.assertRaisesRegex(m.Refused, '^VALKEY_COMMAND$'):
                m.Valkey(PASSWORD).call('PING')

    def test_native_cli_info_is_raw_even_in_json_mode(self):
        raw = '# Server\nvalkey_version:7.2.13\n'
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, raw, '')):
            self.assertEqual(raw, m.Valkey(PASSWORD).call('INFO', 'server'))
            with self.assertRaisesRegex(m.Refused, '^VALKEY_RESPONSE$'):
                m.Valkey(PASSWORD).call('ACL', 'GETUSER', m.USER)


if __name__ == '__main__':
    unittest.main()
