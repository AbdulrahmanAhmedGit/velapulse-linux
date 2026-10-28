#!/usr/bin/python3
"""Fixed-command fake tools for PRIVATE audio integration tests, never installed."""
import os,sys,json
from pathlib import Path
assert os.environ.get('VELAPULSE_ISOLATED_TEST')=='1'
state_file=Path(os.environ['VELAPULSE_TEST_AUDIO_STATE']);state=json.loads(state_file.read_text());args=sys.argv[1:]
if Path(sys.argv[0]).name=='pw-dump':
 print(json.dumps([{'id':42,'info':{'props':{'media.class':'Audio/Sink','node.name':'fixture-speakers','node.description':'Fixture speakers'}}},{'id':43,'info':{'props':{'media.class':'Audio/Sink','node.name':'fixture-headphones','node.description':'Fixture headphones'}}},{'metadata':[{'key':'default.audio.sink','value':{'name':state['default']}}]}]))
elif args[0]=='get-volume':print('Volume: %.2f%s'%(state['volume'],' [MUTED]' if state['muted'] else ''))
else:
 if args[0]=='set-volume':state['volume']=float(args[2])
 elif args[0]=='set-mute':state['muted']=args[2]=='1'
 elif args[0]=='set-default':state['default']='fixture-headphones' if args[1]=='43' else 'fixture-speakers'
 else:raise SystemExit(1)
 state_file.write_text(json.dumps(state))
