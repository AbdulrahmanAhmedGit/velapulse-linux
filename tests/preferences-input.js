// Input regression: use the marked private compositor started by the Python runner.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {fillPreferences} from '../extension/preferences.js';
import {fillExtensionPreferences} from '../extension/preferences-host.js';
if(GLib.getenv('VELAPULSE_ISOLATED_TEST')!=='1'||!GLib.file_test(`${GLib.getenv('XDG_RUNTIME_DIR')}/velapulse-test-session`,GLib.FileTest.IS_REGULAR))throw new Error('Private compositor required');
const mode=ARGV[0]??'fixed';
const outputScale=Number(GLib.getenv('VELAPULSE_TEST_SCALE')??1),screenWidth=Math.round(1600/outputScale),screenHeight=Math.round(1000/outputScale);
const app=new Adw.Application({application_id:'io.github.velapulse.PreferencesInputTest'});
let failed=false,host,window,mouse=0,keys=0,hostEvents=0;
const sleep=ms=>new Promise(resolve=>GLib.timeout_add(GLib.PRIORITY_DEFAULT,ms,()=>{resolve();return GLib.SOURCE_REMOVE;}));
function assert(v,m){if(!v)throw new Error(m);}
function walk(w,r=[]){r.push(w);for(let c=w.get_first_child();c;c=c.get_next_sibling())walk(c,r);return r;}
async function process(args){const p=Gio.Subprocess.new(args,Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_PIPE);return new Promise((resolve,reject)=>p.communicate_utf8_async(null,null,(p,r)=>{try{const [,out,err]=p.communicate_utf8_finish(r);if(!p.get_successful())throw new Error(`${args[0]}: ${err}`);resolve(out);}catch(e){reject(e);}}));}
let inputProcess,inputReader,inputWriter;
async function input(...args){inputWriter.put_string(args.join(' ')+'\n',null);const reply=await readInput();assert(reply==='OK',`Input client failed: ${reply}`);}
function readInput(){return new Promise((resolve,reject)=>inputReader.read_line_async(GLib.PRIORITY_DEFAULT,null,(r,result)=>{try{const[line]=r.read_line_finish_utf8(result);resolve(line);}catch(e){reject(e);}}));}
async function key(k){await input('key',k);await sleep(60);}
function dbus(method,signature,args){return Gio.DBus.session.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',method,new GLib.Variant(signature,args),null,Gio.DBusCallFlags.NONE,3000,null).deep_unpack();}
const snapshot=()=>JSON.parse(dbus('Snapshot','()',[])[0]);
const config=()=>snapshot().config;
async function until(fn,message){for(let i=0;i<30;i++){if(fn())return;await sleep(100);}throw new Error(message);}
function find(Type,title){return walk(window).find(w=>w instanceof Type&&w.title===title&&w.get_mapped());}
function nav(title){return walk(window).find(w=>w instanceof Gtk.ToggleButton&&w.has_css_class('nav-button')&&walk(w).some(c=>c instanceof Gtk.Label&&c.label===title));}
function bounds(w){const[ok,r]=w.compute_bounds(window);assert(ok&&w.get_mapped()&&r.size.width>0&&r.size.height>0,`Unmapped control ${w.title??w.name} visible=${w.visible} mapped=${w.get_mapped()}`);return {x:r.origin.x,y:r.origin.y,w:r.size.width,h:r.size.height};}
async function offset(){const tree=JSON.parse(await process([GLib.getenv('VELAPULSE_TEST_SWAYMSG'),'-r','-t','get_tree']));function findNode(n){if(n.name==='VelaPulse Preferences Input Test')return n;for(const c of [...(n.nodes??[]),...(n.floating_nodes??[])]){const f=findNode(c);if(f)return f;}return null;}const n=findNode(tree);assert(n,'No mapped test window');return{x:n.rect.x+n.window_rect.x,y:n.rect.y+n.window_rect.y};}
async function reveal(w){
 let scroll=w.get_parent();while(scroll&&!(scroll instanceof Gtk.ScrolledWindow))scroll=scroll.get_parent();
 if(!scroll)return;
 for(let i=0;i<16;i++){
  const b=bounds(w),v=bounds(scroll),o=await offset(),bottom=Math.min(v.y+v.h,screenHeight-o.y-8);
  if(b.y>=v.y+4&&b.y+b.h<=bottom-4)return;
  await input('scroll',Math.round(o.x+v.x+v.w/2),Math.round(o.y+v.y+Math.min(v.h,bottom-v.y)/2),b.y<v.y+4?-160:160,screenWidth,screenHeight);await sleep(200);
 }
 throw new Error('Control cannot scroll into view: '+(w.title??w.name));
}
async function click(w,fx=.5,fy=.5){await reveal(w);const b=bounds(w),o=await offset();await input('click',Math.round(o.x+b.x+b.w*fx),Math.round(o.y+b.y+b.h*fy),screenWidth,screenHeight);await sleep(180);}
async function type(w,text){w.grab_focus();await sleep(180);await click(w);await key('CTRL+A');if(text)await input('type',text);else await key('BACKSPACE');await sleep(300);}
async function dropdown(w,index){await click(w);await key('HOME');for(let i=0;i<index;i++)await key('DOWN');await key('ENTER');await until(()=>w.selected===index,`Dropdown ${w.title} ignored input`);}
async function page(title,id){await click(nav(title));await until(()=>walk(window).find(w=>w instanceof Gtk.Stack).visible_child_name===id,`Sidebar ${title} did not navigate`);}
async function toggle(row,field){const read=()=>field.split('.').reduce((o,k)=>o[k],config());const old=read();const sw=walk(row).find(w=>w instanceof Gtk.Switch);await click(sw);await until(()=>read()!==old,`${field} switch did not persist`);await sleep(450);}
async function run(){
 inputProcess=Gio.Subprocess.new([GLib.getenv('VELAPULSE_TEST_INPUT')],Gio.SubprocessFlags.STDIN_PIPE|Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_PIPE);inputReader=new Gio.DataInputStream({base_stream:inputProcess.get_stdout_pipe()});inputWriter=new Gio.DataOutputStream({base_stream:inputProcess.get_stdin_pipe()});assert(await readInput()==='READY','Input client not ready');
 await sleep(700);
 if(GLib.getenv('VELAPULSE_TEST_SEARCH_ONLY')==='1'){
  const split=window.get_content(),search=walk(window).find(w=>w instanceof Gtk.SearchEntry);
  if(split.collapsed&&split.show_sidebar){await click(walk(window).find(w=>w instanceof Gtk.Button&&w.tooltip_text==='Show settings categories'));}
  await key('CTRL+F');let searchFocused=false;for(let w=window.get_focus();w;w=w.get_parent())if(w===search)searchFocused=true;assert(searchFocused,'Ctrl+F must focus global search');
  await type(search,'Temperature units');await key('ENTER');const stack=walk(window).find(w=>w instanceof Gtk.Stack);await until(()=>stack.visible_child_name==='weather','Adaptive global search destination');
  assert(find(Adw.ComboRow,'Temperature units'),'Search destination control');await dropdown(find(Adw.ComboRow,'Temperature units'),1);await until(()=>config().weather.units==='fahrenheit','Search target writes settings');
  if(GLib.getenv('VELAPULSE_TEST_GRIM'))await process([GLib.getenv('VELAPULSE_TEST_GRIM'),GLib.getenv('VELAPULSE_TEST_GLASS_IMAGE')]);
  await type(search,'card size');await key('ENTER');await until(()=>stack.visible_child_name==='appearance','Search must also index custom size controls');await click(walk(window).find(w=>w.name==='card-large'));await until(()=>config().card_size==='large','Search custom size control persistence');
  print('PASS adaptive preferences: collapsed sidebar, Ctrl+F, global row/custom size search, actual controls and persistence');return;
 }
 if(GLib.getenv('VELAPULSE_TEST_LAYOUT_CAPTURE')==='1'){
  const themeIndex=Number(GLib.getenv('VELAPULSE_TEST_THEME_INDEX')??1);if(themeIndex===0)await dropdown(find(Adw.ComboRow,'Appearance'),1);await dropdown(find(Adw.ComboRow,'Appearance'),themeIndex);await sleep(300);
  await process([GLib.getenv('VELAPULSE_TEST_GRIM'),GLib.getenv('VELAPULSE_TEST_GLASS_IMAGE')]);
  print('PASS actual preferences capture after pointer/keyboard appearance selection');return;
 }

 const stack=walk(window).find(w=>w instanceof Gtk.Stack);
 assert(window.is_sensitive()&&bounds(nav('General')).w>0,'Visible widgets insensitive');
 if(mode==='legacy'){
  await click(nav('General'));await key('TAB');await key('SPACE');
  assert(stack.visible_child_name==='appearance'&&hostEvents>0&&mouse===0&&keys===0,'Legacy failure was not reproduced');
  print(`PASS legacy regression: hidden modal host received ${hostEvents} events; visible window received none`);return;
 }
 if(mode!=='standalone')assert(!host.modal&&window.modal,'Modality must belong to visible child');
 for(const[title,id]of [['General','general'],['Media','media'],['Timer','timer'],['Stopwatch','stopwatch'],['Battery','battery'],['Audio','volume'],['About','about'],['Appearance','appearance']])await page(title,id);
 await page('Weather & clock','weather');
 if(GLib.getenv('VELAPULSE_TEST_WEATHER_UI')==='1'){
  await type(find(Adw.EntryRow,'Search city'),'Berlin');await click(walk(window).find(w=>w instanceof Gtk.Button&&w.label==='Find cities'));
  let ready=false;for(let i=0;i<150;i++){if(find(Adw.ComboRow,'Search results').model.get_string(0).includes('Berlin')){ready=true;break;}await sleep(100);}assert(ready,'Real city search results');
  await dropdown(find(Adw.ComboRow,'Search results'),0);await click(walk(window).find(w=>w instanceof Gtk.Button&&w.label==='Use selected city'));await until(()=>config().weather.location?.name.includes('Berlin'),'city persisted');print('PASS actual pointer/key: real city search, selection and persisted location');
 }
 await toggle(find(Adw.SwitchRow,'Enable weather'),'weather.enabled');await until(()=>config().weather.enabled,'weather enable');await toggle(find(Adw.SwitchRow,'Enable weather'),'weather.enabled');await until(()=>!config().weather.enabled,'weather disable');
 await dropdown(find(Adw.ComboRow,'Temperature units'),1);await until(()=>config().weather.units==='fahrenheit','weather units');await dropdown(find(Adw.ComboRow,'Temperature units'),0);
 for(const [title,key] of [['Rain forecast notices','weather.rain_notices'],['Large temperature change notices','weather.change_notices'],['Idle clock','idle_clock'],['24-hour clock','clock_24h'],['Temperature beside idle clock','clock_temperature']]){await toggle(find(Adw.SwitchRow,title),key);await toggle(find(Adw.SwitchRow,title),key);}
 const interval=walk(find(Adw.SpinRow,'Refresh interval (minutes)')).find(w=>w instanceof Gtk.Text&&w.get_mapped());interval.grab_focus();await sleep(200);await type(interval,'45');await key('ENTER');await until(()=>config().weather.refresh_minutes===45,'weather refresh interval');await type(interval,'30');await key('ENTER');await until(()=>config().weather.refresh_minutes===30,'weather interval restored');
 const refreshWeather=walk(window).find(w=>w instanceof Gtk.Button&&w.label==='Refresh weather now');refreshWeather.grab_focus();await key('SPACE');await until(()=>walk(window).some(w=>w instanceof Gtk.Label&&w.label.includes('Refresh requested')),'weather refresh response');
 await page('Developer integrations','developer');for(const [title,key] of [['Codex CLI','codex'],['Claude Code','claude'],['Local tasks','tasks'],['Codex notifications','codex_notifications'],['Claude notifications','claude_notifications'],['Task notifications','task_notifications']]){await toggle(find(Adw.SwitchRow,title),'developer.'+key);await toggle(find(Adw.SwitchRow,title),'developer.'+key);}
 const hookPath=GLib.getenv('VELAPULSE_TEST_HOOK_SETTINGS');
 const readHooks=()=>JSON.parse(new TextDecoder().decode(GLib.file_get_contents(hookPath)[1]));const originalHooks=JSON.stringify(readHooks());
 await type(find(Adw.EntryRow,'Settings JSON path'),hookPath);
 for(const remove of [false,true]){
  const label=remove?'Remove VelaPulse Claude hooks…':'Install Claude observer hooks…';const button=walk(window).find(w=>w instanceof Gtk.Button&&w.label===label);button.grab_focus();await sleep(120);await key('SPACE');
  let dialog;await until(()=>{dialog=Gtk.Window.list_toplevels().find(w=>w instanceof Adw.MessageDialog&&w.visible);return dialog?.get_mapped();},'Hook setup confirmation');
  const action=remove?'Remove':'Install';const focused=()=>{for(let w=dialog.get_focus();w;w=w.get_parent())if(w instanceof Gtk.Button&&w.label===action)return true;return false;};for(let i=0;i<8&&!focused();i++)await key('TAB');assert(focused(),'Hook confirmation focus');await key('SPACE');await until(()=>!dialog.visible,'Hook confirmation close');
  await until(()=>remove?JSON.stringify(readHooks())===originalHooks:readHooks().hooks.SessionStart?.length>0,'Hook setup result');
 }
 print('PASS actual input: Claude settings path, explicit confirmation, installation and removal preserve private fixture settings');
 await page('Appearance','appearance');print('PASS actual input: weather and developer settings, units, notices, idle clock and opt-in switches');
 print('PASS pointer: all eight sidebar destinations');
 for(const size of ['large','medium','small']){await click(walk(window).find(w=>w.name===`size-${size}`));await until(()=>config().size===size,`pill ${size}`);}
 for(const size of ['large','normal']){await click(walk(window).find(w=>w.name===`card-${size}`));await until(()=>config().card_size===size,`card ${size}`);}
 for(const id of ['media','timer','stopwatch','battery','volume']){
  // Stopwatch's empty preview is intentionally hidden until a search matches it.
  const search=walk(window).find(w=>w instanceof Gtk.SearchEntry);await type(search,id);
  const check=walk(window).find(w=>w.name===`enabled-${id}`);await until(()=>check.get_mapped(),`Search did not reveal ${id}`);const old=config().enabled.includes(id);await click(check);await until(()=>config().enabled.includes(id)!==old,`preview toggle ${id}`);await click(check);await until(()=>config().enabled.includes(id)===old,`preview restore ${id}`);
 }
 const search=walk(window).find(w=>w instanceof Gtk.SearchEntry);await type(search,'media');assert(!walk(window).find(w=>w.name==='preview-timer').visible,'Search did not filter');await type(search,'');
 await page('General','general');await type(search,'Temperature units');await key('ENTER');await until(()=>stack.visible_child_name==='weather','Global search must open actual Weather settings');assert(find(Adw.ComboRow,'Temperature units'),'Global search destination missing');await page('Appearance','appearance');
 print('PASS global settings search navigates to the existing native row');
 print('PASS pointer+keyboard: provider checkboxes, five size selectors, search input/filter/clear');
 await dropdown(find(Adw.ComboRow,'Appearance'),2);await until(()=>config().appearance==='light','theme persistence');assert(window.get_content().has_css_class('settings-light'),'Theme did not apply');await dropdown(find(Adw.ComboRow,'Appearance'),1);await until(()=>config().appearance==='glass','Glass persistence');assert(window.get_content().has_css_class('settings-glass')&&window.has_css_class('vela-preferences-glass'),'Transparent glass surfaces did not apply');
 if(GLib.getenv('VELAPULSE_TEST_GRIM')){await sleep(300);await process([GLib.getenv('VELAPULSE_TEST_GRIM'),GLib.getenv('VELAPULSE_TEST_GLASS_IMAGE')]);}
 await dropdown(find(Adw.ComboRow,'Appearance'),0);assert(!window.has_css_class('vela-preferences-glass'),'Glass window style was not cleared');
 await dropdown(find(Adw.ComboRow,'Position'),0);await until(()=>config().position==='top','top position');await dropdown(find(Adw.ComboRow,'Position'),1);
 await dropdown(find(Adw.ComboRow,'Placement'),1);await until(()=>config().surface==='panel','panel placement');assert(!find(Adw.ComboRow,'Position').is_sensitive(),'Panel must disable floating position');await dropdown(find(Adw.ComboRow,'Placement'),0);
 await toggle(find(Adw.SwitchRow,'Animations'),'animations');await toggle(find(Adw.SwitchRow,'Animations'),'animations');
 const scale=walk(window).find(w=>w instanceof Gtk.Scale);await click(scale,.25);await key('HOME');for(let i=0;i<5;i++)await key('RIGHT');await until(()=>config().opacity===70,'Slider keyboard persistence');
 const b=bounds(scale),o=await offset();await input('drag',Math.round(o.x+b.x+20),Math.round(o.y+b.y+b.h/2),Math.round(o.x+b.x+b.w*.7),Math.round(o.y+b.y+b.h/2),screenWidth,screenHeight);await until(()=>config().opacity!==70,'Slider pointer drag persistence');
 print('PASS pointer+keyboard: appearance/position/placement dropdowns, animation switch, opacity slider');
 await page('General','general');await dropdown(find(Adw.ComboRow,'Desktop renderer'),2);await until(()=>config().backend==='gnome-extension','backend setting');await dropdown(find(Adw.ComboRow,'Desktop renderer'),0);
 await toggle(find(Adw.SwitchRow,'Start at login'),'autostart');assert(GLib.file_test(`${GLib.getenv('XDG_CONFIG_HOME')}/autostart/io.github.velapulse.desktop`,GLib.FileTest.IS_REGULAR),'Autostart entry missing');await toggle(find(Adw.SwitchRow,'Start at login'),'autostart');
 await dropdown(find(Adw.ComboRow,'Display'),1);await until(()=>config().monitor===0,'display persistence');await dropdown(find(Adw.ComboRow,'Display'),0);
 print('PASS pointer+keyboard: renderer selection, autostart file, display selection');
 for(const[id,title]of [['media','Media'],['timer','Timer'],['stopwatch','Stopwatch'],['battery','Battery'],['volume','Audio']]){
  await page(title,id);const visible=find(Adw.SwitchRow,`Show ${title.toLowerCase()}`);const old=config().enabled.includes(id);await click(walk(visible).find(w=>w instanceof Gtk.Switch));await sleep(450);await until(()=>config().enabled.includes(id)!==old,`provider ${id}`);await click(walk(visible).find(w=>w instanceof Gtk.Switch));await sleep(450);
  const priority=find(Adw.SpinRow,'Priority');const edit=walk(priority).find(w=>w instanceof Gtk.Text&&w.get_mapped());await type(edit,'85');await key('ENTER');await until(()=>config().priorities[id]===85,`priority ${id}`);
 }
 await page('Media','media');await toggle(find(Adw.SwitchRow,'Local listening history'),'listening_history');await toggle(find(Adw.SwitchRow,'Local listening history'),'listening_history');const refreshHistory=walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Refresh history');await click(refreshHistory);await until(()=>walk(stack.visible_child).some(w=>w instanceof Gtk.Label&&w.label.includes('Last 7 days:')),'History summary button');
 const clearHistory=walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Clear history');await click(clearHistory);let confirmation;await until(()=>{confirmation=Gtk.Window.list_toplevels().find(w=>w instanceof Adw.MessageDialog&&w.visible);return confirmation?.get_mapped();},'History confirmation missing');
 const clearFocused=()=>{for(let w=confirmation.get_focus();w;w=w.get_parent())if(w instanceof Gtk.Button&&w.label==='Clear history')return true;return false;};for(let i=0;i<8&&!clearFocused();i++)await key('TAB');assert(clearFocused(),'History confirmation keyboard focus');await key('SPACE');await until(()=>!confirmation.visible,'History clear confirmation did not close');
 print('PASS pointer+keyboard: all five provider switches, priorities, history opt-in/disable, summary and clear confirmation');
 await page('Timer','timer');const duration=walk(stack.visible_child).find(w=>w instanceof Gtk.SpinButton);await type(walk(duration).find(w=>w instanceof Gtk.Text&&w.get_mapped()),'2');await key('ENTER');await click(walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Start timer'));await until(()=>snapshot().activities.some(a=>a.id==='timer'&&a.status==='active'),'Start timer');await click(walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Reset'));await until(()=>!snapshot().activities.some(a=>a.id==='timer'),'Reset timer');
 await page('Stopwatch','stopwatch');await click(walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Start stopwatch'));await until(()=>snapshot().activities.some(a=>a.id==='stopwatch'),'Start stopwatch');await click(walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Reset'));await until(()=>!snapshot().activities.some(a=>a.id==='stopwatch'),'Reset stopwatch');
 print('PASS pointer+keyboard: timer duration/start/reset and stopwatch start/reset');
 await page('About','about');const linkLog=GLib.getenv('VELAPULSE_TEST_LINK_LOG');if(GLib.file_test(linkLog,GLib.FileTest.EXISTS))Gio.File.new_for_path(linkLog).delete(null);
 await click(walk(stack.visible_child).find(w=>w instanceof Gtk.Button&&w.label==='Project and source'));
 await until(()=>GLib.file_test(linkLog,GLib.FileTest.IS_REGULAR),'About source link did not launch');assert(new TextDecoder().decode(GLib.file_get_contents(linkLog)[1])==='https://github.com/AbdulrahmanAhmedGit/velapulse-linux','Wrong source URI');print('PASS pointer: About link delivered to private URI handler');
 const saved=JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${GLib.getenv('XDG_CONFIG_HOME')}/velapulse/config.json`)[1]));const ordered=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);assert(ordered(saved)===ordered(config()),'Saved settings differ from service snapshot');
 assert(mouse>30&&keys>30&&hostEvents===0,`Event routing mouse=${mouse} keys=${keys} host=${hostEvents}`);
 // Closing either side must release the companion tracking window exactly once.
 window.close();await sleep(100);assert(!host.visible&&!window.visible,'Companion windows did not close');
 print(`PASS event delivery and persistence: ${mouse} pointer events, ${keys} key events, no events redirected to hidden host; close lifecycle`);
}
app.connect('activate',()=>{
 app.hold();
 host=new Adw.PreferencesWindow({application:app,modal:true});
 if(mode==='standalone'){host.modal=false;window=new Adw.ApplicationWindow({application:app});fillPreferences(window);}
 else if(mode==='legacy'){
  host.add(new Adw.PreferencesPage({title:'VelaPulse'}));window=new Adw.ApplicationWindow({application:app});fillPreferences(window);host.connect('map',()=>{host.hide();window.present();});window.connect('close-request',()=>{host.close();return false;});
 }else window=fillExtensionPreferences(host);
 window.set_decorated(false);window.set_default_size(Math.min(Number(GLib.getenv('VELAPULSE_TEST_WINDOW_WIDTH')??940),screenWidth-32),Math.min(900,screenHeight-32));window.title='VelaPulse Preferences Input Test';
 for(const[w,isHost]of [[host,true],[window,false]]){const controller=new Gtk.EventControllerLegacy({propagation_phase:Gtk.PropagationPhase.CAPTURE});controller.connect('event',(_,event)=>{const type=event.get_event_type();if([2,3,4,5].includes(type)){if(isHost)hostEvents++;else if([2,3].includes(type))mouse++;else {keys++;}}return false;});w.add_controller(controller);}
 window.present();if(mode!=='standalone')host.show();run().catch(async e=>{printerr(e.message);printerr(e.stack);if(GLib.getenv('VELAPULSE_TEST_GRIM'))await process([GLib.getenv('VELAPULSE_TEST_GRIM'),GLib.getenv('VELAPULSE_TEST_GLASS_IMAGE').replace('liquid-glass','preferences-failure')]);failed=true;}).finally(()=>{inputProcess?.force_exit();window.close();host.close();app.release();app.quit();});
});app.run([]);if(failed)throw new Error('Preferences input regression failed');
