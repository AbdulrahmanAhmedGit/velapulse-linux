"""Stock GNOME UI acceptance in a private headless session.

The disposable extension copy records actor geometry and activates named buttons.
The default exercises St callbacks. VELAPULSE_TEST_GNOME_INPUT=1 uses an EIS
sender for real pointer/keyboard event delivery, never physical host input.
No production test hooks, Shell Eval, permission changes or host session edits.
"""
import os,json,subprocess,tempfile,time,shutil
from pathlib import Path
from gi.repository import Gio,GLib
repo=Path(__file__).resolve().parents[1];bus=Gio.bus_get_sync(Gio.BusType.SESSION,None);uuid='velapulse@velapulse.local'
def call(name,path,interface,method,sig='()',args=()):return bus.call_sync(name,path,interface,method,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,3000,None).unpack()
def snapshot():return json.loads(call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Snapshot')[0])
def wait(fn,message):
 for _ in range(100):
  try:
   value=fn()
   if value:return value
  except (FileNotFoundError,json.JSONDecodeError,GLib.Error,StopIteration):pass
  time.sleep(.1)
 raise AssertionError(message)
with tempfile.TemporaryDirectory(prefix='vela-gnome-')as temp:
 root=Path(temp);runtime=root/'runtime';runtime.mkdir(mode=0o700);(runtime/'velapulse-test-session').touch();data=root/'data';dest=data/'gnome-shell/extensions'/uuid;dest.parent.mkdir(parents=True);shutil.copytree(repo/'extension',dest)
 env=dict(os.environ,XDG_RUNTIME_DIR=str(runtime),XDG_CONFIG_HOME=str(root/'config'),XDG_DATA_HOME=str(data),XDG_CACHE_HOME=str(root/'cache'),GSETTINGS_BACKEND='keyfile',XDG_CURRENT_DESKTOP='GNOME',XDG_SESSION_TYPE='wayland',GSK_RENDERER='cairo',GNOME_SHELL_SESSION_MODE='user',GIO_USE_VFS='local',GIO_USE_VOLUME_MONITOR='unix',VELAPULSE_ISOLATED_TEST='1',VELAPULSE_TEST_GNOME_LAYOUT=str(root/'layout.json'),VELAPULSE_TEST_CAPTURE=str(root/'capture'),VELAPULSE_TEST_LAYOUT_STATE=str(root/'layout-audit-state'),VELAPULSE_TEST_ACTION=str(root/'action'))
 for key in ['DISPLAY','WAYLAND_DISPLAY','GDK_BACKEND']:env.pop(key,None)
 # The test copy has a geometry/screenshot recorder and button activation mailbox.
 source=(dest/'extension.js').read_text().replace("const activities = this._state.activities;","const audit=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_LAYOUT_STATE'));if(audit.query_exists(null)){const spec=JSON.parse(new TextDecoder().decode(audit.load_contents(null)[1]));this._state=spec.state;this._root.set_text_direction(spec.rtl?Clutter.TextDirection.RTL:Clutter.TextDirection.LTR);this._root.set_style('font-size:'+spec.font+'px;');this._auditCase=spec.case;}const activities = this._state.activities;").replace('const activities = this._state.activities;', "if(this._testOffline){const w=this._state.activities.find(a=>a.id==='weather')?.weather;if(w){w.stale=true;w.error='UI fixture: network unavailable';}}const activities = this._state.activities;");observer="""
 this._inputEvents=[];this._inputTrace=global.stage.connect('captured-event',(_,event)=>{this._inputEvents.push([event.type(),event.get_coords(),[Clutter.EventType.BUTTON_PRESS,Clutter.EventType.BUTTON_RELEASE].includes(event.type())?event.get_button():-1,event.get_flags()]);this._inputEvents=this._inputEvents.slice(-8);return Clutter.EVENT_PROPAGATE;});
 GLib.timeout_add(GLib.PRIORITY_DEFAULT,2000,()=>{Main.overview.hide();return GLib.SOURCE_REMOVE;});
 this._testRecorder=GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,()=>{
  if(!this._root?.get_stage())return GLib.SOURCE_CONTINUE;
  const audit=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_LAYOUT_STATE'));const spec=audit.query_exists(null)?new TextDecoder().decode(audit.load_contents(null)[1]):'';if(spec!==this._auditKey){this._auditKey=spec;this._update(JSON.stringify(this._state));}
  const nodes=[],buttons=[];function visit(actor){if(actor.mapped){const[x,y]=actor.get_transformed_position();const[w,h]=actor.get_transformed_size();nodes.push({x,y,width:w,height:h,classes:actor.get_style_class_name?.()??'',scroll:actor instanceof St.ScrollView?actor.hadjustment.value:null,ellipsized:actor instanceof St.Label?actor.clutter_text.get_layout().is_ellipsized():false,button:actor instanceof St.Button,text:actor instanceof St.Label?actor.text:(actor.label??''),name:actor.accessible_name??''});if(actor instanceof St.Button)buttons.push(actor);}for(const child of actor.get_children())visit(child);}visit(this._root);if(this._panel)visit(this._pill);
  GLib.file_set_contents(GLib.getenv('VELAPULSE_TEST_GNOME_LAYOUT'),JSON.stringify({case:this._auditCase,config:this._state.config,viewport:{x:this._cardScroll.get_transformed_position()[0],y:this._cardScroll.get_transformed_position()[1],width:this._cardScroll.width,height:this._cardScroll.height},focus:global.stage.get_key_focus()?.accessible_name??'',inputEvents:this._inputEvents,pick:global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,...global.get_pointer().slice(0,2))?.accessible_name??'',pointer:global.get_pointer().slice(0,2),expanded:this._expanded,selected:this._selected,nodes,cardAlpha:this._card.get_theme_node().get_background_color().alpha}));
  const action=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_ACTION'));if(action.query_exists(null)){const[,bytes]=action.load_contents(null);action.delete(null);const name=new TextDecoder().decode(bytes);if(name==='fixture:offline'||name==='fixture:online'){this._testOffline=name==='fixture:offline';this._update(JSON.stringify(this._state));}const button=buttons.find(b=>b.accessible_name===name||b.label===name);if(button)button.emit('clicked',1);}
  const capture=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_CAPTURE'));if(capture.query_exists(null)){const[,bytes]=capture.load_contents(null);capture.delete(null);const path=new TextDecoder().decode(bytes);const output=Gio.File.new_for_path(path).replace(null,false,Gio.FileCreateFlags.NONE,null);(path.includes('-preview')?new Shell.Screenshot().screenshot_area(Math.floor(this._root.x)-8,Math.floor(this._root.y)-8,Math.ceil(this._root.width)+16,Math.ceil(this._root.height)+16,output):new Shell.Screenshot().screenshot(false,output)).then(()=>{output.close(null);GLib.file_set_contents(path+'.done','ok');}).catch(logError);}
  return GLib.SOURCE_CONTINUE;
 });
"""
 (dest/'extension.js').write_text("import Shell from 'gi://Shell';\n"+source.replace('    enable() {','    enable() {\n'+observer,1).replace('    disable() {','    disable() {\nif(this._inputTrace)global.stage.disconnect(this._inputTrace);',1))
 # Private audio tools prevent this test from changing any host output or volume.
 tools=root/'bin';tools.mkdir();audio=root/'audio.json';audio.write_text(json.dumps({'default':'fixture-speakers','volume':.5,'muted':False}))
 for tool in ['pw-dump','wpctl']:(tools/tool).symlink_to(repo/'tests/fixtures/audio_tools.py')
 env.update(PATH=str(tools)+':'+env['PATH'],VELAPULSE_TEST_AUDIO_STATE=str(audio))
 subprocess.run(['gsettings','set','org.gnome.shell','enabled-extensions',"['"+uuid+"']"],env=env,check=True)
 if os.environ.get('VELAPULSE_TEST_GNOME_SCALE'):
  subprocess.run(['gsettings','set','org.gnome.mutter','experimental-features',"['scale-monitor-framebuffer']"],env=env,check=True)
 artifacts=repo/'target/phase-1-2';artifacts.mkdir(parents=True,exist_ok=True)
 if os.environ.get('VELAPULSE_TEST_PHASE34')=='1':
  cached=json.loads((repo/'target/phase-3-4/live-weather.json').read_text());(data/'velapulse').mkdir(parents=True,exist_ok=True);(data/'velapulse/weather-cache.json').write_text(json.dumps(cached));config=root/'config/velapulse';config.mkdir(parents=True);(config/'config.json').write_text(json.dumps({'weather':{'enabled':True,'location':cached['location']},'developer':{'claude':True,'codex':True,'claude_notifications':False,'codex_notifications':False}}))
 with (artifacts/'gnome-shell.log').open('w')as log:
  daemon=subprocess.Popen([str(repo/'target/debug/velapulse'),'daemon'],env=dict(env,WAYLAND_DISPLAY='velapulse-gnome-no-native'),stdout=log,stderr=log)
  player=subprocess.Popen(['/usr/bin/python3',str(repo/'tests/mpris_fixture.py')],env=dict(env,VELAPULSE_TEST_ARTWORK=(repo/'tests/fixtures/music-cover.png').as_uri()),stdout=log,stderr=log)
  shell=subprocess.Popen(['gnome-shell','--headless','--wayland','--no-x11','--virtual-monitor',os.environ.get('VELAPULSE_TEST_GNOME_RESOLUTION','1600x1000'),'--wayland-display','velapulse-gnome-test'],env=env,stdout=log,stderr=log)
  try:
   def info():
    if shell.poll()is not None:raise RuntimeError('Private GNOME exited')
    return call('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions','GetExtensionInfo','(s)',[uuid])[0]
   wait(lambda:info().get('state')in(1,3),'extension load');assert info()['state']==1,info()
   if os.environ.get('VELAPULSE_TEST_GNOME_SCALE'):
    scale=float(os.environ['VELAPULSE_TEST_GNOME_SCALE']);serial,monitors,logical,properties=call('org.gnome.Mutter.DisplayConfig','/org/gnome/Mutter/DisplayConfig','org.gnome.Mutter.DisplayConfig','GetCurrentState')
    monitor=monitors[0];mode=next(m for m in monitor[1]if m[-1].get('is-current'));assert scale in mode[5],('unsupported scale',mode[5])
    call('org.gnome.Mutter.DisplayConfig','/org/gnome/Mutter/DisplayConfig','org.gnome.Mutter.DisplayConfig','ApplyMonitorsConfig','(uua(iiduba(ssa{sv}))a{sv})',[serial,1,[(0,0,scale,0,True,[(monitor[0][0],mode[0],{})])],{'layout-mode':GLib.Variant('u',1)}]);time.sleep(.8)
    actual=call('org.gnome.Mutter.DisplayConfig','/org/gnome/Mutter/DisplayConfig','org.gnome.Mutter.DisplayConfig','GetCurrentState')[2][0][2];assert actual==scale;print('PASS private stock GNOME logical output scale:',actual)
   def layout():return json.loads((root/'layout.json').read_text())
   def activate(name):
    wait(lambda:any((n['button']or name=='Hourly forecast')and(n['name']==name or n['text']==name)for n in layout()['nodes']),'Missing button '+name);(root/'action').write_text(name);wait(lambda:not(root/'action').exists(),'Button action '+name);time.sleep(.3)
   if os.environ.get('VELAPULSE_TEST_GNOME_INPUT')=='1':
    assert call('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetConnectionUnixProcessID','(s)',['org.gnome.Mutter.RemoteDesktop'])[0]==shell.pid,'Input must target the private GNOME process'
    rd=call('org.gnome.Mutter.RemoteDesktop','/org/gnome/Mutter/RemoteDesktop','org.gnome.Mutter.RemoteDesktop','CreateSession')[0]
    call('org.gnome.Mutter.RemoteDesktop',rd,'org.gnome.Mutter.RemoteDesktop.Session','Start')
    reply,fdlist=bus.call_with_unix_fd_list_sync('org.gnome.Mutter.RemoteDesktop',rd,'org.gnome.Mutter.RemoteDesktop.Session','ConnectToEIS',GLib.Variant('(a{sv})',[{}]),None,Gio.DBusCallFlags.NONE,3000,None,None);fd=fdlist.get(reply.unpack()[0])
    driver=subprocess.Popen([str(repo/'target/gnome-input'),str(fd)],env=env,pass_fds=[fd],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True);os.close(fd);assert driver.stdout.readline().strip()=='READY','GNOME EIS sender handshake'
    def input_event(method,*args):
     if method=='NotifyPointerMotion':line='motion '+str(args[0])+' '+str(args[1])
     elif method=='Scroll':line='scroll '+str(args[0])+' '+str(args[1])
     elif method=='NotifyPointerButton':line='button '+str(args[0])+' '+str(args[1])
     else:line='key '+str({65307:1,65289:15,65360:102,65367:107,65363:106}[args[0]])+' '+str(args[1])
     driver.stdin.write(line+'\n');driver.stdin.flush();assert driver.stdout.readline().strip()=='OK','GNOME input delivery'
    input_event('NotifyPointerMotion',100,100);time.sleep(.2);input_event('NotifyPointerButton',272,1);input_event('NotifyPointerButton',272,0);time.sleep(.4)
    def pointer_activate(name):
     def target_node():return next((n for n in layout()['nodes']if (n['button']or name=='Hourly forecast')and(n['name']==name or n['text']==name)and(n.get('width')or 0)>0 and(n.get('height')or 0)>0),None)
     def move(x,y):
      for attempt in range(4):
       px,py=layout()['pointer'];input_event('NotifyPointerMotion',x-px,y-py);time.sleep(.15)
       if abs(layout()['pointer'][0]-x)<2 and abs(layout()['pointer'][1]-y)<2:break
     target=wait(target_node,'pointer target '+name);time.sleep(.2);target=target_node()
     for attempt in range(8):
      if not layout()['expanded']or name=='Expand live activity':break
      v=layout()['viewport'];below=target['y']+target['height']>v['y']+v['height'];above=target['y']<v['y']
      if not below and not above:break
      move(v['x']+v['width']-16,v['y']+v['height']/2);input_event('Scroll',0,220 if below else -220);time.sleep(.3);target=target_node()
     x=target['x']+target['width']/2;y=target['y']+target['height']/2;move(x,y);input_event('NotifyPointerButton',272,1);time.sleep(.05);input_event('NotifyPointerButton',272,0);time.sleep(.4)
    # Subsequent activation helpers use genuine Mutter input delivery, not emit().
    activate=pointer_activate
   # A fresh headless user session opens Overview. Hide it in the test copy for a clean capture.
   # EIS mode uses real input; the default mode uses semantic callback activation.
   wait(lambda:layout().get('nodes'),'extension actors');time.sleep(2.5);activate('Expand live activity');wait(lambda:layout()['expanded'],'card expansion');activate('Pause')
   call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Configure','(s)',[json.dumps({**snapshot()['config'],'appearance':'glass'})]);wait(lambda:any('vela-glass' in n['classes']for n in layout()['nodes'])and 0<layout()['cardAlpha']<200,'translucent glass card')
   def snapshot():return json.loads(call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Snapshot')[0])
   wait(lambda:any(a.get('music')and a['status']=='paused'for a in snapshot()['activities']),'GNOME Pause callback')
   current=next(a for a in snapshot()['activities']if a.get('music'));lrc=root/'original.lrc';lrc.write_text('[00:00]Original GNOME fixture line\n[00:05]Original GNOME active line');call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','ImportLyrics','(sss)',[current['id'],current['music']['track_id'],lrc.as_uri()]);activate('Lyrics');wait(lambda:any(n['text']=='Original GNOME active line'for n in layout()['nodes']),'GNOME local lyrics');activate('Audio output');time.sleep(.4)
   capture=artifacts/'gnome-glass-music-card.png';done=Path(str(capture)+'.done');done.unlink(missing_ok=True);capture.unlink(missing_ok=True);(root/'capture').write_text(str(capture));wait(done.exists,'GNOME capture');activate('Collapse');wait(lambda:not layout()['expanded'],'card collapse')
   call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Configure','(s)',[json.dumps({**snapshot()['config'],'appearance':'dark'})]);wait(lambda:layout()['cardAlpha']==255,'dark card restored')
   print('PASS card appearance: Liquid Glass has a translucent background; Dark restores an opaque background.')
   if os.environ.get('VELAPULSE_TEST_PHASE34')=='1':
    def capture_context(name):
     path=repo/'target/phase-3-4'/(name.replace('.png','-125.png')if os.environ.get('VELAPULSE_TEST_GNOME_SCALE')else name);done=Path(str(path)+'.done');done.unlink(missing_ok=True);path.unlink(missing_ok=True);(root/'capture').write_text(str(path));wait(done.exists,'context screenshot')
    call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Configure','(s)',[json.dumps({**snapshot()['config'],'appearance':'glass'})]);activate('Expand live activity')
    weather=next(a for a in snapshot()['activities']if a['id']=='weather');activate('Show '+weather['title']);wait(lambda:any('Next hours'in n['text']for n in layout()['nodes']),'weather forecast content');capture_context('gnome-weather.png');
    if os.environ.get('VELAPULSE_TEST_GNOME_INPUT')=='1':
     activate('Hourly forecast');input_event('NotifyKeyboardKeysym',65367,1);input_event('NotifyKeyboardKeysym',65367,0);wait(lambda:any((n.get('scroll')or 0)>0 for n in layout()['nodes']if'vela-hour-scroll'in n['classes']),'real GNOME hourly keyboard scroll');capture_context('gnome-hours-end.png');input_event('NotifyKeyboardKeysym',65360,1);input_event('NotifyKeyboardKeysym',65360,0)
     input_event('NotifyKeyboardKeysym',65307,1);input_event('NotifyKeyboardKeysym',65307,0);wait(lambda:not layout()['expanded'],'real GNOME Escape collapse');activate('Expand live activity')
    activate('Collapse activity');capture_context('gnome-weather-pill.png');activate('Expand live activity')
    for theme in ['dark','light']:
     call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Configure','(s)',[json.dumps({**snapshot()['config'],'appearance':theme})]);time.sleep(.5);capture_context('gnome-weather-'+theme+'.png')
     if theme=='dark'and not os.environ.get('VELAPULSE_TEST_GNOME_SCALE'):capture_context('gnome-weather-preview.png')
    (root/'action').write_text('fixture:offline');wait(lambda:any('Offline ·'in n['text']for n in layout()['nodes']),'offline banner');capture_context('gnome-weather-offline-fixture.png')
    activate('Now Brief');wait(lambda:layout()['selected']=='brief','overview before agent');event={'provider':'claude','session':'ui-fixture','state':'waiting','title':'Claude Code','project':'UI fixture · Example project','message':'Return to Claude Code to review · Tool: Bash','event_id':'ui-permission'};call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','DeveloperEvent','(s)',[json.dumps(event)]);wait(lambda:any(a.get('developer')for a in snapshot()['activities']),'developer UI event');activate('Show Claude Code');wait(lambda:any('Return to the original agent'in n['text']for n in layout()['nodes']),'permission return guidance');capture_context('gnome-developer.png')
    activate('Now Brief');wait(lambda:layout()['selected']=='brief','Now Brief selection');wait(lambda:any('Today:'in n['text']for n in layout()['nodes']),'Now Brief forecast');capture_context('gnome-brief.png')
    event={'provider':'codex','session':'ui-codex-fixture','state':'running','title':'Codex','project':'UI fixture · Desktop project','message':'Checking desktop components','event_id':'codex-running'};call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','DeveloperEvent','(s)',[json.dumps(event)]);activate('Show Codex');wait(lambda:any('Running'==n['text']for n in layout()['nodes']),'Codex running badge');capture_context('gnome-codex-running-fixture.png');activate('Collapse activity');capture_context('gnome-codex-pill-fixture.png');print('PASS stock GNOME Phase 3/4 weather, attention card and Now Brief content/actions/screenshots; cached live API data and synthetic agent UI event.')
   if os.environ.get('VELAPULSE_TEST_LAYOUT_AUDIT')=='1':
    from layout_audit import run_layout_audit
    (root/'action').write_text('fixture:online');wait(lambda:not(root/'action').exists(),'clear offline UI fixture')
    def audit_key(key):
     symbol={'ESC':65307,'TAB':65289}[key];input_event('NotifyKeyboardKeysym',symbol,1);input_event('NotifyKeyboardKeysym',symbol,0)
    def audit_capture(name):
     path=Path(os.environ['VELAPULSE_TEST_ARTIFACTS'])/name;path.parent.mkdir(parents=True,exist_ok=True);done=Path(str(path)+'.done');done.unlink(missing_ok=True);(root/'capture').write_text(str(path));wait(done.exists,'layout screenshot')
    run_layout_audit('gnome',repo,root/'layout-audit-state',layout,activate,audit_key,audit_capture,snapshot()['config'],Path(os.environ['VELAPULSE_TEST_ARTIFACTS']))
   if os.environ.get('VELAPULSE_TEST_REAL_CODEX_UI')=='1':
    activate('Expand live activity');activate('Now Brief');wait(lambda:layout()['selected']=='brief','overview for real Codex')
    with (repo/'target/phase-3-4/real-codex-ui.log').open('w')as agent_log:
     real=subprocess.Popen([str(repo/'target/debug/velapulse'),'codex','Codex UI check','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','Reply only OK. Do not use tools.'],env=env,cwd=root,stdout=agent_log,stderr=subprocess.STDOUT)
     try:
      wait(lambda:any(a['title']=='Codex UI check'for a in snapshot()['activities']),'real Codex lifecycle');activate('Show Codex UI check');wait(lambda:layout()['selected'].startswith('developer:codex:'),'real Codex UI selection');capture_context('gnome-real-codex.png');result=real.wait(timeout=90);assert result==0,'Real Codex execution failed';wait(lambda:any(a['title']=='Codex UI check'and a['developer']['state']=='completed'for a in snapshot()['activities']),'real Codex completed');time.sleep(.3);capture_context('gnome-real-codex-completed.png');print('PASS real Codex CLI execution and completed card capture')
     finally:
      if real.poll()is None:real.terminate();real.wait(timeout=5)
   if os.environ.get('VELAPULSE_TEST_GNOME_INPUT')=='1':print('PASS GNOME real EIS pointer: expand, transport, forecast selection, Now Brief and agent selection; keyboard forecast scroll/Home/End and Escape. No widget activation calls in this mode.')
   errors=call('org.gnome.Shell','/org/gnome/Shell','org.gnome.Shell.Extensions','GetExtensionErrors','(s)',[uuid])[0];assert not errors,errors
   print('PASS stock GNOME 50: extension ACTIVE; expands/collapses, pauses fixture playback, opens lyrics/audio; no extension errors. Input mode: '+('EIS event delivery'if os.environ.get('VELAPULSE_TEST_GNOME_INPUT')=='1'else'widget callback activation'))
  finally:
   if(root/'layout.json').exists():(artifacts/'gnome-layout.json').write_text((root/'layout.json').read_text())
   if 'driver'in locals()and driver.poll()is None:driver.terminate();driver.wait(timeout=5)
   for p in [shell,player,daemon]:
    if p.poll()is None:p.terminate();p.wait(timeout=8)
