"""Exercise actual D-Bus activation on a private bus and isolated config/display."""
import json,os,signal,subprocess,sys,tempfile,time
from pathlib import Path
from gi.repository import Gio,GLib
binary=str(Path('target/debug/velapulse').resolve())
if '--child' not in sys.argv:
    with tempfile.TemporaryDirectory(prefix='velapulse-activation-') as root:
        data=Path(root)/'data';services=data/'dbus-1/services';services.mkdir(parents=True)
        escaped=binary.replace('\\','\\\\').replace('"','\\"')
        (services/'io.github.velapulse.Service.service').write_text('[D-BUS Service]\nName=io.github.velapulse.Service\nExec="'+escaped+'" daemon\n')
        env=dict(os.environ,XDG_DATA_HOME=str(data),XDG_CONFIG_HOME=str(Path(root)/'config'),WAYLAND_DISPLAY='velapulse-isolated-test-no-display')
        subprocess.run(['dbus-run-session','--','/usr/bin/python3',__file__,'--child'],env=env,check=True)
else:
    def run(*args):return subprocess.check_output([binary,*args],text=True,timeout=8)
    def pid():return Gio.bus_get_sync(Gio.BusType.SESSION,None).call_sync('org.freedesktop.DBus','/org/freedesktop/DBus','org.freedesktop.DBus','GetConnectionUnixProcessID',GLib.Variant('(s)',['io.github.velapulse.Service']),None,Gio.DBusCallFlags.NONE,3000,None).unpack()[0]
    first=json.loads(run('snapshot'));first_pid=pid()
    run('timer','start','30')
    os.kill(first_pid,signal.SIGTERM)
    for _ in range(50):
        try:pid()
        except GLib.Error:break
        time.sleep(.05)
    second=json.loads(run('snapshot'));second_pid=pid()
    assert first_pid!=second_pid
    assert any(a['id']=='timer' and a['status']=='active'for a in second['activities'])
    os.kill(second_pid,signal.SIGTERM)
    print('PASS: on-demand D-Bus activation, reactivation after termination, persisted timer recovery')
