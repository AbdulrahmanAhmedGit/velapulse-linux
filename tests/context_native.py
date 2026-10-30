"""Exercise the real layer renderer. Instrumentation observes widget geometry only.

The temporary module is the production source plus a private layout recorder;
input travels through Wayland. It never sets a widget's active/value properties.
"""
import json,os,subprocess,tempfile,time,math
from pathlib import Path
from gi.repository import Gio,GLib
repo=Path(__file__).resolve().parents[1];artifacts=Path(os.environ['VELAPULSE_TEST_ARTIFACTS']);env=dict(os.environ)
if os.environ.get('VELAPULSE_TEST_PROTOCOL_DEBUG'):env['WAYLAND_DEBUG']='1'
scale=float(env.get('VELAPULSE_TEST_SCALE','1'));screen_width=round(1600/scale);screen_height=round(1000/scale)
base=Path(env['XDG_RUNTIME_DIR']);layout=base/'native-layout.json';env['VELAPULSE_TEST_LAYOUT']=str(layout);audit_state=base/'layout-audit-state';env['VELAPULSE_TEST_LAYOUT_STATE']=str(audit_state);fixture_state=base/'context-state';env['VELAPULSE_TEST_CONTEXT_STATE']=str(fixture_state)
if env.get('VELAPULSE_TEST_COMPOSITOR_ROOT'):
 lib=Path(env['VELAPULSE_TEST_COMPOSITOR_ROOT'])/'usr/lib/x86_64-linux-gnu';env['GI_TYPELIB_PATH']=str(lib/'girepository-1.0');env['LD_LIBRARY_PATH']=str(lib)
env['LD_PRELOAD']='libgtk4-layer-shell.so.0'
driver_env=dict(env);driver_env.pop('LD_PRELOAD',None);driver_env.pop('WAYLAND_DEBUG',None)
assert env.get('VELAPULSE_ISOLATED_TEST')=='1'and(base/'velapulse-test-session').is_file()
source=(repo/'backends/layer-shell.js').read_text().replace("try {state = JSON.parse(json);} catch {return;}","try {state = JSON.parse(json);} catch {return;}const audit=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_LAYOUT_STATE'));if(audit.query_exists(null)){const spec=JSON.parse(new TextDecoder().decode(audit.load_contents(null)[1]));state=spec.state;root.set_direction(spec.rtl?Gtk.TextDirection.RTL:Gtk.TextDirection.LTR);if(!root._auditCss){root._auditCss=new Gtk.CssProvider();Gtk.StyleContext.add_provider_for_display(root.get_display(),root._auditCss,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION+2);}root._auditCss.load_from_string('.vela-root { font-size:'+spec.font+'px; }');root._auditCase=spec.case;}").replace('try {state = JSON.parse(json);} catch {return;}',"try {state = JSON.parse(json);} catch {return;}const fixture=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_CONTEXT_STATE'));if(fixture.query_exists(null)){const[,data]=fixture.load_contents(null);const mode=new TextDecoder().decode(data);const a=state.activities.find(a=>a.id==='weather');if(a?.weather){if(mode==='empty')delete a.weather;else{a.weather.stale=true;a.weather.error='UI fixture: offline';}}}");recorder='''
let fixtureMode='',auditKey='';
const originalExpand=setExpanded;setExpanded=open=>{print('EXPAND',open);originalExpand(open);};
GLib.timeout_add(GLib.PRIORITY_DEFAULT,100,()=>{
 const f=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_CONTEXT_STATE'));const mode=f.query_exists(null)?new TextDecoder().decode(f.load_contents(null)[1]):'';if(mode!==fixtureMode){fixtureMode=mode;call('Snapshot','()',[],([json])=>render(json));}
 const audit=Gio.File.new_for_path(GLib.getenv('VELAPULSE_TEST_LAYOUT_STATE'));const spec=audit.query_exists(null)?new TextDecoder().decode(audit.load_contents(null)[1]):'';if(spec!==auditKey){auditKey=spec;call('Snapshot','()',[],([json])=>render(json));}
 if(!window?.get_mapped())return GLib.SOURCE_CONTINUE;
 const widgets=[];function visit(w){if(w.get_mapped()){const[ok,b]=w.compute_bounds(window);if(ok)widgets.push({name:w.name,classes:w.get_css_classes(),label:w.label??'',ellipsized:w instanceof Gtk.Label?w.get_layout().is_ellipsized():false,button:w instanceof Gtk.Button,tooltip:w.tooltip_text??'',sensitive:w.is_sensitive(),scroll:w instanceof Gtk.ScrolledWindow?w.get_hadjustment().value:0,x:b.origin.x,y:b.origin.y,width:b.size.width,height:b.size.height});}for(let c=w.get_first_child();c;c=c.get_next_sibling())visit(c);}visit(window);
 GLib.file_set_contents(GLib.getenv('VELAPULSE_TEST_LAYOUT'),JSON.stringify({case:root._auditCase,width:window.get_width(),height:window.get_height(),bottom:state.config.position==='bottom',topAnchor:Layer.get_anchor(window,Layer.Edge.TOP),bottomAnchor:Layer.get_anchor(window,Layer.Edge.BOTTOM),expanded,selected,state,active:window.is_active,focus:window.get_focus()?.name??'',focusLabel:window.get_focus()?.label??'',focusTip:window.get_focus()?.tooltip_text??'',widgets}));return GLib.SOURCE_CONTINUE;
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
  outputs=json.loads(subprocess.check_output([env['VELAPULSE_TEST_SWAYMSG'],'-r','-t','get_outputs'],env=driver_env,text=True));assert outputs[0]['scale']==scale;print('PASS private Sway output scale:',scale,flush=True)
  def send(*args):driver.stdin.write(' '.join(map(str,args))+'\n');driver.stdin.flush();assert driver.stdout.readline().strip()=='OK'
  def coordinates(w,fx=.5):
   frame=current();x=(screen_width-frame['width'])/2+w['x']+w['width']*fx;y=(screen_height-28-frame['height']if frame['bottom']else 28)+w['y']+w['height']/2;return round(x),round(y)
  def click(w):
   time.sleep(.45)
   if w['tooltip']:w=next(n for n in current()['widgets']if n['tooltip']==w['tooltip']and n['y']>=0 and n['y']+n['height']<=current()['height'])
   elif w['label']:w=next(n for n in current()['widgets']if n['button']and n['label']==w['label'])
   elif w['classes']:w=next(n for n in current()['widgets']if w['classes'][0]in n['classes'])
   x,y=coordinates(w);send('click',x,y,screen_width,screen_height);time.sleep(.45)
  # UI-only fixtures: timestamps and agent lifecycle events are synthetic.
  def capture(name):
   time.sleep(.35)
   if env.get('VELAPULSE_TEST_GRIM'):subprocess.run([env['VELAPULSE_TEST_GRIM'],str(artifacts/name)],env=env,check=True)
  def by_label(label):return next(w for w in current()['widgets']if w['button']and w['label']==label and w['height']>0)
  def by_tip(tip):return next(w for w in current()['widgets']if w['tooltip']==tip and w['height']>0 and w['y']>=0 and w['y']+w['height']<=current()['height'])
  def show_weather():
   if not current()['expanded']:click(widget(style='vela-pill-main'));wait(lambda:current()['expanded'],'open card');time.sleep(.5)
   if current()['selected']!='weather':
    if scale!=1:
     tip='Show '+next(a['title']for a in snapshot()['activities']if a['id']=='weather')
     for _ in range(30):
      if current().get('focusTip')==tip:break
      send('key','TAB');time.sleep(.13)
     assert current().get('focusTip')==tip,'Keyboard weather navigation';send('key','SPACE');time.sleep(.5)
    elif current()['selected']!='brief':click(wait(lambda:by_label('Now Brief'),'Now Brief allocation'));wait(lambda:current()['selected']=='brief','overview');time.sleep(.4)
    if scale==1:
     title=next(a['title']for a in snapshot()['activities']if a['id']=='weather');click(by_tip('Show '+title))
    wait(lambda:current()['selected']=='weather','select weather')
   wait(lambda:any('vela-day-row'in w['classes']for w in current()['widgets']),'structured weather rows')
  wait(lambda:any(a['id']=='weather'for a in current()['state']['activities'])and current()['width']>0,'native allocation');show_weather()
  for theme in ['dark','light','glass']:
   cfg=snapshot()['config'];call('Configure','(s)',[json.dumps({**cfg,'appearance':theme})]);wait(lambda:theme==current()['state']['config']['appearance'],'theme');capture('native-weather-'+theme+'.png');assert current()['width']<=screen_width and current()['height']<=screen_height-28,'Card exceeds logical output bounds'
  fixture_state.write_text('offline');wait(lambda:any('Offline ·'in w['label']for w in current()['widgets']),'offline fixture');capture('native-weather-offline-fixture.png')
  fixture_state.write_text('empty');wait(lambda:any(w['label']=='Weather unavailable'for w in current()['widgets']),'empty fixture');capture('native-weather-empty-fixture.png');fixture_state.unlink();wait(lambda:any('vela-day-row'in w['classes']for w in current()['widgets']),'forecast restored')
  # Real focus and keyboard events scroll the GTK forecast viewport.
  hourly=next(w for w in current()['widgets']if'vela-hour-scroll'in w['classes']);click(hourly);send('key','TAB')
  # Clicking a focusable scroll view establishes keyboard focus before Right/End.
  click(hourly);send('key','END');wait(lambda:any(w.get('scroll',0)>0 for w in current()['widgets']),'keyboard horizontal forecast scroll');capture('native-hours-end.png');send('key','HOME');time.sleep(.2)
  bar=next(w for w in current()['widgets']if w['name']=='GtkScrollbar'and 'horizontal'in w['classes']and w['width']>100);x,y=coordinates(bar,.18);end,_=coordinates(bar,.7);send('drag',x,y,end,y,screen_width,screen_height);wait(lambda:any(w.get('scroll',0)>0 for w in current()['widgets']),'pointer horizontal forecast scroll');capture('native-hours-pointer.png');click(hourly);send('key','HOME')
  refresh=by_tip('Refresh');click(refresh);time.sleep(.2);assert current()['expanded'],'refresh collapsed weather'
  capture('native-weather-refreshed.png')
  send('key','ESC');wait(lambda:not current()['expanded'],'keyboard collapse');capture('native-weather-pill.png');click(widget(style='vela-pill-main'));wait(lambda:current()['expanded'],'pointer expand')
  time.sleep(.5)
  if scale!=1:
   for _ in range(24):
    if current().get('focusLabel')=='Now Brief':break
    send('key','TAB');time.sleep(.13)
   assert current().get('focusLabel')=='Now Brief';send('key','SPACE');time.sleep(.4)
  else:click(wait(lambda:by_label('Now Brief'),'Now Brief allocation'));wait(lambda:current()['selected']=='brief','Now Brief pointer');capture('native-brief.png')
  for provider,state in [('codex','running'),('claude','waiting'),('codex','completed'),('codex','failed')]:
   event={'provider':provider,'session':'context-'+provider,'state':state,'title':'Codex'if provider=='codex'else'Claude Code','project':'UI fixture · Desktop project','message':'Review in Claude Code · Tool: Bash'if state=='waiting'else'Checking the desktop build','event_id':provider+'-'+state}
   call('DeveloperEvent','(s)',[json.dumps(event)]);wait(lambda:any(a.get('developer',{}).get('state')==state and a.get('developer',{}).get('provider')==provider for a in snapshot()['activities']),'developer state')
   if current()['selected']!='brief':click(wait(lambda:by_label('Now Brief'),'Now Brief allocation'));wait(lambda:current()['selected']=='brief','return to overview')
   if scale!=1:
    tip='Show '+event['title']
    for _ in range(40):
     if current().get('focusTip')==tip:break
     send('key','TAB');time.sleep(.13)
    assert current().get('focusTip')==tip,'Keyboard agent navigation';time.sleep(.25);click(by_tip(tip))
   else:click(wait(lambda:by_tip('Show '+event['title']),'Agent activity selector'))
   wait(lambda:current()['selected'].startswith('developer:'+provider),'agent selection');wait(lambda:any('vela-agent-state'in w['classes']for w in current()['widgets']),'state badge');capture('native-'+provider+'-'+state+'.png')
   assert not any(w['label']in ['Approve','Reject','Allow']for w in current()['widgets']),'unsafe permission control'
  send('key','ESC');wait(lambda:not current()['expanded'],'agent keyboard collapse')
  if env.get('VELAPULSE_TEST_LAYOUT_AUDIT')=='1':
   from layout_audit import run_layout_audit
   def audit_frame():
    f=current();return {**f,'config':f['state']['config'],'nodes':[{**w,'classes':' '.join(w['classes']),'name':w['tooltip']or w['label']}for w in f['widgets']]}
   def audit_activate(name):click(widget(style='vela-pill-main')if name=='Expand live activity'else by_tip(name))
   def audit_capture(name):
    time.sleep(.3);f=current();x=math.floor((screen_width-f['width'])/2)-8;y=(screen_height-28-f['height']if f['bottom']else 28)-8
    if env.get('VELAPULSE_TEST_GRIM'):subprocess.run([env['VELAPULSE_TEST_GRIM'],'-g',f"{x},{y} {math.ceil(f['width'])+16}x{math.ceil(f['height'])+16}",str(artifacts/name)],env=env,check=True)
   run_layout_audit('gtk',repo,audit_state,audit_frame,audit_activate,lambda k:send('key',k),audit_capture,snapshot()['config'],artifacts)
  print('PASS native structured cards: actual pointer select/refresh/expand/Now Brief, keyboard forecast scroll and Escape; Dark/Light/Glass; synthetic weather and Codex/Claude states',flush=True)

 finally:
  if layout.exists():(artifacts/'native-layout.json').write_text(layout.read_text())
  if env.get('VELAPULSE_TEST_GRIM'):subprocess.run([env['VELAPULSE_TEST_GRIM'],str(artifacts/'native-last.png')],env=env)
  driver.terminate();driver.wait(timeout=5);process.terminate();process.wait(timeout=5);path.unlink(missing_ok=True)
