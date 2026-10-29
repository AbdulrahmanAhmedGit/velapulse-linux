"""Private bus/data integration: no active installation or external config changes."""
import os,json,subprocess,tempfile,time,sys,importlib.util,statistics
from pathlib import Path
from gi.repository import Gio,GLib
repo=Path(__file__).resolve().parents[1];artifacts=repo/'target/phase-3-4';artifacts.mkdir(exist_ok=True)
bus=Gio.bus_get_sync(Gio.BusType.SESSION,None)
def call(method,sig='()',args=()):return bus.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',method,GLib.Variant(sig,args),None,Gio.DBusCallFlags.NONE,20000,None).unpack()
def snapshot():return json.loads(call('Snapshot')[0])
def wait(fn,message):
 for _ in range(160):
  try:
   v=fn()
   if v:return v
  except (GLib.Error,StopIteration):pass
  time.sleep(.1)
 raise AssertionError(message)
with tempfile.TemporaryDirectory(prefix='vela-phase34-')as directory:
 base=Path(directory);env=dict(os.environ,XDG_CONFIG_HOME=str(base/'config'),XDG_DATA_HOME=str(base/'data'),XDG_CACHE_HOME=str(base/'cache'),WAYLAND_DISPLAY='velapulse-isolated-no-renderer',VELAPULSE_BIN=str(repo/'target/debug/velapulse'))
 log=(artifacts/'daemon.log').open('w');processes=[]
 def daemon():
  p=subprocess.Popen([env['VELAPULSE_BIN'],'daemon'],env=env,stdout=log,stderr=log);processes.append(p);wait(lambda:snapshot(),'daemon startup');return p
 d=daemon()
 def sample():
  def ticks():return sum(map(int,Path(f'/proc/{d.pid}/stat').read_text().split()[13:15]))
  before=ticks();start=time.monotonic();time.sleep(2);cpu=(ticks()-before)/os.sysconf('SC_CLK_TCK')/(time.monotonic()-start)*100;rss=int(Path(f'/proc/{d.pid}/statm').read_text().split()[1])*os.sysconf('SC_PAGE_SIZE')/1024;latency=[]
  for _ in range(30):
   start=time.perf_counter();snapshot();latency.append((time.perf_counter()-start)*1000)
  return {'cpu_percent':round(cpu,2),'rss_kib':rss,'snapshot_median_ms':round(statistics.median(latency),2),'snapshot_max_ms':round(max(latency),2),'sample_seconds':2}
 try:
  metrics={'disabled_idle':sample()}
  cfg=snapshot()['config'];assert not cfg['weather']['enabled']and not cfg['developer']['codex']and not cfg['developer']['claude']
  assert json.loads(call('Brief')[0])['activities']==[]
  cfg['idle_clock']=True;cfg['developer'].update(codex=True,claude=True,codex_notifications=False,claude_notifications=False,task_notifications=False);call('Configure','(s)',[json.dumps(cfg)]);wait(lambda:any(a['id']=='clock'for a in snapshot()['activities']),'idle clock')
  cli=env['VELAPULSE_BIN'];success=subprocess.Popen([cli,'run','Success','--','/usr/bin/true'],env=env);processes.append(success);assert success.wait(timeout=10)==0
  fail=subprocess.Popen([cli,'run','Failure','--','/usr/bin/false'],env=env);processes.append(fail);assert fail.wait(timeout=10)==1
  a=subprocess.Popen([cli,'run','Concurrent A','--','/usr/bin/sleep','30'],env=env);b=subprocess.Popen([cli,'run','Concurrent B','--','/usr/bin/sleep','30'],env=env);processes.extend([a,b])
  items=wait(lambda:[x for x in snapshot()['activities']if x.get('developer',{}).get('state')=='running'and x['title'].startswith('Concurrent')]if len([x for x in snapshot()['activities']if x.get('developer',{}).get('state')=='running'and x['title'].startswith('Concurrent')])==2 else None,'two concurrent commands')
  metrics['two_running_tasks']=sample();(artifacts/'performance.json').write_text(json.dumps(metrics,indent=2))
  for item in items:call('DeveloperCancel','(s)',[item['id']])
  assert a.wait(timeout=10)!=0 and b.wait(timeout=10)!=0
  event={'provider':'claude','session':'fixture','state':'waiting','title':'Claude Code','project':'test','message':'Return to Claude Code to review · Tool: Bash','event_id':'attention'}
  id=call('DeveloperEvent','(s)',[json.dumps(event)])[0];call('DeveloperEvent','(s)',[json.dumps(event)]);view=wait(lambda:next((a for a in snapshot()['activities']if a['id']==id),None),'hook activity');assert len(view['developer']['events'])==1 and view['controls']==[];assert snapshot()['activities'][0]['id']==id
  try:call('DeveloperCancel','(s)',[id]);raise AssertionError('agent cancellation accepted')
  except GLib.Error:pass
  bad=dict(event,progress=2)
  try:call('DeveloperEvent','(s)',[json.dumps(bad)]);raise AssertionError('bad progress accepted')
  except GLib.Error:pass
  call('Command','(sst)',['brief','open',0]);brief=next(a for a in snapshot()['activities']if a['id']=='brief');assert brief['summary']and'Claude Code'in' '.join(brief['summary'])
  restart_task=subprocess.Popen([cli,'run','Restart owned task','--','/usr/bin/sleep','60'],env=env);processes.append(restart_task);wait(lambda:any(a['title']=='Restart owned task'for a in snapshot()['activities']),'owned task before restart')
  d.terminate();d.wait(timeout=5);assert restart_task.wait(timeout=15)!=0;d=daemon();wait(lambda:any(a.get('developer',{}).get('state')=='disconnected'for a in snapshot()['activities']),'recovered developer state')
  spec=importlib.util.spec_from_file_location('hook',repo/'integrations/claude-hook.py');hook=importlib.util.module_from_spec(spec);spec.loader.exec_module(hook)
  v=hook.normalize({'hook_event_name':'PermissionRequest','session_id':'abc','cwd':'/tmp/test','tool_name':'Bash','tool_input':{'command':'SECRET'},'transcript_path':'SECRET','prompt':'SECRET'});assert 'SECRET'not in json.dumps(v)and v['state']=='waiting'
  spec=importlib.util.spec_from_file_location('setup',repo/'integrations/claude-setup.py');setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(setup)
  old={'other':True,'hooks':{'Stop':[{'hooks':[{'type':'command','command':'other-hook'}]}]}};new=setup.merge(old,'vela-hook');assert setup.merge(new,'vela-hook')==new;assert setup.merge(new,'vela-hook',True)==old
  settings=base/'merge-settings.json';settings.write_text(json.dumps(old));setup_command=['/usr/bin/python3',str(repo/'integrations/claude-setup.py'),'--settings',str(settings),'--apply']
  subprocess.run(setup_command,env=env,check=True,stdout=subprocess.DEVNULL);subprocess.run(setup_command,env=env,check=True,stdout=subprocess.DEVNULL);registered=json.loads((base/'data/velapulse/hook-settings.json').read_text());assert len(registered)==1
  subprocess.run(['/usr/bin/python3',str(repo/'integrations/claude-setup.py'),'--remove-all-registered','--apply'],env=env,check=True,stdout=subprocess.DEVNULL);assert json.loads(settings.read_text())==old;assert not json.loads((base/'data/velapulse/hook-settings.json').read_text())
  if os.environ.get('VELAPULSE_TEST_REAL_AGENTS')=='1':
   output=(artifacts/'real-codex.log').open('w')
   result=subprocess.run([cli,'codex','Integration check','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','Reply only OK. Do not use tools.'],env=env,cwd=base,stdout=output,stderr=subprocess.STDOUT,timeout=90);output.close()
   print('Real Codex process exit:',result.returncode)
   settings=base/'claude-settings.json';settings.write_text('{}')
   subprocess.run(['/usr/bin/python3',str(repo/'integrations/claude-setup.py'),'--settings',str(settings),'--hook',str(repo/'integrations/claude-hook.py'),'--apply'],check=True,stdout=subprocess.DEVNULL,env=env)
   output=(artifacts/'real-claude.log').open('w')
   result=subprocess.run(['claude','--setting-sources','','--settings',str(settings),'--strict-mcp-config','--tools','','--no-session-persistence','--max-budget-usd','0.10','-p','Reply only OK. Do not use tools.'],env=env,cwd=base,stdout=output,stderr=subprocess.STDOUT,timeout=90);output.close()
   print('Real Claude process exit:',result.returncode)
   records=json.loads((base/'data/velapulse/developer-state.json').read_text());summary=[{'provider':r['view']['provider'],'state':r['view']['state'],'event_count':len(r['view']['events'])}for r in records.values()if r['view']['provider']in ['codex','claude']and r['view']['session']!='fixture'];(artifacts/'real-agent-result.json').write_text(json.dumps(summary,indent=2));print('Actual agent observer states:',summary)
  if os.environ.get('VELAPULSE_TEST_LIVE_WEATHER')=='1':
   locations=json.loads(call('WeatherSearch','(s)',['Berlin'])[0]);assert locations
   cfg=snapshot()['config'];cfg['weather'].update(enabled=True,location=locations[0]);call('Configure','(s)',[json.dumps(cfg)]);v=wait(lambda:json.loads(call('Weather')[0]).get('weather'),'real Open-Meteo forecast');assert v['hours']and v['days'];(artifacts/'live-weather.json').write_text(json.dumps(v,indent=2));print('PASS live Open-Meteo geocoding/current/hourly/daily using explicitly chosen test city Berlin')
  print('PASS Phase 3/4: opt-in defaults, idle clock, brief, real command success/failure/concurrency/cancel, hook state/dedup/privacy, permission limits, persistence/restart, hook merge/removal')
 finally:
  for p in reversed(processes):
   if p.poll()is None:p.terminate();p.wait(timeout=5)
