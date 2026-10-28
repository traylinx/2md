#!/usr/bin/env python3
"""Add only the approved Web READ result-cache ACL. Password via stdin; no restart or data writes.

Run locally on traylinx-db as root after explicit approval. Native valkey-cli keeps
credentials out of argv; captured results/errors never reach operator output.
Partial failures retain protected files for an exact-input resume, never deletion.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import resource
import shlex
import socket
import stat
import subprocess
import sys
import tempfile

USER = 'web-read-results-v1'
CONFIG = Path('/etc/valkey/valkey.conf')
INCLUDE = Path('/etc/valkey/web-read-users.conf')
BACKUP = Path('/etc/valkey/valkey.conf.web-read-v1.preimage')
DIRECTIVE = b'include /etc/valkey/web-read-users.conf\n'
RULES = ['reset', 'on', 'sanitize-payload', 'resetchannels',
         '~web-read:{transient-results}:*', '+ping', '+info', '+eval', '+time',
         '+zrangebyscore', '+hdel', '+zrem', '+exists', '+hvals', '+zcard',
         '+zadd', '+hset', '+set', '+get']
SENTINEL_INCLUDE = Path('/etc/valkey/sentinel-users.conf')
SENTINEL_HASH = '750ef6a57cc4d9dd9e7f019602ca85b7de2604363e2f535fc885f4f133cd3888'



class Refused(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Refused(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_regular(path, uid, mode):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and st.st_uid == uid and
                stat.S_IMODE(st.st_mode) == mode and st.st_nlink == 1 and
                st.st_size <= 1_048_576, 'FILE_METADATA')
        return os.read(fd, 1_048_577)
    finally:
        os.close(fd)


def atomic_write(path, data, uid, gid, mode, *, absent=False):
    fd, name = tempfile.mkstemp(prefix='.web-read-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            os.fchmod(f.fileno(), mode)
            os.fchown(f.fileno(), uid, gid)
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        if absent:
            os.link(name, path)  # Exclusive publication; never overwrite another owner.
        else:
            os.replace(name, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def original_config(raw, extra_includes=()):
    passwords = []
    for line in raw.decode().splitlines():
        parts = shlex.split(line, comments=True)
        if not parts:
            continue
        if parts[0].lower() == 'include':
            require(len(parts) == 2 and parts[1] in {str(SENTINEL_INCLUDE), *(str(p) for p in extra_includes)}, 'UNEXPECTED_INCLUDE')
        require(parts[0].lower() not in ('aclfile', 'user'), 'ACL_MANAGER_CONFLICT')
        if parts[0].lower() == 'requirepass':
            require(len(parts) == 2 and parts[1], 'DEFAULT_PASSWORD')
            passwords.append(parts[1])
    require(len(passwords) == 1, 'DEFAULT_PASSWORD')
    return passwords[0]


class Valkey:
    def __init__(self, password, username=None):
        self.password, self.username = password, username

    def call(self, *args, last=None):
        command = ['/usr/bin/valkey-cli', '-h', '127.0.0.1', '-p', '6379', '-2', '--json']
        if self.username:
            command += ['--user', self.username]
        if last is not None:
            command += ['-x']
        env = {'PATH': '/usr/bin:/bin', 'REDISCLI_AUTH': self.password}
        result = subprocess.run(command + list(args), input=last, env=env,
                                capture_output=True, text=True, timeout=10)
        require(result.returncode == 0 and len(result.stdout) <= 131072, 'VALKEY_COMMAND')
        # valkey-cli deliberately prints INFO as raw text even with --json.
        # text=True normalizes CRLF; keep this exception scoped to INFO server.
        if args == ('INFO', 'server') and result.stdout.startswith('# Server'):
            return result.stdout
        try:
            return json.loads(result.stdout)
        except (ValueError, TypeError):
            raise Refused('VALKEY_RESPONSE') from None


def fields(value):
    require(isinstance(value, list) and len(value) % 2 == 0, 'ACL_RESPONSE')
    return dict(zip(value[::2], value[1::2]))


def matches(actual, password_hash):
    if actual is None:
        return False
    row = fields(actual)
    return (set(row.get('flags', [])) == {'on', 'sanitize-payload'} and
            row.get('passwords') == [password_hash] and
            set(row.get('keys', '').split()) == {x for x in RULES if x.startswith('~')} and
            set(row.get('commands', '').split()) == {'-@all'} | {x for x in RULES if x.startswith('+')} and
            row.get('channels') == '' and row.get('selectors') == [])


def provision(password, expected, apply, *, config=CONFIG, include=INCLUDE, backup=BACKUP,
              uid=None, gid=None, client=Valkey, policy_check=None, scoped_check=None, extra_includes=None):
    require(re.fullmatch(r'[A-Za-z0-9_-]{43,128}', password) is not None, 'PASSWORD_FORMAT')
    require(re.fullmatch(r'[0-9a-f]{64}', expected) is not None, 'PREIMAGE_FORMAT')
    uid = pwd.getpwnam('valkey').pw_uid if uid is None else uid
    gid = pwd.getpwnam('valkey').pw_gid if gid is None else gid
    sentinel_before = read_regular(SENTINEL_INCLUDE, uid, 0o600)
    require(digest(sentinel_before) == SENTINEL_HASH, 'SENTINEL_INCLUDE_DRIFT')
    preserved_includes = {}
    for path, expected_hash in (extra_includes or {}).items():
        content = read_regular(path, uid, 0o600)
        require(digest(content) == expected_hash, 'EXTRA_INCLUDE_DRIFT')
        preserved_includes[path] = content
    current = read_regular(config, uid, 0o640)
    original = read_regular(backup, 0, 0o600) if backup.exists() else current
    require(digest(original) == expected, 'CONFIG_PREIMAGE')
    updated = original + (b'' if original.endswith(b'\n') else b'\n') + DIRECTIVE
    require(current in (original, updated), 'CONFIG_DRIFT')
    admin = client(original_config(original, preserved_includes))
    password_hash = digest(password.encode())
    payload = ('user ' + USER + ' ' + ' '.join(RULES) + ' #' + password_hash + '\n').encode()
    if os.path.lexists(include):
        require(read_regular(include, uid, 0o600) == payload, 'INCLUDE_CONFLICT')
    else:
        require(current == original, 'INCLUDE_MISSING')
    require(admin.call('PING') == 'PONG', 'ADMIN_AUTH')
    require('valkey_version:7.2.13' in admin.call('INFO', 'server').splitlines(), 'ENGINE_VERSION')
    baseline = {key: admin.call('CONFIG', 'GET', key)
                for key in ('aclfile', 'maxmemory', 'maxmemory-policy', 'appendonly', 'appendfsync')}
    require(baseline['aclfile'] == ['aclfile', ''], 'ACL_MANAGER_CONFLICT')
    if policy_check is not None:
        policy_check(baseline)
    existing_users = admin.call('ACL', 'USERS')
    preserved_users = {u: admin.call('ACL', 'GETUSER', u) for u in existing_users if u != USER}
    default = admin.call('ACL', 'GETUSER', 'default')
    existing = admin.call('ACL', 'GETUSER', USER)
    require(existing is None or matches(existing, password_hash), 'EXISTING_USER_CONFLICT')
    if not apply:
        return {'status': 'READY', 'applied': False, 'existing_user_matches': existing is not None}
    # No other write can occur until all conflicts above have been checked.
    if not backup.exists():
        atomic_write(backup, original, 0, 0, 0o600, absent=True)
    if not os.path.lexists(include):
        atomic_write(include, payload, uid, gid, 0o600, absent=True)
    require(all(read_regular(p, uid, 0o600) == b for p, b in preserved_includes.items()), 'EXTRA_INCLUDE_CHANGED')
    require(read_regular(config, uid, 0o640) == current, 'CONFIG_CHANGED_DURING_PREPARATION')
    if current == original:
        atomic_write(config, updated, uid, gid, 0o640)
    if existing is None:
        require(admin.call('ACL', 'SETUSER', USER, *RULES, last='#' + password_hash) == 'OK', 'ACL_APPLY')
    require(matches(admin.call('ACL', 'GETUSER', USER), password_hash), 'ACL_VERIFY')
    require(default == admin.call('ACL', 'GETUSER', 'default'), 'DEFAULT_CHANGED')
    require(all(admin.call('ACL', 'GETUSER', u) == v for u, v in preserved_users.items()), 'OTHER_USER_CHANGED')
    require(read_regular(SENTINEL_INCLUDE, uid, 0o600) == sentinel_before, 'SENTINEL_INCLUDE_CHANGED')
    require(all(read_regular(p, uid, 0o600) == b for p, b in preserved_includes.items()), 'EXTRA_INCLUDE_CHANGED')
    require(all(value == admin.call('CONFIG', 'GET', key) for key, value in baseline.items()), 'GLOBAL_CHANGED')
    scoped = client(password, USER)
    require(scoped.call('PING') == 'PONG', 'SCOPED_AUTH')
    if scoped_check is None:
        require(isinstance(scoped.call('EVAL', "return redis.call('TIME')", '0'), list), 'SCOPED_LUA')
        for command in [('GET', 'other-consumer:key'), ('SELECT', '1'), ('ACL', 'LIST')]:
            response = admin.call('ACL', 'DRYRUN', USER, *command)
            require(isinstance(response, str) and 'no permissions' in response.lower(), 'DENIAL_VERIFY')
        scoped_result = {'scoped_auth_and_lua': True, 'denial_checks': 3}
    else:
        scoped_result = scoped_check(admin, scoped)
    require(read_regular(config, uid, 0o640) == updated and
            read_regular(include, uid, 0o600) == payload, 'PERSISTENCE_VERIFY')
    return {'status': 'PASS', 'applied': True, 'default_preserved': True,
            'global_policy_preserved': True, **scoped_result, 'persistent_include_verified': True,
            'restart_performed': False, 'data_writes': False,
            'config_before_sha256': expected, 'config_after_sha256': digest(updated)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-config-sha256', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--approval-reference')
    args = parser.parse_args()
    try:
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        require(os.geteuid() == 0 and socket.gethostname() == 'traylinx-db', 'HOST_IDENTITY')
        require(not args.apply or (args.approval_reference and re.fullmatch(
            r'[A-Za-z0-9_.:/-]{1,200}', args.approval_reference)), 'APPROVAL_REQUIRED')
        require(not sys.stdin.isatty(), 'PROTECTED_STDIN_REQUIRED')
        require(CONFIG.lstat().st_gid == pwd.getpwnam('valkey').pw_gid, 'CONFIG_GROUP')
        password = sys.stdin.read(130)
        result = provision(password, args.expected_config_sha256, args.apply)
        result['approval_reference'] = args.approval_reference
        print(json.dumps(result))
        return 0
    except Exception as error:
        print(json.dumps({'status': 'REFUSED', 'reason': str(error) if isinstance(error, Refused)
                          else 'PROVISIONING_FAILED', 'automatic_rollback': False,
                          'reconcile_partial_state': bool(args.apply)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
