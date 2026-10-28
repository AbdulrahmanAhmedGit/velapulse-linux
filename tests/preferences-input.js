// Input regression: use the marked private compositor started by the Python runner.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {fillPreferences} from '../extension/preferences.js';
import {fillExtensionPreferences} from '../extension/preferences-host.js';
if(GLib.getenv('VELAPULSE_ISOLATED_TEST')!=='1'||!GLib.file_test(`${GLib.getenv('XDG_RUNTIME_DIR')}/velapulse-test-session`,GLib.FileTest.IS_REGULAR))throw new Error('Private compositor required');
const mode=ARGV[0]??'fixed';
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
async function click(w,fx=.5,fy=.5){const b=bounds(w),o=await offset();await input('click',Math.round(o.x+b.x+b.w*fx),Math.round(o.y+b.y+b.h*fy),1600,1000);await sleep(180);}
async function type(w,text){await click(w);await key('CTRL+A');if(text)await input('type',text);else await key('BACKSPACE');await sleep(300);}
async function dropdown(w,index){await click(w);await key('HOME');for(let i=0;i<index;i++)await key('DOWN');await key('ENTER');await until(()=>w.selected===index,`Dropdown ${w.title} ignored input`);}
async function page(title,id){await click(nav(title));await until(()=>walk(window).find(w=>w instanceof Gtk.Stack).visible_child_name===id,`Sidebar ${title} did not navigate`);}
async function toggle(row,field){const old=config()[field];await click(walk(row).find(w=>w instanceof Gtk.Switch));await until(()=>config()[field]!==old,`${field} switch did not persist`);await sleep(450);}
async function run(){
 inputProcess=Gio.Subprocess.new([GLib.getenv('VELAPULSE_TEST_INPUT')],Gio.SubprocessFlags.STDIN_PIPE|Gio.SubprocessFlags.STDOUT_PIPE|Gio.SubprocessFlags.STDERR_PIPE);inputReader=new Gio.DataInputStream({base_stream:inputProcess.get_stdout_pipe()});inputWriter=new Gio.DataOutputStream({base_stream:inputProcess.get_stdin_pipe()});assert(await readInput()==='READY','Input client not ready');
 await sleep(700);
 const stack=walk(window).find(w=>w instanceof Gtk.Stack);
 assert(window.is_sensitive()&&bounds(nav('General')).w>0,'Visible widgets insensitive');
 if(mode==='legacy'){
  await click(nav('General'));await key('TAB');await key('SPACE');
  assert(stack.visible_child_name==='appearance'&&hostEvents>0&&mouse===0&&keys===0,'Legacy failure was not reproduced');
  print(`PASS legacy regression: hidden modal host received ${hostEvents} events; visible window received none`);return;
 }
 if(mode!=='standalone')assert(!host.modal&&window.modal,'Modality must belong to visible child');
 for(const[title,id]of [['General','general'],['Media','media'],['Timer','timer'],['Stopwatch','stopwatch'],['Battery','battery'],['Audio','volume'],['About','about'],['Appearance','appearance']])await page(title,id);
 print('PASS pointer: all eight sidebar destinations');
 for(const size of ['large','medium','small']){await click(walk(window).find(w=>w.name===`size-${size}`));await until(()=>config().size===size,`pill ${size}`);}
 for(const size of ['large','normal']){await click(walk(window).find(w=>w.name===`card-${size}`));await until(()=>config().card_size===size,`card ${size}`);}
 for(const id of ['media','timer','stopwatch','battery','volume']){
  // Stopwatch's empty preview is intentionally hidden until a search matches it.
  const search=walk(window).find(w=>w instanceof Gtk.SearchEntry);await type(search,id);
  const check=walk(window).find(w=>w.name===`enabled-${id}`);const old=config().enabled.includes(id);await click(check);await until(()=>config().enabled.includes(id)!==old,`preview toggle ${id}`);await click(check);await until(()=>config().enabled.includes(id)===old,`preview restore ${id}`);
 }
 const search=walk(window).find(w=>w instanceof Gtk.SearchEntry);await type(search,'media');assert(!walk(window).find(w=>w.name==='preview-timer').visible,'Search did not filter');await type(search,'');
 print('PASS pointer+keyboard: provider checkboxes, five size selectors, search input/filter/clear');
 await dropdown(find(Adw.ComboRow,'Appearance'),2);await until(()=>config().appearance==='light','theme persistence');assert(window.get_content().has_css_class('settings-light'),'Theme did not apply');await dropdown(find(Adw.ComboRow,'Appearance'),1);await until(()=>config().appearance==='glass','Glass persistence');assert(window.get_content().has_css_class('settings-glass')&&window.has_css_class('vela-preferences-glass'),'Transparent glass surfaces did not apply');
 if(GLib.getenv('VELAPULSE_TEST_GRIM')){await sleep(300);await process([GLib.getenv('VELAPULSE_TEST_GRIM'),GLib.getenv('VELAPULSE_TEST_GLASS_IMAGE')]);}
 await dropdown(find(Adw.ComboRow,'Appearance'),0);assert(!window.has_css_class('vela-preferences-glass'),'Glass window style was not cleared');
 await dropdown(find(Adw.ComboRow,'Position'),0);await until(()=>config().position==='top','top position');await dropdown(find(Adw.ComboRow,'Position'),1);
 await dropdown(find(Adw.ComboRow,'Placement'),1);await until(()=>config().surface==='panel','panel placement');assert(!find(Adw.ComboRow,'Position').is_sensitive(),'Panel must disable floating position');await dropdown(find(Adw.ComboRow,'Placement'),0);
 await toggle(find(Adw.SwitchRow,'Animations'),'animations');await toggle(find(Adw.SwitchRow,'Animations'),'animations');
 const scale=walk(window).find(w=>w instanceof Gtk.Scale);await click(scale,.25);await key('HOME');for(let i=0;i<5;i++)await key('RIGHT');await until(()=>config().opacity===70,'Slider keyboard persistence');
 const b=bounds(scale),o=await offset();await input('drag',Math.round(o.x+b.x+20),Math.round(o.y+b.y+b.h/2),Math.round(o.x+b.x+b.w*.7),Math.round(o.y+b.y+b.h/2),1600,1000);await until(()=>config().opacity!==70,'Slider pointer drag persistence');
 print('PASS pointer+keyboard: appearance/position/placement dropdowns, animation switch, opacity slider');
 await page('General','general');await dropdown(find(Adw.ComboRow,'Desktop renderer'),2);await until(()=>config().backend==='gnome-extension','backend setting');await dropdown(find(Adw.ComboRow,'Desktop renderer'),0);
 await toggle(find(Adw.SwitchRow,'Start at login'),'autostart');assert(GLib.file_test(`${GLib.getenv('XDG_CONFIG_HOME')}/autostart/io.github.velapulse.desktop`,GLib.FileTest.IS_REGULAR),'Autostart entry missing');await toggle(find(Adw.SwitchRow,'Start at login'),'autostart');
 await dropdown(find(Adw.ComboRow,'Display'),1);await until(()=>config().monitor===0,'display persistence');await dropdown(find(Adw.ComboRow,'Display'),0);
 print('PASS pointer+keyboard: renderer selection, autostart file, display selection');
 for(const[id,title]of [['media','Media'],['timer','Timer'],['stopwatch','Stopwatch'],['battery','Battery'],['volume','Audio']]){
  await page(title,id);const visible=find(Adw.SwitchRow,`Show ${title.toLowerCase()}`);const old=config().enabled.includes(id);await click(walk(visible).find(w=>w instanceof Gtk.Switch));await sleep(450);await until(()=>config().enabled.includes(id)!==old,`provider ${id}`);await click(walk(visible).find(w=>w instanceof Gtk.Switch));await sleep(450);
  const priority=find(Adw.SpinRow,'Priority');const edit=walk(priority).find(w=>w instanceof Gtk.Text&&w.get_mapped());await type(edit,'85');await key('ENTER');await until(()=>config().priorities[id]===85,`priority ${id}`);
 }
 print('PASS pointer+keyboard: all five provider switches and priority editors');
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
 window.set_decorated(false);window.set_default_size(1280,900);window.title='VelaPulse Preferences Input Test';
 for(const[w,isHost]of [[host,true],[window,false]]){const controller=new Gtk.EventControllerLegacy({propagation_phase:Gtk.PropagationPhase.CAPTURE});controller.connect('event',(_,event)=>{const type=event.get_event_type();if([2,3,4,5].includes(type)){if(isHost)hostEvents++;else if([2,3].includes(type))mouse++;else {keys++;}}return false;});w.add_controller(controller);}
 window.present();if(mode!=='standalone')host.show();run().catch(e=>{printerr(e.message);printerr(e.stack);failed=true;}).finally(()=>{inputProcess?.force_exit();window.close();host.close();app.release();app.quit();});
});app.run([]);if(failed)throw new Error('Preferences input regression failed');
