#!/usr/bin/python3
"""Non-blocking observation only: no hook decision output and no transcript reads."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
STATES={'SessionStart':'starting','UserPromptSubmit':'running','PreToolUse':'running','PostToolUse':'running','PostToolUseFailure':'failed','Stop':'completed','StopFailure':'failed','PermissionRequest':'waiting','SessionEnd':'disconnected'}
def normalize(v):
 name=v.get('hook_event_name','');state=STATES.get(name)
 if name=='Notification':
  if v.get('notification_type')not in ['permission_prompt','idle_prompt']:return None
  state='waiting'
 if not state or not isinstance(v.get('session_id'),str):return None
 tool=v.get('tool_name','')
 if not isinstance(tool,str):tool=''
 tool=''.join(c for c in tool if c.isascii()and(c.isalnum()or c in '_-.'))[:60]
 message=('Return to Claude Code to review this request'+(' · Tool: '+tool if tool else ''))if state=='waiting'else name+(' · '+tool if tool else '')
 # Intentionally omit prompt, tool_input, message, last_assistant_message and transcript_path.
 session=hashlib.sha256(v['session_id'].encode()).hexdigest()[:32]
 project=Path(str(v.get('cwd',''))).name[:60]
 project=''.join(c for c in project if c.isprintable()).encode()[:120].decode('utf-8','ignore')
 nonce=v.get('tool_use_id',v.get('prompt_id',''))
 event_id=hashlib.sha256((name+str(nonce)+state).encode()).hexdigest()[:32]if nonce else ''
 return {'provider':'claude','session':session,'state':state,'title':'Claude Code','project':project,'message':message,'event_id':event_id}
def main():
 data=sys.stdin.buffer.read(65537)
 if len(data)>65536:return
 event=normalize(json.loads(data))
 if event:
  cli=os.environ.get('VELAPULSE_BIN',str(Path.home()/'.local/bin/velapulse'))
  subprocess.run([cli,'agent-event',json.dumps(event)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
if __name__=='__main__':
 try:main()
 except Exception:pass # Never block/approve/deny the original agent on monitoring failure.
