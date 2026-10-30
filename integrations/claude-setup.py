#!/usr/bin/python3
"""Reviewable, reversible hook merge. External files change only with --apply."""
import argparse,json,os,shlex,shutil,time
from pathlib import Path
EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','PostToolUseFailure','Stop','StopFailure','Notification','PermissionRequest','SessionEnd']
def merge(settings,command,remove=False):
 result=json.loads(json.dumps(settings));hooks=result.setdefault('hooks',{})
 for event in EVENTS:
  kept=[]
  for original in hooks.get(event,[]):
   entry=dict(original);entry['hooks']=[h for h in entry.get('hooks',[])if h.get('command')!=command]
   if entry['hooks']:kept.append(entry)
  if not remove:kept.append({'hooks':[{'type':'command','command':command,'timeout':4}]})
  if kept:hooks[event]=kept
  else:hooks.pop(event,None)
 return result
def write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.velapulse.tmp');tmp.write_text(json.dumps(value,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(path)
def apply(settings,command,remove):
 if settings.exists():
  if settings.stat().st_size>1024*1024:raise ValueError('Settings file exceeds 1 MiB')
  old=json.loads(settings.read_text())
 else:old={}
 new=merge(old,command,remove)
 if new!=old:
  if settings.exists():shutil.copy2(settings,settings.with_name(settings.name+'.velapulse-backup-'+str(time.time_ns())))
  write(settings,new)
 return new
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--settings',type=Path);p.add_argument('--hook',type=Path,default=Path(__file__).with_name('claude-hook.py'));p.add_argument('--remove',action='store_true');p.add_argument('--remove-all-registered',action='store_true');p.add_argument('--apply',action='store_true');a=p.parse_args()
 registry=Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))/'velapulse/hook-settings.json'
 records=json.loads(registry.read_text())if registry.exists()else[]
 if a.remove_all_registered:
  if not a.apply:p.error('--remove-all-registered requires explicit --apply')
  for record in records:apply(Path(record['settings']),record['command'],True)
  write(registry,[]);print('Removed registered VelaPulse hooks; unrelated settings preserved.')
 else:
  if not a.settings:p.error('--settings is required')
  command='/usr/bin/python3 '+shlex.quote(str(a.hook.resolve()));settings=a.settings.resolve()
  if a.apply:
   apply(settings,command,a.remove);records=[r for r in records if r!={'settings':str(settings),'command':command}]
   if not a.remove:records.append({'settings':str(settings),'command':command})
   write(registry,records);print('Removed VelaPulse observer hooks.'if a.remove else 'Installed VelaPulse observer hooks; changed settings backed up.')
  else:
   old=json.loads(settings.read_text())if settings.exists()else{};print(json.dumps(merge(old,command,a.remove),indent=2))
