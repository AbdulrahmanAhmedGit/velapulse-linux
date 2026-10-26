"""Deterministic MPRIS peer for isolated integration tests; never a release provider."""
from gi.repository import Gio, GLib
import os
xml='''<node><interface name="org.mpris.MediaPlayer2.Player">
<method name="PlayPause"/><method name="Next"/><method name="Previous"/>
<property name="Metadata" type="a{sv}" access="read"/>
<property name="PlaybackStatus" type="s" access="read"/>
<property name="Position" type="x" access="read"/>
<property name="CanControl" type="b" access="read"/>
<property name="CanPlay" type="b" access="read"/>
<property name="CanPause" type="b" access="read"/>
<property name="CanGoNext" type="b" access="read"/>
<property name="CanGoPrevious" type="b" access="read"/>
</interface></node>'''
iface='org.mpris.MediaPlayer2.Player'
path='/org/mpris/MediaPlayer2'
values={'Metadata':GLib.Variant('a{sv}',{'xesam:title':GLib.Variant('s','Fixture track'),'xesam:artist':GLib.Variant('as',['Test artist']),'mpris:length':GLib.Variant('x',120000000)}),'PlaybackStatus':GLib.Variant('s','Playing'),'Position':GLib.Variant('x',10000000),'CanControl':GLib.Variant('b',True),'CanPlay':GLib.Variant('b',True),'CanPause':GLib.Variant('b',True),'CanGoNext':GLib.Variant('b',True),'CanGoPrevious':GLib.Variant('b',os.environ.get('VELAPULSE_TEST_PREVIOUS')=='1')}
if os.environ.get('VELAPULSE_TEST_ARTWORK'):
    values['Metadata']=GLib.Variant('a{sv}',{**values['Metadata'].unpack(),'mpris:artUrl':GLib.Variant('s',os.environ['VELAPULSE_TEST_ARTWORK'])})

def method(c,sender,p,i,m,args,inv):
    if m=='PlayPause': values['PlaybackStatus']=GLib.Variant('s','Paused' if values['PlaybackStatus'].unpack()=='Playing' else 'Playing')
    if m=='Previous': values['Metadata']=GLib.Variant('a{sv}',{'xesam:title':GLib.Variant('s','Previous fixture track')})
    if m=='Next': values['Metadata']=GLib.Variant('a{sv}',{'xesam:title':GLib.Variant('s','Next fixture track')})
    c.emit_signal(None,path,'org.freedesktop.DBus.Properties','PropertiesChanged',GLib.Variant('(sa{sv}as)',(iface,values,[])))
    inv.return_value(None)
def ready(c,name): c.register_object(path,Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0],method,lambda c,s,p,i,n:values[n],None)
Gio.bus_own_name(Gio.BusType.SESSION,'org.mpris.MediaPlayer2.VelaPulseFixture',Gio.BusNameOwnerFlags.NONE,ready,None,None)
GLib.MainLoop().run()
