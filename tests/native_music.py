"""Exercise the real layer renderer. Instrumentation observes widget geometry only.

The temporary module is the production source plus a private layout recorder;
input travels through Wayland. It never sets a widget's active/value properties.
"""
import json,os,subprocess,tempfile,time
from pathlib import Path
from gi.repository import Gio,GLib
repo=Path(__file__).resolve().parents[1];artifacts=Path(os.environ['VELAPULSE_TEST_ARTIFACTS']);env=dict(os.environ)
if os.environ.get('VELAPULSE_TEST_PROTOCOL_DEBUG'):env['WAYLAND_DEBUG']='1'
base=Path(env['XDG_RUNTIME_DIR']);layout=base/'native-layout.json';env['VELAPULSE_TEST_LAYOUT']=str(layout)
if env.get('VELAPULSE_TEST_COMPOSITOR_ROOT'):
 lib=Path(env['VELAPULSE_TEST_COMPOSITOR_ROOT'])/'usr/lib/x86_64-linux-gnu';env['GI_TYPELIB_PATH']=str(lib/'girepository-1.0');env['LD_LIBRARY_PATH']=str(lib)
env['LD_PRELOAD']='libgtk4-layer-shell.so.0'
driver_env=dict(env);driver_env.pop('LD_PRELOAD',None);driver_env.pop('WAYLAND_DEBUG',None)
assert env.get('VELAPULSE_ISOLATED_TEST')=='1'and(base/'velapulse-test-session').is_file()
source=(repo/'backends/layer-shell.js').read_text();recorder='''
const originalExpand=setExpanded;setExpanded=open=>{print('EXPAND',open);originalExpand(open);};
GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,()=>{
 if(!window?.get_mapped())return GLib.SOURCE_CONTINUE;
 const widgets=[];function visit(w){if(w.get_mapped()){const[ok,b]=w.compute_bounds(window);if(ok)widgets.push({name:w.name,classes:w.get_css_classes(),label:w.label??'',tooltip:w.tooltip_text??'',sensitive:w.is_sensitive(),x:b.origin.x,y:b.origin.y,width:b.size.width,height:b.size.height});}for(let c=w.get_first_child();c;c=c.get_next_sibling())visit(c);}visit(window);
 GLib.file_set_contents(GLib.getenv('VELAPULSE_TEST_LAYOUT'),JSON.stringify({width:window.get_width(),height:window.get_height(),bottom:state.config.position==='bottom',topAnchor:Layer.get_anchor(window,Layer.Edge.TOP),bottomAnchor:Layer.get_anchor(window,Layer.Edge.BOTTOM),expanded,selected,state,widgets}));return GLib.SOURCE_CONTINUE;
});
'''
fd,path=tempfile.mkstemp(prefix='_input-',suffix='.js',dir=repo/'backends');os.close(fd);path=Path(path);path.write_text(source.replace('app.run([]);',recorder+'\napp.run([]);'))
def wait(fn,message):
 for _ in range(100):
  try:
   value=fn()
   if value:return value
  except (FileNotFoundError,json.JSONDecodeError,KeyError,StopIteration):pass
  time.sleep(.05)
 raise AssertionError(message)
def current():return json.loads(layout.read_text())
def widget(name=None,style=None):return next(w for w in current()['widgets']if(w['name']==name if name else style in w['classes'])and w['width']>0 and w['height']>0)
def call(method,sig='()',args=()):return Gio.bus_get_sync(Gio.BusType.SESSION,None).call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',method,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,5000,None).unpack()
def snapshot():return json.loads(call('Snapshot')[0])
with (artifacts/'native-renderer.log').open('w')as log:
 process=subprocess.Popen(['gjs','-m',str(path)],env=env,stdout=log,stderr=log)
 driver=subprocess.Popen([env['VELAPULSE_TEST_INPUT']],env=driver_env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 try:
  assert driver.stdout.readline().strip()=='READY'
  def send(*args):driver.stdin.write(' '.join(map(str,args))+'\n');driver.stdin.flush();assert driver.stdout.readline().strip()=='OK'
  def coordinates(w,fx=.5):
   frame=current();x=(1600-frame['width'])/2+w['x']+w['width']*fx;y=(1000-28-frame['height']if frame['bottom']else 28)+w['y']+w['height']/2;return round(x),round(y)
  def click(w):x,y=coordinates(w);send('click',x,y,1600,1000);time.sleep(.25)
  # GTK may report mapped before the first allocation and async Snapshot reply.
  # Wait for the actual pointer target, not merely a non-empty widget inventory.
  pill=wait(lambda:widget(style='vela-pill-main')if current()['state']['activities']and current()['width']>0 and current()['height']>0 else None,'native pill was not allocated with activity state')
  click(pill);wait(lambda:current()['expanded'],'pill expansion')
  wait(lambda:widget(name='music-player'),'music controls missing');time.sleep(.3)
  cfg=snapshot()['config'];old=cfg['selected_player'];click(widget(name='music-player'));send('key','HOME');send('key','DOWN');send('key','DOWN');send('key','ENTER');wait(lambda:snapshot()['config']['selected_player']!=old,'native player selection');wait(lambda:current()['selected']==snapshot()['config']['selected_player'],'renderer selected player');time.sleep(.45)
  frame=current();a=next(a for a in frame['state']['activities']if a['id']==frame['selected']);status=a['status'];click(widget(name='music-PlayPause'));wait(lambda:next(a for a in snapshot()['activities']if a['id']==current()['selected'])['status']!=status,'native transport')
  # Pause before seeking to make the observed result stable.
  if next(a for a in snapshot()['activities']if a['id']==current()['selected'])['status']=='active':click(widget(name='music-PlayPause'))
  w=widget(name='music-seek');x,y=coordinates(w,.2);end,_=coordinates(w,.65);send('drag',x,y,end,y,1600,1000);wait(lambda:next(a for a in snapshot()['activities']if a['id']==current()['selected'])['position_seconds']>50,'native seek')
  if env.get('VELAPULSE_TEST_GRIM'):subprocess.run([env['VELAPULSE_TEST_GRIM'],str(artifacts/'native-music-card.png')],env=env,check=True)
  send('key','ESC');wait(lambda:not current()['expanded']and current()['height']<100,'Escape collapse')
  if env.get('VELAPULSE_TEST_GRIM'):subprocess.run([env['VELAPULSE_TEST_GRIM'],str(artifacts/'native-pill.png')],env=env,check=True)
  print('PASS production native renderer: mapped layer surface, pill expand, player chooser, transport, seek and Escape collapse',flush=True)
 finally:
  if layout.exists():(artifacts/'native-layout.json').write_text(layout.read_text())
  if env.get('VELAPULSE_TEST_GRIM'):subprocess.run([env['VELAPULSE_TEST_GRIM'],str(artifacts/'native-last.png')],env=env)
  driver.terminate();driver.wait(timeout=5);process.terminate();process.wait(timeout=5);path.unlink(missing_ok=True)
