"""Stock GNOME smoke with actual widget activation in a private headless session.

The disposable extension copy records actor geometry and activates named buttons.
This exercises real St callbacks, but is NOT a physical pointer/keyboard test.
No production test hooks, Shell Eval, permission changes or host session edits.
"""
import os,json,subprocess,tempfile,time,shutil
from pathlib import Path
from gi.repository import Gio,GLib
repo=Path(__file__).resolve().parents[1];bus=Gio.bus_get_sync(Gio.BusType.SESSION,None);uuid='velapulse@velapulse.local'
def call(name,path,interface,method,sig='()',args=()):return bus.call_sync(name,path,interface,method,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,3000,None).unpack()
def wait(fn,message):
 for _ in range(100):
  try:
   value=fn()
   if value:return value
  except (FileNotFoundError,json.JSONDecodeError,GLib.Error,StopIteration):pass
  time.sleep(.1)
 raise AssertionError(message)
with tempfile.TemporaryDirectory(prefix='vela-gnome-')as temp:
 root=Path(temp);runtime=root/'runtime';runtime.mkdir(mode=0o700);data=root/'data';dest=data/'gnome-shell/extensions'/uuid;dest.parent.mkdir(parents=True);shutil.copytree(repo/'extension',dest)
 env=dict(os.environ,XDG_RUNTIME_DIR=str(runtime),XDG_CONFIG_HOME=str(root/'config'),XDG_DATA_HOME=str(data),XDG_CACHE_HOME=str(root/'cache'),GSETTINGS_BACKEND='keyfile',XDG_CURRENT_DESKTOP='GNOME',XDG_SESSION_TYPE='wayland',GSK_RENDERER='cairo',GNOME_SHELL_SESSION_MODE='user',GIO_USE_VFS='local',GIO_USE_VOLUME_MONITOR='unix',VELAPULSE_ISOLATED_TEST='1',VELAPULSE_TEST_GNOME_LAYOUT=str(root/'layout.json'),VELAPULSE_TEST_CAPTURE=str(root/'capture'),VELAPULSE_TEST_ACTION=str(root/'action'))
 for key in ['DISPLAY','WAYLAND_DISPLAY','GDK_BACKEND']:env.pop(key,None)
 # The test copy has a geometry/screenshot recorder and button activation mailbox.
 source=(dest/'extension.js').read_text();observer="""
 GLib.timeout_add(GLib.PRIORITY_DEFAULT,2000,()=>{Main.overview.hide();return GLib.SOURCE_REMOVE;});
 this._testRecorder=GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,()=>{
  if(!this._root?.get_stage())return GLib.SOURCE_CONTINUE;
  const nodes=[],buttons=[];function visit(actor){if(actor.mapped){const[x,y]=actor.get_transformed_position();const[w,h]=actor.get_transformed_size();nodes.push({x,y,width:w,height:h,classes:actor.get_style_class_name?.()??'',button:actor instanceof St.Button,text:actor instanceof St.Label?actor.text:(actor.label??''),name:actor.accessible_name??''});if(actor instanceof St.Button)buttons.push(actor);}for(const child of actor.get_children())visit(child);}visit(this._root);
  GLib.file_set_contents(GLib.getenv('VELAPULSE_TEST_GNOME_LAYOUT'),JSON.stringify({expanded:this._expanded,selected:this._selected,nodes}));
  const action=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_ACTION'));if(action.query_exists(null)){const[,bytes]=action.load_contents(null);action.delete(null);const name=new TextDecoder().decode(bytes);const button=buttons.find(b=>b.accessible_name===name||b.label===name);if(button)button.emit('clicked',1);}
  const capture=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_CAPTURE'));if(capture.query_exists(null)){const[,bytes]=capture.load_contents(null);capture.delete(null);const path=new TextDecoder().decode(bytes);const output=Gio.File.new_for_path(path).replace(null,false,Gio.FileCreateFlags.NONE,null);new Shell.Screenshot().screenshot(false,output).then(()=>{output.close(null);GLib.file_set_contents(path+'.done','ok');}).catch(logError);}
  return GLib.SOURCE_CONTINUE;
 });
"""
 (dest/'extension.js').write_text("import Shell from 'gi://Shell';\n"+source.replace('    enable() {','    enable() {\n'+observer,1))
 # Private audio tools prevent this test from changing any host output or volume.
 tools=root/'bin';tools.mkdir();audio=root/'audio.json';audio.write_text(json.dumps({'default':'fixture-speakers','volume':.5,'muted':False}))
 for tool in ['pw-dump','wpctl']:(tools/tool).symlink_to(repo/'tests/fixtures/audio_tools.py')
 env.update(PATH=str(tools)+':'+env['PATH'],VELAPULSE_TEST_AUDIO_STATE=str(audio))
 subprocess.run(['gsettings','set','org.gnome.shell','enabled-extensions',"['"+uuid+"']"],env=env,check=True)
 artifacts=repo/'target/phase-1-2';artifacts.mkdir(parents=True,exist_ok=True)
 with (artifacts/'gnome-shell.log').open('w')as log:
  daemon=subprocess.Popen([str(repo/'target/debug/velapulse'),'daemon'],env=dict(env,WAYLAND_DISPLAY='velapulse-gnome-no-native'),stdout=log,stderr=log)
  player=subprocess.Popen(['/usr/bin/python3',str(repo/'tests/mpris_fixture.py')],env=dict(env,VELAPULSE_TEST_ARTWORK=(repo/'tests/fixtures/music-cover.png').as_uri()),stdout=log,stderr=log)
  shell=subprocess.Popen(['gnome-shell','--headless','--wayland','--no-x11','--virtual-monitor','1600x1000','--wayland-display','velapulse-gnome-test'],env=env,stdout=log,stderr=log)
  try:
   def info():
    if shell.poll()is not None:raise RuntimeError('Private GNOME exited')
    return call('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions','GetExtensionInfo','(s)',[uuid])[0]
   wait(lambda:info().get('state')in(1,3),'extension load');assert info()['state']==1,info()
   def layout():return json.loads((root/'layout.json').read_text())
   def activate(name):
    wait(lambda:any(n['button']and(n['name']==name or n['text']==name)for n in layout()['nodes']),'Missing button '+name);(root/'action').write_text(name);wait(lambda:not(root/'action').exists(),'Button action '+name);time.sleep(.3)
   # A fresh headless user session opens Overview. Hide it in the test copy for a clean capture.
   # This is a semantic render/activation smoke, not evidence of external pointer delivery.
   wait(lambda:layout().get('nodes'),'extension actors');time.sleep(2.5);activate('Expand live activity');wait(lambda:layout()['expanded'],'card expansion');activate('Pause')
   def snapshot():return json.loads(call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Snapshot')[0])
   wait(lambda:any(a.get('music')and a['status']=='paused'for a in snapshot()['activities']),'GNOME Pause callback')
   current=next(a for a in snapshot()['activities']if a.get('music'));lrc=root/'original.lrc';lrc.write_text('[00:00]Original GNOME fixture line\n[00:05]Original GNOME active line');call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','ImportLyrics','(sss)',[current['id'],current['music']['track_id'],lrc.as_uri()]);activate('Lyrics');wait(lambda:any(n['text']=='Original GNOME active line'for n in layout()['nodes']),'GNOME local lyrics');activate('Audio output');time.sleep(.4)
   capture=artifacts/'gnome-music-card.png';done=Path(str(capture)+'.done');done.unlink(missing_ok=True);capture.unlink(missing_ok=True);(root/'capture').write_text(str(capture));wait(done.exists,'GNOME capture');activate('Collapse');wait(lambda:not layout()['expanded'],'card collapse')
   errors=call('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions','GetExtensionErrors','(s)',[uuid])[0];assert not errors,errors
   print('PASS stock GNOME 50: extension ACTIVE; real St button activation expands/collapses, pauses fixture playback, opens lyrics/audio; no extension errors. Not a physical input test.')
  finally:
   if(root/'layout.json').exists():(artifacts/'gnome-layout.json').write_text((root/'layout.json').read_text())
   for p in [shell,player,daemon]:
    if p.poll()is None:p.terminate();p.wait(timeout=8)
