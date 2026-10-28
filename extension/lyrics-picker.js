#!/usr/bin/gjs -m
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const [id,track]=ARGV;
if(!id?.startsWith('media:org.mpris.MediaPlayer2.')||!track?.startsWith('/'))throw Error('Choose a current media track');
const app=new Adw.Application({application_id:'io.github.velapulse.LyricsPicker'});
app.connect('activate',()=>{const window=new Adw.ApplicationWindow({application:app,title:'Attach local lyrics',default_width:380,default_height:120});const box=new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:12,margin_top:20,margin_bottom:20,margin_start:20,margin_end:20});const status=new Gtk.Label({label:'Choose a local LRC file for the current track.',wrap:true}),button=new Gtk.Button({label:'Choose LRC…'});box.append(status);box.append(button);window.set_content(box);button.connect('clicked',()=>{const chooser=new Gtk.FileChooserNative({transient_for:window,title:'Attach synchronized lyrics',action:Gtk.FileChooserAction.OPEN,accept_label:'Attach'});const filter=new Gtk.FileFilter({name:'LRC lyrics'});filter.add_pattern('*.lrc');chooser.add_filter(filter);chooser.connect('response',(_,response)=>{const uri=chooser.get_file()?.get_uri();chooser.destroy();if(response!==Gtk.ResponseType.ACCEPT||!uri)return;Gio.DBus.session.call('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','ImportLyrics',new GLib.Variant('(sss)',[id,track,uri]),null,Gio.DBusCallFlags.NONE,6000,null,(c,r)=>{try{c.call_finish(r);status.label='Lyrics attached. Reopen Lyrics in the music card.';}catch(e){status.label=e.message;}});});chooser.show();});window.present();button.emit('clicked');});app.run([]);
