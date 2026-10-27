#!/usr/bin/env python3
"""Small, local, credential-free SQL contract test. Requires existing PostgreSQL.
No network listener; owned temporary cluster is stopped and removed on exit.
Usage: PG_BIN=/path/to/postgresql/bin python3 tests/web/sql/run-isolated.py
"""
import os
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
bin_dir = pathlib.Path(os.environ['PG_BIN'])
tmp = pathlib.Path(tempfile.mkdtemp(prefix='read-admission-'))
started = False

def run(args):
    return subprocess.run([str(a) for a in args], check=True, timeout=30)

try:
    run([bin_dir/'initdb', '-D', tmp/'data', '--no-locale', '-A', 'trust'])
    run([bin_dir/'pg_ctl', '-D', tmp/'data', '-l', tmp/'server.log', '-o',
         f"-k {tmp} -h '' -p 55439 -c shared_buffers=16MB -c max_connections=10 -c statement_timeout=5000", '-w', 'start'])
    started = True
    psql = [bin_dir/'psql', '-h', tmp, '-p', '55439', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    run(psql + ['-f', root/'deploy/web/001_admission.sql'])
    run(psql + ['-f', root/'tests/web/sql/admission.sql'])
    run(psql + ['-c', "INSERT INTO web_read.confirmations VALUES ('concurrent','p1',false)"])
    command = "SELECT * FROM web_read.admit('p1',repeat('a',64),'owner','concurrent','concurrent-key','candidate-{}')"
    workers = [subprocess.Popen([str(a) for a in psql + ['-c', command.format(i)]]) for i in range(4)]
    for worker in workers:
        try:
            assert worker.wait(timeout=15) == 0
        except BaseException:
            for process in workers:
                if process.poll() is None:
                    process.kill()
                process.wait()
            raise
    run(psql + ['-c', """DO $$ BEGIN
      IF (SELECT count(*) FROM web_read.runs WHERE confirmation_id='concurrent') <> 1 OR
         (SELECT count(*) FROM web_read.outbox) <> 2 THEN
        RAISE EXCEPTION 'concurrent duplicate'; END IF;
    END $$"""])
    run(psql + ['-f', root/'deploy/web/002_worker.sql'])
    run(psql + ['-f', root/'tests/web/sql/worker.sql'])
    run(psql + ['-f', root/'deploy/web/003_dispatch.sql'])
    run(psql + ['-f', root/'tests/web/sql/dispatch.sql'])
    run(psql + ['-f', root/'deploy/web/004_result_publication.sql'])
    run(psql + ['-f', root/'tests/web/sql/results.sql'])
    run(psql + ['-f', root/'deploy/web/005_runtime_roles.sql'])
    run(psql + ['-f', root/'tests/web/sql/roles.sql'])
    print('ISOLATED_POSTGRES_ADMISSION_WORKER_DISPATCH_RESULTS_ROLES_PASS', flush=True)
finally:
    if started:
        run([bin_dir/'pg_ctl', '-D', tmp/'data', '-m', 'fast', '-w', 'stop'])
    shutil.rmtree(tmp)
