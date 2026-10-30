"""Short matched production-renderer sample, no geometry recorder or test UI hooks."""
import json,os,subprocess,time
from pathlib import Path
assert os.environ.get('VELAPULSE_ISOLATED_TEST')=='1'
assert (Path(os.environ['XDG_RUNTIME_DIR'])/'velapulse-test-session').is_file()
repo=Path(__file__).resolve().parents[1]
env=dict(os.environ,LD_PRELOAD='libgtk4-layer-shell.so.0')
root=Path(env['VELAPULSE_TEST_COMPOSITOR_ROOT'])/'usr/lib/x86_64-linux-gnu' if env.get('VELAPULSE_TEST_COMPOSITOR_ROOT') else None
if root:env.update(GI_TYPELIB_PATH=str(root/'girepository-1.0'),LD_LIBRARY_PATH=str(root))
artifacts=Path(env['VELAPULSE_TEST_ARTIFACTS']);result={}
def usage(pid):
 fields=Path(f'/proc/{pid}/stat').read_text().split(') ',1)[1].split()
 return (int(fields[11])+int(fields[12]))/os.sysconf('SC_CLK_TCK'),int(fields[21])*os.sysconf('SC_PAGE_SIZE')/1024
for name,source in [('before',Path(env['VELAPULSE_TEST_BASELINE'])/'backends/layer-shell.js'),('after',repo/'backends/layer-shell.js')]:
 with (artifacts/f'{name}-renderer.log').open('w')as log:
  process=subprocess.Popen(['gjs','-m',str(source)],env=env,stdout=log,stderr=log)
  try:
   time.sleep(2);assert process.poll()is None,'Production renderer exited'
   cpu0,rss=usage(process.pid);start=time.monotonic();time.sleep(5);cpu1,rss1=usage(process.pid);elapsed=time.monotonic()-start
   result[name]={'cpu_percent':round((cpu1-cpu0)/elapsed*100,2),'rss_kib':rss1,'sample_seconds':round(elapsed,2),'scope':'production GTK compact music, software compositor, two fixture MPRIS peers'}
  finally:process.terminate();process.wait(timeout=5)
(artifacts/'renderer-performance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
