#!/usr/bin/env python3
"""Guarded additive nonce ACL provisioning. Reuses Web READ persistence safeguards.

No restarts, rotation, replay or data writes. Keep both adjacent deployment modules
at their repository-relative paths. Password via protected stdin only.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import resource
import socket
import sys


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ROOT = Path(__file__).resolve().parents[1]
m = load('nonce_provision_guard', ROOT / 'web/provision-result-cache.py')
policy = load('nonce_policy', ROOT / 'browser/nonce-acl.py')
m.USER, m.RULES = policy.USER, policy.RULES
INCLUDE = Path('/etc/valkey/browser-nonce-users.conf')
BACKUP = Path('/etc/valkey/valkey.conf.browser-nonce-v1.preimage')
m.DIRECTIVE = b'include /etc/valkey/browser-nonce-users.conf\n'


def policy_check(baseline):
    m.require(baseline['maxmemory-policy'] == ['maxmemory-policy', 'noeviction'], 'NONCE_EVICTION_POLICY')
    m.require(baseline['appendonly'] == ['appendonly', 'yes'], 'NONCE_PERSISTENCE')


def scoped_check(admin, scoped):
    for command in [('SET', 'browser-v1:nonce:owned-verification', '1', 'PX', '1000', 'NX'), ('INFO', 'memory')]:
        m.require(admin.call('ACL', 'DRYRUN', m.USER, *command) == 'OK', 'NONCE_COMMAND_PERMISSION')
    denied = [('SET', 'other-consumer:key', '1'), ('GET', 'browser-v1:nonce:owned-verification'),
              ('EVAL', 'return 1', '0'), ('SELECT', '1'), ('ACL', 'LIST'), ('CONFIG', 'GET', '*')]
    for command in denied:
        response = admin.call('ACL', 'DRYRUN', m.USER, *command)
        m.require(isinstance(response, str) and 'no permissions' in response.lower(), 'NONCE_DENIAL_VERIFY')
    return {'scoped_auth_and_nonce_commands': True, 'denial_checks': len(denied)}


def provision(password, expected, apply, *, read_include_hash, **kwargs):
    return m.provision(password, expected, apply, include=INCLUDE, backup=BACKUP,
                       policy_check=policy_check, scoped_check=scoped_check,
                       extra_includes={Path('/etc/valkey/web-read-users.conf'): read_include_hash}, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-config-sha256', required=True)
    parser.add_argument('--expected-read-include-sha256', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--approval-reference')
    args = parser.parse_args()
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        m.require(os.geteuid() == 0 and socket.gethostname() == 'traylinx-db', 'HOST_IDENTITY')
        m.require(not args.apply or (args.approval_reference and re.fullmatch(r'[A-Za-z0-9_.:/-]{1,200}', args.approval_reference)), 'APPROVAL_REQUIRED')
        m.require(not sys.stdin.isatty(), 'PROTECTED_STDIN_REQUIRED')
        m.require(m.CONFIG.lstat().st_gid == pwd.getpwnam('valkey').pw_gid, 'CONFIG_GROUP')
        result = provision(sys.stdin.read(130), args.expected_config_sha256, args.apply, read_include_hash=args.expected_read_include_sha256)
        result['approval_reference'] = args.approval_reference
        print(json.dumps(result))
        return 0
    except Exception as error:
        print(json.dumps({'status': 'REFUSED', 'reason': str(error) if isinstance(error, m.Refused) else 'PROVISIONING_FAILED',
                          'automatic_rollback': False, 'reconcile_partial_state': bool(args.apply)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
