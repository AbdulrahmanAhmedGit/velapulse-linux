"""Optional real mpv + distribution mpv-mpris check on a private bus, with null audio."""
import json,os,subprocess,tempfile,time,wave
from pathlib import Path
from gi.repository import Gio,GLib
repo=Path(__file__).resolve().parents[1];plugin=Path(os.environ['VELAPULSE_TEST_MPV_MPRIS']);bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
def call(method,sig='()',args=()):return bus.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',method,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,6000,None).unpack()
def media():return next(a for a in json.loads(call('Snapshot')[0])['activities']if a['id'].startswith('media:org.mpris.MediaPlayer2.mpv'))
def wait(fn):
 for _ in range(100):
  try:
   v=fn()
   if v:return v
  except (GLib.Error,StopIteration):pass
  time.sleep(.1)
 raise AssertionError('real player condition timed out')
with tempfile.TemporaryDirectory(prefix='vela-real-player-')as directory:
 root=Path(directory);sound=root/'VelaPulse-real-player.wav'
 with wave.open(str(sound),'wb')as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*8000*90)
 env=dict(os.environ,XDG_CONFIG_HOME=str(root/'config'),XDG_DATA_HOME=str(root/'data'),XDG_CACHE_HOME=str(root/'cache'),WAYLAND_DISPLAY='velapulse-real-test-no-display')
 with (repo/'target/phase-1-2/real-player.log').open('w')as log:
  daemon=subprocess.Popen([str(repo/'target/debug/velapulse'),'daemon'],env=env,stdout=log,stderr=log)
  player=subprocess.Popen(['mpv','--no-config','--no-terminal','--ao=null','--vo=null','--script='+str(plugin),str(sound)],env=env,stdout=log,stderr=log)
  try:
   a=wait(media);assert 89<a['duration_seconds']<91 and a['music']['can_seek'];call('Command','(sst)',[a['id'],'PlayPause',0]);wait(lambda:media()['status']=='paused');call('Seek','(ssd)',[a['id'],a['music']['track_id'],30.0]);wait(lambda:abs(media()['position_seconds']-30)<1);call('Command','(sst)',[a['id'],'PlayPause',0]);wait(lambda:media()['status']=='active');time.sleep(1.2);assert media()['position_seconds']>30
   player.terminate();player.wait();wait(lambda:not any(a['id'].startswith('media:org.mpris.MediaPlayer2.mpv')for a in json.loads(call('Snapshot')[0])['activities']))
   print('PASS real mpv with distribution mpv-mpris: discovery, duration, capability, pause, seek, resume, progress and removal; null audio output')
  finally:
   if player.poll()is None:player.terminate();player.wait()
   daemon.terminate();daemon.wait()
