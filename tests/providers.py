import json,os,subprocess,tempfile,time
from pathlib import Path
from gi.repository import Gio,GLib
bin=os.environ['VELAPULSE_BIN']
def connection():return Gio.DBusConnection.new_for_address_sync(os.environ['DBUS_SESSION_BUS_ADDRESS'],Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT|Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,None,None)
def call(c,m,sig,args):return c.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',m,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,3000,None).unpack()
def snapshot(c):return json.loads(call(c,'Snapshot','()',())[0])['activities']
def wait(fn):
 for _ in range(60):
  try:
   result=fn()
   if result:return result
  except GLib.Error:pass
  time.sleep(.1)
 raise AssertionError('condition timed out')
with tempfile.TemporaryDirectory() as cfg:
 daemon=subprocess.Popen([bin,'daemon'],env=dict(os.environ,XDG_CONFIG_HOME=cfg))
 player=None
 try:
  a,b=connection(),connection()
  wait(lambda:call(a,'Snapshot','()',()))
  key=call(a,'Push','(s)',(json.dumps({'id':'job','title':'Owned activity'}),))[0]
  try:call(b,'Remove','(s)',(key,));raise AssertionError('cross-owner remove allowed')
  except GLib.Error:pass
  call(a,'Push','(s)',(json.dumps({'id':'job','title':'Updated activity'}),))
  assert any(x['id']==key and x['title']=='Updated activity' for x in snapshot(a))
  call(a,'Remove','(s)',(key,))
  assert not any(x['id']==key for x in snapshot(a))
  for i in range(16):call(a,'Push','(s)',(json.dumps({'id':f'q{i}','title':'Quota'}),))
  try:call(a,'Push','(s)',('{"id":"overflow","title":"Overflow"}',));raise AssertionError('quota bypass')
  except GLib.Error:pass
  artwork=Path('extension/assets/orbit.svg').resolve().as_uri()
  player=subprocess.Popen(['/usr/bin/python3','tests/mpris_fixture.py'],env=dict(os.environ,VELAPULSE_TEST_ARTWORK=artwork))
  media=lambda:next((x for x in snapshot(a) if x['id'].startswith('media:')),None)
  track=wait(media)
  assert track['title']=='Fixture track' and track['description']=='Test artist'
  assert track['duration_seconds']==120 and track['position_seconds']>=10
  assert track['source']=='VelaPulseFixture'
  assert track['icon']==artwork
  assert 'Previous' not in track['controls'] and 'Next' in track['controls']
  p=track['progress'];time.sleep(1.2);assert media()['progress']>p
  call(a,'Command','(sst)',(track['id'],'PlayPause',0))
  wait(lambda:media()['status']=='paused')
  try:call(a,'Command','(sst)',(track['id'],'Previous',0));raise AssertionError('unsupported action accepted')
  except GLib.Error:pass
  call(a,'Command','(sst)',(track['id'],'Next',0))
  wait(lambda:media()['title']=='Next fixture track')
  player.terminate();player.wait();player=None
  wait(lambda:media() is None)
  print('PASS: MPRIS discovery, metadata, progress, signals, controls, disconnect; external ownership, update, removal, quotas')
 finally:
  if player:player.terminate();player.wait()
  daemon.terminate();daemon.wait()
