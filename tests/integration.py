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
        call('configure', '{"backend":"invalid"}', ok=False)
        call('configure', '{"position":"sideways"}', ok=False)
        call('configure', '{"opacity":1}', ok=False)
        call('configure', '{"size":"giant"}', ok=False)
        call('configure', '{"surface":"dock"}', ok=False)
        call('configure', '{"card_size":"huge"}', ok=False)
        call('configure', '{"surface":"panel","card_size":"large"}')
        assert snapshot()['config']['surface'] == 'panel'
        call('push', '{"id":"spoof","title":"Spoof","source":"player"}', ok=False)
        call('run', 'Local build', '--', '/usr/bin/true')
        assert any(a['title']=='Local build' and a['status']=='completed' for a in snapshot()['activities'])
        call('run', 'Failed build', '--', '/usr/bin/false', ok=False)
        assert any(a['title']=='Failed build' and a['status']=='warning' for a in snapshot()['activities'])
        report=json.loads(call('doctor'))
        assert report['service_responsive'] and not report['native_renderer_mapped']
        call('timer','start','30')
        call('stopwatch','pause')
        paused=clock('stopwatch')['description']
        daemon.terminate();daemon.wait(timeout=5)
        time.sleep(1.2)
        daemon=subprocess.Popen([bin,'daemon'],env=env)
        for _ in range(50):
            try:
                if clock('timer')['status']=='active':break
            except (AssertionError,StopIteration):pass
            time.sleep(.1)
        else:raise AssertionError('clocks did not recover after restart')
        assert clock('timer')['description'] < '00:00:30'
        assert clock('stopwatch')['status']=='paused' and clock('stopwatch')['description']==paused
        # A second daemon must fail, not silently queue behind the existing service.
        second = subprocess.run([bin,'daemon'], env=env,capture_output=True,timeout=5)
        assert second.returncode != 0
        print('PASS: timer, pause/resume, completion, reset, stopwatch, expiration, validation, persistence, single-instance')
    finally:
        daemon.terminate()
        daemon.wait(timeout=5)
