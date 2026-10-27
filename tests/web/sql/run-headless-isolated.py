#!/usr/bin/env python3
"""One isolated headless journey. Existing local PG/Redis only, no TCP listeners."""
import os,pathlib,shutil,subprocess,tempfile,signal
root=pathlib.Path(__file__).resolve().parents[3]
bin=pathlib.Path(os.environ['PG_BIN'])
tmp=pathlib.Path(tempfile.mkdtemp(prefix='web-headless-'))
started=False
try:
    subprocess.run([bin/'initdb','-D',tmp/'data','--no-locale','-A','trust'],check=True,timeout=30,stdout=subprocess.DEVNULL)
    subprocess.run([bin/'pg_ctl','-D',tmp/'data','-l',tmp/'pg.log','-o',f"-k {tmp} -h '' -p 55439 -c shared_buffers=16MB -c max_connections=10 -c statement_timeout=5000",'-w','start'],check=True,timeout=30)
    started=True
    for migration in sorted((root/'deploy/web').glob('00*.sql')):
        subprocess.run([bin/'psql','-h',tmp,'-p','55439','-d','postgres','-v','ON_ERROR_STOP=1','-f',migration],check=True,timeout=15,stdout=subprocess.DEVNULL)
    child = subprocess.Popen(['node',root/'tests/web/sql/headless-journey.cjs'],env={**os.environ,'WEB_TEST_PG_SOCKET':str(tmp)},start_new_session=True)
    try:
        code = child.wait(timeout=45)
        if code:
            raise subprocess.CalledProcessError(code, child.args)
    finally:
        # Owned process group includes Redis if Node crashes/times out.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()
finally:
    if started:
        subprocess.run([bin/'pg_ctl','-D',tmp/'data','-m','fast','-w','stop'],check=True,timeout=20)
    shutil.rmtree(tmp)
