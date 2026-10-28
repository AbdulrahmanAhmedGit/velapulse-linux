"""Deterministic standard MPRIS peer. This fixture is never installed."""
from gi.repository import Gio, GLib
import os,time
xml='''<node><interface name="org.mpris.MediaPlayer2.Player">
<method name="PlayPause"/><method name="Next"/><method name="Previous"/>
<method name="SetPosition"><arg type="o" direction="in"/><arg type="x" direction="in"/></method>
<signal name="Seeked"><arg type="x"/></signal>
<property name="Metadata" type="a{sv}" access="read"/><property name="PlaybackStatus" type="s" access="read"/>
<property name="Position" type="x" access="read"/><property name="Rate" type="d" access="read"/>
<property name="CanControl" type="b" access="read"/><property name="CanPlay" type="b" access="read"/>
<property name="CanPause" type="b" access="read"/><property name="CanSeek" type="b" access="read"/>
<property name="CanGoNext" type="b" access="read"/><property name="CanGoPrevious" type="b" access="read"/>
</interface><interface name="org.mpris.MediaPlayer2"><property name="Identity" type="s" access="read"/></interface>
<interface name="org.velapulse.TestFixture1">
<method name="SetTrack"><arg type="s" direction="in"/><arg type="x" direction="in"/><arg type="s" direction="in"/></method>
<method name="SetSeekable"><arg type="b" direction="in"/></method>
</interface></node>'''
iface='org.mpris.MediaPlayer2.Player';path='/org/mpris/MediaPlayer2';name=os.environ.get('VELAPULSE_TEST_PLAYER','VelaPulseFixture')
art=os.environ.get('VELAPULSE_TEST_ARTWORK','');track_number=1;base=10000000;at=time.monotonic()
values={'PlaybackStatus':GLib.Variant('s','Playing'),'Rate':GLib.Variant('d',1.0),'CanControl':GLib.Variant('b',True),'CanPlay':GLib.Variant('b',True),'CanPause':GLib.Variant('b',True),'CanSeek':GLib.Variant('b',True),'CanGoNext':GLib.Variant('b',True),'CanGoPrevious':GLib.Variant('b',os.environ.get('VELAPULSE_TEST_PREVIOUS')=='1')}
def metadata(title,length,art):return GLib.Variant('a{sv}',{'xesam:title':GLib.Variant('s',title),'xesam:artist':GLib.Variant('as',['Test artist']),'xesam:album':GLib.Variant('s','VelaPulse original fixtures'),'mpris:length':GLib.Variant('x',length),'mpris:trackid':GLib.Variant('o',f'/fixture/track{track_number}'),'mpris:artUrl':GLib.Variant('s',art)})
values['Metadata']=metadata(os.environ.get('VELAPULSE_TEST_TITLE','Fixture track'),120000000,art)
def position():return base+(int((time.monotonic()-at)*1000000) if values['PlaybackStatus'].unpack()=='Playing' else 0)
def method(c,sender,p,i,m,args,inv):
 global base,at,track_number
 if m=='PlayPause':base=position();at=time.monotonic();values['PlaybackStatus']=GLib.Variant('s','Paused' if values['PlaybackStatus'].unpack()=='Playing' else 'Playing')
 elif m in ('Next','Previous','SetTrack'):
  track_number+=1;base=0;at=time.monotonic();values['Metadata']=metadata(*(args.unpack() if m=='SetTrack' else (('Next' if m=='Next' else 'Previous')+' fixture track',120000000,art)))
 elif m=='SetSeekable':values['CanSeek']=GLib.Variant('b',args.unpack()[0])
 elif m=='SetPosition':
  track,pos=args.unpack()
  if track==values['Metadata'].lookup_value('mpris:trackid',None).unpack():base=pos;at=time.monotonic();c.emit_signal(None,path,iface,'Seeked',GLib.Variant('(x)',(base,)))
 c.emit_signal(None,path,'org.freedesktop.DBus.Properties','PropertiesChanged',GLib.Variant('(sa{sv}as)',(iface,values,[])));inv.return_value(None)
def prop(c,s,p,i,n):
 if n=='Identity':return GLib.Variant('s',name)
 if n=='Position':return GLib.Variant('x',position())
 return values[n]
def ready(c,name):
 for interface in Gio.DBusNodeInfo.new_for_xml(xml).interfaces:c.register_object(path,interface,method,prop,None)
Gio.bus_own_name(Gio.BusType.SESSION,'org.mpris.MediaPlayer2.'+name,Gio.BusNameOwnerFlags.NONE,ready,None,None);GLib.MainLoop().run()
