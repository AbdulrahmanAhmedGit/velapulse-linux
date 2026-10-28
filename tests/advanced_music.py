"""End-to-end daemon contracts with two deterministic players and private audio."""
import json,os,subprocess,tempfile,time,statistics
from pathlib import Path
from gi.repository import Gio,GLib
bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
repo=Path(__file__).resolve().parents[1];binary=str(repo/'target/debug/velapulse')
def call(method,sig='()',args=(),ok=True):
 try:
  result=bus.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',method,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,6000,None).unpack()
  assert ok,'unexpected successful '+method;return result
 except GLib.Error:
  if ok:raise
snapshot=lambda:json.loads(call('Snapshot')[0])
def wait(fn):
 for _ in range(80):
  try:
   value=fn()
   if value:return value
  except (GLib.Error,StopIteration,KeyError):pass
  time.sleep(.1)
 raise AssertionError('condition timed out')
metrics={}
def measure(pid,label):
 def cpu():return sum(map(int,Path(f'/proc/{pid}/stat').read_text().split()[13:15]))
 start=cpu();at=time.monotonic();time.sleep(3);elapsed=time.monotonic()-at;lat=[]
 for _ in range(30):t=time.monotonic();snapshot();lat.append((time.monotonic()-t)*1000)
 rss=next(line.split()[1] for line in Path(f'/proc/{pid}/status').read_text().splitlines() if line.startswith('VmRSS:'))
 metrics[label]={'cpu_percent':round((cpu()-start)/os.sysconf('SC_CLK_TCK')/elapsed*100,2),'rss_kib':int(rss),'snapshot_median_ms':round(statistics.median(lat),2),'snapshot_max_ms':round(max(lat),2),'sample_seconds':round(elapsed,2)}
with tempfile.TemporaryDirectory(prefix='vela-music-contract-')as temp:
 root=Path(temp);tools=root/'bin';tools.mkdir();audio=root/'audio.json';audio.write_text(json.dumps({'default':'fixture-speakers','volume':.5,'muted':False}))
 for tool in ['pw-dump','wpctl']:(tools/tool).symlink_to(repo/'tests/fixtures/audio_tools.py')
 env=dict(os.environ,XDG_CONFIG_HOME=temp+'/config',XDG_DATA_HOME=temp+'/data',XDG_CACHE_HOME=temp+'/cache',WAYLAND_DISPLAY='velapulse-no-test-display',VELAPULSE_ISOLATED_TEST='1',VELAPULSE_TEST_AUDIO_STATE=str(audio),PATH=str(tools)+':'+os.environ['PATH'])
 processes=[];daemon=subprocess.Popen([binary,'daemon'],env=env);processes.append(daemon)
 try:
  wait(snapshot);measure(daemon.pid,'idle')
  art=(repo/'tests/fixtures/music-cover.png').as_uri();ids=[]
  for name in ['VelaPulseFixture','BrowserFixture']:
   p=subprocess.Popen(['/usr/bin/python3',str(repo/'tests/mpris_fixture.py')],env=dict(env,VELAPULSE_TEST_PLAYER=name,VELAPULSE_TEST_ARTWORK=art));processes.append(p);ids.append('media:org.mpris.MediaPlayer2.'+name)
  media=lambda:[a for a in snapshot()['activities']if a.get('music')]
  wait(lambda:len(media())==2);a=wait(lambda:next((a for a in media()if a['id']==ids[0] and a['icon'].endswith('.png')),None));assert a['icon']!=art and a['music']['color'].startswith('#')
  call('SelectPlayer','(s)',[ids[0]]);assert media()[0]['id']==ids[0]
  call('Command','(sst)',[ids[0],'PlayPause',0]);wait(lambda:media()[0]['status']=='paused');time.sleep(1.2);pos=media()[0]['position_seconds'];time.sleep(1.1);assert abs(media()[0]['position_seconds']-pos)<.1
  call('Seek','(ssd)',[ids[0],a['music']['track_id'],48.0]);wait(lambda:abs(media()[0]['position_seconds']-48)<1)
  call('Seek','(ssd)',[ids[0],'/stale',20.0],ok=False);call('Seek','(ssd)',[ids[0],a['music']['track_id'],999.0],ok=False);call('Command','(sst)',[ids[0],'Previous',0],ok=False)
  lrc=root/'original.lrc';lrc.write_text('[00:00]Original fixture line\n[00:45.50]Another original line\n[01:00]Final test line')
  call('ImportLyrics','(sss)',[ids[0],a['music']['track_id'],lrc.as_uri()]);assert json.loads(call('Lyrics','(s)',[ids[0]])[0])[1]['seconds']==45.5
  call('ImportLyrics','(sss)',[ids[0],'/stale',lrc.as_uri()],ok=False)
  call('Command','(sst)',[ids[0],'Next',0]);wait(lambda:media()[0]['title']=='Next fixture track');assert json.loads(call('Lyrics','(s)',[ids[0]])[0])==[]
  new=media()[0];call('Seek','(ssd)',[ids[0],a['music']['track_id'],10.0],ok=False)
  # Player-side capability change and unknown duration are real D-Bus properties.
  fixture=Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION,Gio.DBusProxyFlags.NONE,None,ids[0][6:],'/org/mpris/MediaPlayer2','org.velapulse.TestFixture1',None)
  fixture.call_sync('SetSeekable',GLib.Variant('(b)',[False]),Gio.DBusCallFlags.NONE,3000,None);wait(lambda:not media()[0]['music']['can_seek']);call('Seek','(ssd)',[ids[0],new['music']['track_id'],10.0],ok=False)
  fixture.call_sync('SetTrack',GLib.Variant('(sxs)',['Live fixture',0,'https://127.0.0.1/private']),Gio.DBusCallFlags.NONE,3000,None);wait(lambda:media()[0]['title']=='Live fixture');assert media()[0]['duration_seconds'] is None if 'duration_seconds'in media()[0]else True;assert not media()[0]['music']['can_seek']
  history=lambda:json.loads(call('ListeningHistory')[0]);assert not history()['recent'];cfg=snapshot()['config'];cfg['listening_history']=True;call('Configure','(s)',[json.dumps(cfg)]);call('Command','(sst)',[ids[0],'PlayPause',0]);wait(lambda:media()[0]['status']=='active');time.sleep(3.2);assert history()['week_seconds']>1
  measure(daemon.pid,'active_two_players');cfg['listening_history']=False;call('Configure','(s)',[json.dumps(cfg)]);time.sleep(1.1);before=history()['week_seconds'];time.sleep(1.1);assert history()['week_seconds']==before;call('ClearListeningHistory');assert not history()['recent']
  audio_state=json.loads(call('Audio')[0]);assert audio_state['available']and len(audio_state['devices'])==2
  assert json.loads(call('AudioControl','(ss)',['default','43'])[0])['default']=='fixture-headphones'
  assert json.loads(call('AudioControl','(ss)',['volume','0.73'])[0])['volume']==.73
  assert json.loads(call('AudioControl','(ss)',['mute','1'])[0])['muted'];call('AudioControl','(ss)',['default','999'],ok=False);call('AudioControl','(ss)',['volume','nan'],ok=False)
  processes[-1].terminate();processes[-1].wait();wait(lambda:len(media())==1)
  daemon.terminate();daemon.wait();daemon=subprocess.Popen([binary,'daemon'],env=env);processes[0]=daemon;wait(snapshot);assert snapshot()['config']['selected_player']==ids[0]
  print('PASS advanced music: two players, stable selection, pause/seek/stale-track/capabilities, track changes, bounded artwork, LRC, opt-in history, audio commands, disconnect and restart')
  artifacts=repo/'target/phase-1-2';artifacts.mkdir(parents=True,exist_ok=True);(artifacts/'performance.json').write_text(json.dumps(metrics,indent=2));print(json.dumps(metrics))
 finally:
  for p in reversed(processes):
   if p.poll()is None:p.terminate();p.wait(timeout=5)
