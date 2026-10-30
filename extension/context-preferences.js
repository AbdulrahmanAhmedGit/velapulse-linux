import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
export function addContextPreferences(weatherPage,developerPage,window,{request,save,getConfig}){
 let syncing=false,locations=[];const status=new Gtk.Label({wrap:true,xalign:0});
 const group=new Adw.PreferencesGroup({title:'Weather and local time',description:'Opt-in Open-Meteo requests send the selected city coordinates. No IP geolocation or tracking. Free endpoint is for non-commercial use; data © Open-Meteo, CC BY 4.0. City search: GeoNames via Open-Meteo.'});weatherPage.append(group);
 const enabled=new Adw.SwitchRow({title:'Enable weather'});group.add(enabled);enabled.connect('notify::active',()=>{if(!syncing)save({weather:{enabled:enabled.active}});});
 const current=new Adw.ActionRow({title:'Saved location',subtitle:'No location selected'});group.add(current);
 const search=new Adw.EntryRow({title:'Search city'});group.add(search);const find=new Gtk.Button({label:'Find cities'});weatherPage.append(find);
 const results=new Adw.ComboRow({title:'Search results',model:Gtk.StringList.new(['Search for a city'])});group.add(results);
 const choose=new Gtk.Button({label:'Use selected city',sensitive:false});weatherPage.append(choose);
 find.connect('clicked',async()=>{find.sensitive=false;try{locations=JSON.parse((await request('WeatherSearch','(s)',[search.text]))[0]);choose.sensitive=locations.length>0;results.model=Gtk.StringList.new(locations.length?locations.map(l=>l.name):['No matching cities']);status.label=locations.length?'Select a result, then use it.':'No results.';}catch(e){status.label=e.message.split('\n')[0];}finally{find.sensitive=true;}});
 choose.connect('clicked',()=>{if(locations[results.selected])save({weather:{location:locations[results.selected]}});});
 const units=new Adw.ComboRow({title:'Temperature units',model:Gtk.StringList.new(['Celsius','Fahrenheit'])});group.add(units);units.connect('notify::selected',()=>{if(!syncing)save({weather:{units:units.selected?'fahrenheit':'celsius'}});});
 const refresh=new Adw.SpinRow({title:'Refresh interval (minutes)',adjustment:new Gtk.Adjustment({lower:15,upper:180,step_increment:15,page_increment:30})});group.add(refresh);refresh.connect('notify::value',()=>{if(!syncing)save({weather:{refresh_minutes:Math.round(refresh.value)}});});
 const rain=new Adw.SwitchRow({title:'Rain forecast notices'}),change=new Adw.SwitchRow({title:'Large temperature change notices'});for(const row of [rain,change])group.add(row);rain.connect('notify::active',()=>{if(!syncing)save({weather:{rain_notices:rain.active}});});change.connect('notify::active',()=>{if(!syncing)save({weather:{change_notices:change.active}});});
 group.add(new Adw.ActionRow({title:'Official severe-weather warnings',subtitle:'Unavailable from this provider. Forecast notices are not official warnings.'}));
 const clock=new Adw.SwitchRow({title:'Idle clock'}),format=new Adw.SwitchRow({title:'24-hour clock'}),temperature=new Adw.SwitchRow({title:'Temperature beside idle clock'});for(const row of [clock,format,temperature])group.add(row);for(const [row,key]of [[clock,'idle_clock'],[format,'clock_24h'],[temperature,'clock_temperature']])row.connect('notify::active',()=>{if(!syncing)save({[key]:row.active});});
 const reload=new Gtk.Button({label:'Refresh weather now'});reload.connect('clicked',()=>request('WeatherRefresh','()',[]).then(()=>{status.label='Refresh requested. Requests are limited to one per minute.';}).catch(e=>{status.label=e.message;}));weatherPage.append(reload);weatherPage.append(status);weatherPage.append(new Gtk.LinkButton({label:'Open-Meteo attribution & terms',uri:'https://open-meteo.com/en/terms'}));
 const dev=new Adw.PreferencesGroup({title:'Developer integrations',description:'Only explicitly connected sessions. No prompts, transcripts or tool arguments retained. Permission requests direct you to the original agent.'});developerPage.append(dev);const toggles=[];
 for(const [key,title,program]of [['codex','Codex CLI','codex'],['claude','Claude Code','claude'],['tasks','Local tasks',null],['codex_notifications','Codex notifications',null],['claude_notifications','Claude notifications',null],['task_notifications','Task notifications',null]]){const row=new Adw.SwitchRow({title,subtitle:program?(GLib.find_program_in_path(program)?`${program} detected · integration still requires setup`:`${program} not found`):''});dev.add(row);toggles.push([key,row]);row.connect('notify::active',()=>{if(!syncing)save({developer:{[key]:row.active}});});}
 developerPage.append(new Gtk.Label({label:'Codex: launch with velapulse codex "Task label" [codex exec options]. Interactive desktop/CLI sessions are not monitored.\nLocal commands: velapulse run "Build" -- cargo build\nClaude: install observer hooks into a settings file you choose. Approvals remain in Claude Code.',wrap:true,xalign:0,selectable:true}));
 const hookStatus=new Gtk.Label({wrap:true,xalign:0});developerPage.append(hookStatus);
 const hookGroup=new Adw.PreferencesGroup({title:'Claude settings file',description:'Enter the absolute path to an existing Claude JSON settings file. Review and confirm each change.'});developerPage.append(hookGroup);
 let hookBusy=false;const hookPath=new Adw.EntryRow({title:'Settings JSON path'});hookGroup.add(hookPath);
 for(const remove of [false,true]){
  const button=new Gtk.Button({label:remove?'Remove VelaPulse Claude hooks…':'Install Claude observer hooks…'});developerPage.append(button);
  button.connect('clicked',()=>{
   if(hookBusy)return;const path=hookPath.text.trim();
   if(!GLib.path_is_absolute(path)||!GLib.file_test(path,GLib.FileTest.IS_REGULAR)){hookStatus.label='Enter the absolute path to an existing JSON settings file.';hookPath.grab_focus();return;}
   const dialog=new Adw.MessageDialog({transient_for:window,modal:true,heading:remove?'Remove VelaPulse hooks?':'Install observer hooks?',body:`${path}\n\nExisting settings and other hooks are preserved and backed up. This only observes agent states; it never approves or rejects requests.`});
   dialog.add_response('cancel','Cancel');dialog.add_response('apply',remove?'Remove':'Install');
   dialog.connect('response',(_,reply)=>{
    dialog.destroy();if(reply!=='apply')return;
    try{
     const here=Gio.File.new_for_uri(import.meta.url).get_parent();let directory=here.get_child('integrations');if(!directory.query_exists(null))directory=here.get_parent().get_child('integrations');
     const setup=directory.get_child('claude-setup.py').get_path();
     const argv=['/usr/bin/python3',setup,'--settings',path,'--apply',...(remove?['--remove']:[])];
     hookBusy=true;button.sensitive=false;const process=Gio.Subprocess.new(argv,Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_PIPE);
     process.communicate_utf8_async(null,null,(p,r)=>{try{const[,out,err]=p.communicate_utf8_finish(r);hookStatus.label=p.get_successful()?out:err;}catch(e){hookStatus.label=e.message;}finally{hookBusy=false;button.sensitive=true;}});
    }catch(e){hookBusy=false;button.sensitive=true;hookStatus.label=e.message;}
   });dialog.present();
  });
 }

 return {update(){syncing=true;const c=getConfig(),w=c.weather??{};enabled.active=w.enabled===true;current.subtitle=w.location?.name??'No location selected';units.selected=w.units==='fahrenheit'?1:0;refresh.value=w.refresh_minutes??30;rain.active=w.rain_notices!==false;change.active=w.change_notices===true;clock.active=c.idle_clock===true;format.active=c.clock_24h!==false;temperature.active=c.clock_temperature!==false;for(const[key,row]of toggles)row.active=(c.developer??{})[key]===true;syncing=false;}};
}
