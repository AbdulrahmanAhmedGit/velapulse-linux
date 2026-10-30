"""Actual pointer/keyboard regression on a private headless Sway session.

Set VELAPULSE_TEST_COMPOSITOR_ROOT for an extracted (not system-installed) Sway.
No host session, service, configuration, input devices or compositor are modified.
"""
import json,os,shutil,subprocess,tempfile,time
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
root=os.environ.get('VELAPULSE_TEST_COMPOSITOR_ROOT')
sway=str(Path(root)/'usr/bin/sway')if root else shutil.which('sway')
swaymsg=str(Path(root)/'usr/bin/swaymsg')if root else shutil.which('swaymsg')
if not sway or not swaymsg:raise SystemExit('Install Sway in the test environment or set VELAPULSE_TEST_COMPOSITOR_ROOT; no host packages are installed by this test.')
suite=os.environ.get('VELAPULSE_TEST_SUITE','preferences')
music=suite in ['music','native','context','profile']
artifacts=Path(os.environ.get('VELAPULSE_TEST_ARTIFACTS',repo/'target/preferences-input'));artifacts.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='vela-prefs-input-')as directory:
 base=Path(directory);runtime=base/'runtime';runtime.mkdir(mode=0o700);(runtime/'velapulse-test-session').touch()
 cfg=base/'sway.conf';cfg.write_text('output HEADLESS-1 mode 1600x1000 scale '+os.environ.get('VELAPULSE_TEST_SCALE','1')+'\ndefault_border none\ndefault_floating_border none\nseat * hide_cursor 1000\nfor_window [app_id="io.github.velapulse.PreferencesInputTest"] floating enable\n')
 env=dict(os.environ,XDG_RUNTIME_DIR=str(runtime),XDG_CONFIG_HOME=str(base/'config'),XDG_DATA_HOME=str(base/'data'),XDG_CACHE_HOME=str(base/'cache'),VELAPULSE_ISOLATED_TEST='1',GDK_BACKEND='wayland',GSK_RENDERER='cairo',GTK_A11Y='none',GSETTINGS_BACKEND='memory',GIO_USE_VFS='local',GIO_USE_VOLUME_MONITOR='unix')
 # A private URI handler records the About button without opening a host browser.
 apps=base/'data/applications';apps.mkdir(parents=True)
 recorder=base/'record-uri.py';link_log=base/'opened-uri'
 recorder.write_text("import pathlib,sys\npathlib.Path("+repr(str(link_log))+").write_text(sys.argv[1])\n")
 (apps/'velapulse-input-browser.desktop').write_text('[Desktop Entry]\nType=Application\nName=Private input test browser\nExec=/usr/bin/python3 '+str(recorder)+' %u\nMimeType=x-scheme-handler/https;\n')
 (base/'config').mkdir()
 (base/'config/mimeapps.list').write_text('[Default Applications]\nx-scheme-handler/https=velapulse-input-browser.desktop\n')
 hook_settings=base/'claude-fixture.json';hook_settings.write_text(json.dumps({'theme':'keep-me','hooks':{'Stop':[{'hooks':[{'type':'command','command':'existing-hook'}]}]}}));env['VELAPULSE_TEST_HOOK_SETTINGS']=str(hook_settings)
 if suite=='context':
  fixture=json.loads((repo/'tests/fixtures/weather-view.json').read_text());fixture['updated']=int(time.time());fixture['stale']=False;fixture['error']='';fixture['notices']=[]
  for i,h in enumerate(fixture['hours']):h['at']=int(time.time()//3600*3600)+i*3600
  for i,d in enumerate(fixture['days']):d['at']=int(time.time()//86400*86400)+i*86400
  store=base/'data/velapulse';store.mkdir(parents=True);(store/'weather-cache.json').write_text(json.dumps(fixture));(base/'config/velapulse').mkdir();(base/'config/velapulse/config.json').write_text(json.dumps({'weather':{'enabled':True,'location':fixture['location']},'developer':{'codex':True,'claude':True,'codex_notifications':False,'claude_notifications':False,'task_notifications':False}}))
 env['VELAPULSE_TEST_LINK_LOG']=str(link_log)
 env['VELAPULSE_TEST_REPO']=str(repo)
 env['VELAPULSE_TEST_MUSIC_IMAGE']=str(artifacts/'music-card.png')
 if os.environ.get('VELAPULSE_TEST_GRIM'):
  env['VELAPULSE_TEST_GLASS_IMAGE']=str(artifacts/'liquid-glass.png')
 if music:
  tools=base/'bin';tools.mkdir();audio=base/'audio.json';audio.write_text(json.dumps({'default':'fixture-speakers','volume':.5,'muted':False}))
  for tool in ['pw-dump','wpctl']:(tools/tool).symlink_to(repo/'tests/fixtures/audio_tools.py')
  env.update(PATH=str(tools)+':'+env['PATH'],VELAPULSE_TEST_AUDIO_STATE=str(audio))
  lrc=base/'original.lrc';lrc.write_text('[00:00]Original fixture opening\n[00:45]Original fixture chorus\n[01:10]Original fixture ending');env['VELAPULSE_TEST_LRC']=str(lrc)
 compositor_env=dict(env,WLR_BACKENDS='headless',WLR_RENDERER='pixman',WLR_HEADLESS_OUTPUTS='1',WLR_LIBINPUT_NO_DEVICES='1')
 compositor_env.pop('WAYLAND_DISPLAY',None);compositor_env.pop('DISPLAY',None)
 if root:compositor_env['LD_LIBRARY_PATH']=str(Path(root)/'usr/lib/x86_64-linux-gnu')
 processes=[]
 with (artifacts/'compositor.log').open('w')as log:
  compositor=subprocess.Popen([sway,'-c',str(cfg)],env=compositor_env,stdout=log,stderr=log);processes.append(compositor)
  try:
   for _ in range(100):
    sockets=[p for p in runtime.glob('wayland-*')if not p.name.endswith('.lock')];ipc=list(runtime.glob('sway-ipc.*.sock'))
    if sockets and ipc:break
    if compositor.poll()is not None:raise RuntimeError('Private compositor exited; see compositor.log')
    time.sleep(.05)
   else:raise RuntimeError('Private compositor startup timed out')
   env.update(WAYLAND_DISPLAY=sockets[0].name,SWAYSOCK=str(ipc[0]),VELAPULSE_TEST_INPUT=str(repo/'target/debug/examples/test-input'),VELAPULSE_TEST_SWAYMSG=swaymsg)
   # Renderer supervision cannot map a UI in the test compositor: only preferences runs there.
   daemon_env=dict(env,WAYLAND_DISPLAY='velapulse-test-unavailable-display')
   with (artifacts/'daemon.log').open('w')as daemon_log:
    daemon=subprocess.Popen([str(repo/'target/debug/velapulse'),'daemon'],env=daemon_env,stdout=daemon_log,stderr=daemon_log);processes.append(daemon)
    for _ in range(100):
     response=subprocess.run([str(repo/'target/debug/velapulse'),'snapshot'],env=env,capture_output=True,text=True)
     if response.returncode==0:break
     time.sleep(.05)
    else:raise RuntimeError('Private D-Bus service failed to start')
    if music and suite!='context':
     for name in ['VelaPulseFixture','BrowserFixture']:
      player=subprocess.Popen(['/usr/bin/python3',str(repo/'tests/mpris_fixture.py')],env=dict(env,VELAPULSE_TEST_PLAYER=name,VELAPULSE_TEST_ARTWORK=(repo/'tests/fixtures/music-cover.png').as_uri()),stdout=daemon_log,stderr=daemon_log);processes.append(player)
    for mode in ([] if suite in ['native','context','profile'] else ['music'] if music else [os.environ['VELAPULSE_TEST_PREFERENCES_MODE']]if os.environ.get('VELAPULSE_TEST_PREFERENCES_MODE')else ['legacy','standalone','fixed']):
     print('Running real input mode:',mode,flush=True)
     with (artifacts/(mode+'.log')).open('w')as test_log:
      result=subprocess.run(['gjs','-m',str(repo/('tests/music-input.js' if music else 'tests/preferences-input.js')),mode],env=env,stdout=test_log,stderr=subprocess.STDOUT,timeout=240)
     print((artifacts/(mode+'.log')).read_text(),flush=True)
     if result.returncode:raise RuntimeError(mode+' input regression failed')
    if suite=='profile':subprocess.run(['/usr/bin/python3',str(repo/'tests/profile_native.py')],env=env,check=True,timeout=25)
    if music and (suite=='context'or os.environ.get('VELAPULSE_TEST_NATIVE')=='1'):
     subprocess.run(['/usr/bin/python3',str(repo/('tests/context_native.py'if suite=='context'else'tests/native_music.py'))],env=env,check=True,timeout=500 if os.environ.get('VELAPULSE_TEST_LAYOUT_AUDIT')=='1'else 140)
    persisted=json.loads((base/'config/velapulse/config.json').read_text());assert persisted['backend']=='auto'
    daemon.terminate();daemon.wait(timeout=5)
    restarted=subprocess.Popen([str(repo/'target/debug/velapulse'),'daemon'],env=daemon_env,stdout=daemon_log,stderr=daemon_log);processes.append(restarted)
    for _ in range(100):
     response=subprocess.run([str(repo/'target/debug/velapulse'),'snapshot'],env=env,capture_output=True,text=True)
     if response.returncode==0:break
     time.sleep(.05)
    else:raise RuntimeError('Private service restart failed')
    assert json.loads(response.stdout)['config']==persisted,'Settings changed after daemon restart'
    print('PASS private configuration persisted across service restart; host installation untouched',flush=True)
  finally:
   for proc in reversed(processes):
    if proc.poll()is None:
     proc.terminate()
     try:proc.wait(timeout=5)
     except subprocess.TimeoutExpired:proc.kill();proc.wait()
