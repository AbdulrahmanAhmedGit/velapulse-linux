"""Real isolated D-Bus service tests; no desktop settings changed."""
import json, os, subprocess, tempfile, time
bin = os.environ['VELAPULSE_BIN']
with tempfile.TemporaryDirectory() as config:
    env = dict(os.environ, XDG_CONFIG_HOME=config)
    daemon = subprocess.Popen([bin, 'daemon'], env=env)
    def call(*args, ok=True):
        p = subprocess.run([bin, *args], env=env, capture_output=True, text=True, timeout=5)
        assert (p.returncode == 0) == ok, (args, p.stdout, p.stderr)
        return p.stdout
    def snapshot(): return json.loads(call('snapshot'))
    def clock(name): return next(a for a in snapshot()['activities'] if a['id'] == name)
    try:
        for _ in range(50):
            p = subprocess.run([bin, 'snapshot'], env=env, capture_output=True)
            if p.returncode == 0: break
            time.sleep(.1)
        else: raise AssertionError('service did not start')
        call('timer', 'start', '2')
        assert clock('timer')['status'] == 'active'
        call('timer', 'pause')
        time.sleep(2.1)
        assert clock('timer')['status'] == 'paused'
        call('timer', 'resume')
        time.sleep(2.1)
        assert clock('timer')['status'] == 'completed'
        call('timer', 'reset')
        assert not any(a['id']=='timer' for a in snapshot()['activities'])
        call('stopwatch', 'start')
        time.sleep(1.1)
        call('stopwatch', 'pause')
        value = clock('stopwatch')['description']
        time.sleep(1.1)
        assert clock('stopwatch')['description'] == value
        call('timer', 'start', '0', ok=False)
        call('push', json.dumps({'id':'job','title':'Build','progress':.5,'expires_in':1}))
        assert any(a['title']=='Build' for a in snapshot()['activities'])
        time.sleep(1.1)
        assert not any(a['title']=='Build' for a in snapshot()['activities'])
        call('push', json.dumps({'id':'bad','title':'Bad','controls':['sh']}), ok=False)
        call('push', json.dumps({'id':'bad','title':'x'*300}), ok=False)
        call('configure', json.dumps({'appearance':'light','position':'bottom'}))
        assert snapshot()['config']['appearance']=='light'
        call('configure', '{"autostart":true}')
        assert os.path.exists(os.path.join(config,'autostart/io.github.velapulse.desktop'))
        call('configure', '{"autostart":false}')
        assert not os.path.exists(os.path.join(config,'autostart/io.github.velapulse.desktop'))
        assert os.path.exists(os.path.join(config,'velapulse/config.json'))
        call('configure', '{"position":"sideways"}', ok=False)
        # A second daemon must fail, not silently queue behind the existing service.
        second = subprocess.run([bin,'daemon'], env=env,capture_output=True,timeout=5)
        assert second.returncode != 0
        print('PASS: timer, pause/resume, completion, reset, stopwatch, expiration, validation, persistence, single-instance')
    finally:
        daemon.terminate()
        daemon.wait(timeout=5)
