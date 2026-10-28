#!/usr/bin/env python3
"""Render the dedicated browser nonce ACL; no server mutation or secret generation.

Password arrives only on stdin. Output contains its hash and must go directly to
a protected operator file, never logs. Default output is a nonsecret policy summary.
"""
import argparse
import hashlib
import json
import re
import sys

USER = 'browser-nonces-v1'
# Runtime uses SET NX PX. Ioredis performs INFO readiness and PING connectivity.
# No GET/DEL/EVAL/CONFIG/ACL/SELECT, no pubsub or access to other consumer keys.
RULES = ['reset', 'on', 'sanitize-payload', 'resetchannels',
         '~browser-v1:nonce:*', '+ping', '+info', '+set']


def render(password):
    if not isinstance(password, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43,128}', password):
        raise ValueError('Invalid protected password input')
    return 'user ' + USER + ' ' + ' '.join(RULES) + ' #' + hashlib.sha256(password.encode()).hexdigest() + '\n'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--protected-acl-output', action='store_true')
    args = parser.parse_args()
    if not args.protected_acl_output:
        print(json.dumps({'user': USER, 'rules': RULES, 'requires': {
            'maxmemory-policy': 'noeviction', 'appendonly': 'yes'}, 'applied': False}))
    else:
        if sys.stdin.isatty() or sys.stdout.isatty():
            parser.error('Protected piped input and output required')
        try:
            # Bounded and exact input; never accept an unbounded stream or log it.
            data = sys.stdin.read(130)
            print(render(data.removesuffix('\n')), end='')
        except ValueError:
            parser.error('Invalid protected password input')
