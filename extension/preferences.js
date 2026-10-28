import {addMusicPreferences} from './music-preferences.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {present, PALETTE} from './presentation.js';

const PROVIDERS = [
    ['media','Media','audio-x-generic-symbolic'],['timer','Timer','alarm-symbolic'],
    ['stopwatch','Stopwatch','preferences-system-time-symbolic'],['battery','Battery','battery-good-symbolic'],['volume','Audio','audio-volume-high-symbolic'],
];
export function fillPreferences(window) {
    window.set_default_size(1180,820);window.set_title('VelaPulse');
    let config={},activities=[],syncing=false,proxy,signal,ownerSignal,closed=false,pending=0,lastConfigKey=null,lastAppearance=null;
    const box=(vertical=false,style='',spacing=0)=>new Gtk.Box({orientation:vertical?Gtk.Orientation.VERTICAL:Gtk.Orientation.HORIZONTAL,spacing,css_classes:style?style.split(/\s+/):[]});
    const text=(value,style='',expand=false)=>new Gtk.Label({label:value,xalign:0,hexpand:expand,ellipsize:3,max_width_chars:style==='preview-pill-title'?16:style==='preview-pill-detail'?14:100,css_classes:style?style.split(/\s+/):[]});
    const button=(value,fn,style='')=>{const b=new Gtk.Button({label:value,css_classes:style?style.split(/\s+/):[]});b.connect('clicked',fn);return b;};
    const css=new Gtk.CssProvider();css.load_from_file(Gio.File.new_for_uri(import.meta.url).get_parent().get_child('preferences.css'));
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),css,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const root=box(false,'vela-settings');window.set_content(root);
    const sidebar=box(true,'settings-sidebar',5);sidebar.set_size_request(206,-1);root.append(sidebar);
    const brand=box(false,'settings-brand',10);brand.append(new Gtk.Image({icon_name:'media-record-symbolic',pixel_size:18}));brand.append(text('VelaPulse','brand-title'));sidebar.append(brand);
    const stack=new Gtk.Stack({transition_type:Gtk.StackTransitionType.CROSSFADE,transition_duration:120,hexpand:true,vexpand:true});
    const body=box(true,'settings-body');body.hexpand=true;root.append(body);
    const header=new Adw.HeaderBar({show_start_title_buttons:false,css_classes:['flat','settings-header']});
    const sectionTitle=text('Appearance','header-title');header.set_title_widget(sectionTitle);body.append(header);
    const columns=box(false,'settings-columns');columns.vexpand=true;body.append(columns);
    const scroll=new Gtk.ScrolledWindow({hscrollbar_policy:Gtk.PolicyType.NEVER,hexpand:true,vexpand:true});scroll.set_child(stack);columns.append(scroll);
    const inspector=box(true,'settings-inspector',12);inspector.set_size_request(260,-1);columns.append(inspector);
    const navButtons=[];
    function nav(title,icon,page,section) {
        if(section)sidebar.append(text(section,'nav-section'));
        const b=new Gtk.ToggleButton({css_classes:['nav-button']});const row=box(false,'',10);row.append(new Gtk.Image({icon_name:icon,pixel_size:16}));row.append(text(title));b.set_child(row);
        if(navButtons.length)b.set_group(navButtons[0]);navButtons.push(b);
        b.connect('toggled',()=>{if(b.active){stack.visible_child_name=page;sectionTitle.label=title;}});sidebar.append(b);return b;
    }
    function page(name) {const p=box(true,'settings-page',20);stack.add_named(p,name);return p;}
    const appearance=page('appearance');
    const search=new Gtk.SearchEntry({placeholder_text:'Find a setting…',css_classes:['settings-search']});appearance.append(search);
    const searchHint=text('Choose the shape of your desktop activities.','muted');appearance.append(searchHint);
    appearance.append(text('Live activities','section-title'));
    const previewRows=new Map(),toggles=new Map();
    for(const [id,title,icon] of PROVIDERS) {
        const row=box(false,'preview-row',10);row.set_name(`preview-${id}`);const enabled=new Gtk.CheckButton({tooltip_text:`Show ${title}`,name:`enabled-${id}`});toggles.set(id,enabled);
        enabled.connect('toggled',()=>{if(syncing)return;const next=new Set(config.enabled??[]);if(enabled.active)next.add(id);else next.delete(id);save({enabled:[...next]});});row.append(enabled);
        const labels=box(false,'',8);labels.hexpand=true;labels.append(text(title,'preview-name'));const positionLabel=text('background','muted');labels.append(positionLabel);row.append(labels);
        const pill=box(false,`pill-preview preview-${id}`,7);pill.set_size_request(230,30);
        const well=box(false,'preview-well');well.append(new Gtk.Image({icon_name:icon,pixel_size:14}));pill.append(well);
        const titleLabel=text('','preview-pill-title'),detail=text('','preview-pill-detail',true);pill.append(titleLabel);pill.append(detail);
        if(id==='media'||id==='timer')pill.append(new Gtk.Image({icon_name:'media-playback-pause-symbolic',pixel_size:13}));
        row.append(pill);appearance.append(row);previewRows.set(id,{row,titleLabel,detail,pill,positionLabel});
    }
    const sizes=box(true,'size-section',12);sizes.append(text('Pill size  ·  3 options','section-title'));appearance.append(sizes);
    const sizeRow=box(false,'size-grid',12);sizes.append(sizeRow);const sizeButtons=new Map();
    for(const [id,title,width] of [['small','Small',76],['medium','Normal',96],['large','Large',112]]) {
        const b=new Gtk.ToggleButton({name:`size-${id}`,css_classes:['size-choice']});if(sizeButtons.size)b.set_group([...sizeButtons.values()][0]);
        const sample=box(true,'size-choice-content',17);sample.halign=Gtk.Align.CENTER;sample.valign=Gtk.Align.CENTER;
        const miniature=box(false,'mini-pill',6);miniature.valign=Gtk.Align.CENTER;miniature.set_size_request(width,20);miniature.append(box(false,'mini-disc'));
        const line=box(false,'mini-line');line.hexpand=true;line.valign=Gtk.Align.CENTER;miniature.append(line);sample.append(miniature);sample.append(text(title,'size-label'));b.set_child(sample);
        b.connect('toggled',()=>{if(b.active&&!syncing)save({size:id});});sizeButtons.set(id,b);sizeRow.append(b);
    }
    const cards=box(true,'size-section',12);cards.append(text('Card size  ·  2 options','section-title'));const cardRow=box(false,'size-grid',12);cards.append(cardRow);appearance.append(cards);const cardButtons=new Map();
    for(const [id,title] of [['normal','Normal'],['large','Large']]) {
        const b=new Gtk.ToggleButton({name:`card-${id}`,css_classes:['card-choice']});if(cardButtons.size)b.set_group([...cardButtons.values()][0]);
        const sample=box(true,'card-choice-content',8);sample.halign=Gtk.Align.CENTER;const cover=box(true,'mini-cover');cover.set_size_request(id==='large'?90:72,id==='large'?70:55);sample.append(cover);
        const line=box(false,'mini-line');line.set_size_request(60,3);sample.append(line);sample.append(text(title,'size-label'));b.set_child(sample);
        b.connect('toggled',()=>{if(b.active&&!syncing)save({card_size:id});});cardButtons.set(id,b);cardRow.append(b);
    }
    const status=text('Connecting to your activities…','settings-status');appearance.append(status);
    const general=page('general');general.append(text('General','page-title'));general.append(text('Startup, display and motion.','muted'));
    const generalGroup=new Adw.PreferencesGroup();general.append(generalGroup);
    const backend=new Adw.ComboRow({title:'Desktop renderer',subtitle:'Automatic prefers native layer shell when available. Panel mode uses the GNOME extension.',model:Gtk.StringList.new(['Automatic','Native layer shell','GNOME extension'])});generalGroup.add(backend);backend.connect('notify::selected',()=>{if(!syncing)save({backend:['auto','layer-shell','gnome-extension'][backend.selected]});});
    const startup=new Adw.SwitchRow({title:'Start at login',subtitle:'Keep your activities ready in the background.'});generalGroup.add(startup);startup.connect('notify::active',()=>{if(!syncing)save({autostart:startup.active});});
    const monitor=new Adw.ComboRow({title:'Display',model:Gtk.StringList.new(['Default display',...Array.from({length:Gdk.Display.get_default().get_monitors().get_n_items()},(_,i)=>`Display ${i+1}`)])});generalGroup.add(monitor);monitor.connect('notify::selected',()=>{if(!syncing)save({monitor:monitor.selected-1});});
    const providerPages=new Map();
    for(const [id,title,icon] of PROVIDERS) {
        const p=page(id);p.append(text(title,'page-title'));const description=text('','provider-detail');p.append(description);
        const group=new Adw.PreferencesGroup();p.append(group);
        const visible=new Adw.SwitchRow({title:`Show ${title.toLowerCase()}`,subtitle:'Display this activity when information is available.'});group.add(visible);visible.connect('notify::active',()=>{if(syncing)return;const next=new Set(config.enabled??[]);if(visible.active)next.add(id);else next.delete(id);save({enabled:[...next]});});
        const priority=new Adw.SpinRow({title:'Priority',subtitle:'Higher priorities appear first.',adjustment:new Gtk.Adjustment({lower:-100,upper:100,step_increment:5,page_increment:10})});group.add(priority);priority.connect('notify::value',()=>{if(!syncing)save({priorities:{...config.priorities,[id]:Math.round(priority.value)}});});
        if(id==='timer'||id==='stopwatch') {
            const controls=box(false,'provider-controls',10);
            if(id==='timer') {const duration=new Gtk.SpinButton({adjustment:new Gtk.Adjustment({lower:1,upper:1440,value:5,step_increment:1,page_increment:5}),numeric:true});duration.set_tooltip_text('Duration in minutes');controls.append(duration);controls.append(button('Start timer',()=>command(id,'start',duration.get_value_as_int()*60),'suggested-action'));}
            else controls.append(button('Start stopwatch',()=>command(id,'start',0),'suggested-action'));
            controls.append(button('Reset',()=>command(id,'reset',0)));p.append(controls);
        }
        providerPages.set(id,{description,visible,priority});
    }
    const request=(method,signature,args)=>new Promise((resolve,reject)=>{if(!proxy?.g_name_owner){reject(new Error('Activity service unavailable'));return;}proxy.call(method,new GLib.Variant(signature,args),Gio.DBusCallFlags.NONE,6000,null,(p,r)=>{try{resolve(p.call_finish(r).deep_unpack());}catch(e){reject(e);}});});
    const musicSettings=addMusicPreferences(stack.get_child_by_name('media'),window,{request,save,getConfig:()=>config,getActivities:()=>activities});
    const about=page('about');about.append(text('VelaPulse','page-title'));about.append(text('Live activities for your Linux desktop.','muted'));about.append(text('Independent implementation · MIT licensed','muted'));about.append(button('Project and source',()=>Gio.AppInfo.launch_default_for_uri_async('https://github.com/AbdulrahmanAhmedGit/velapulse-linux',null,null,()=>{})));
    nav('Appearance','preferences-desktop-appearance-symbolic','appearance','Settings').active=true;
    nav('General','emblem-system-symbolic','general');
    for(const [id,title,icon] of PROVIDERS)nav(title,icon,id,id==='media'?'Activities':null);
    const spacer=box();spacer.vexpand=true;sidebar.append(spacer);nav('About','help-about-symbolic','about');
    inspector.append(text('Appearance','inspector-title'));
    const inspectorGroup=new Adw.PreferencesGroup();inspector.append(inspectorGroup);
    const placement=new Adw.ComboRow({title:'Placement',subtitle:'Top Bar requires GNOME',model:Gtk.StringList.new(['Floating pill','GNOME Top Bar'])});inspectorGroup.add(placement);placement.connect('notify::selected',()=>{if(!syncing)save({surface:placement.selected?'panel':'floating'});});
    const theme=new Adw.ComboRow({title:'Appearance',model:Gtk.StringList.new(['Dark','Liquid Glass','Light'])});inspectorGroup.add(theme);theme.connect('notify::selected',()=>{if(!syncing)save({appearance:['dark','glass','light'][theme.selected]});});
    const position=new Adw.ComboRow({title:'Position',model:Gtk.StringList.new(['Top','Bottom'])});inspectorGroup.add(position);position.connect('notify::selected',()=>{if(!syncing)save({position:position.selected?'bottom':'top'});});
    const opacityRow=box(true,'inspector-section',10);opacityRow.append(text('Opacity','inspector-label'));
    const opacity=Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL,65,100,1);opacity.set_draw_value(true);opacity.set_value_pos(Gtk.PositionType.RIGHT);opacityRow.append(opacity);inspector.append(opacityRow);
    opacity.connect('value-changed',()=>{if(syncing)return;draft={opacity:Math.round(opacity.get_value())};if(pending)GLib.Source.remove(pending);pending=GLib.timeout_add(GLib.PRIORITY_DEFAULT,140,()=>{pending=0;const patch=draft;draft={};save(patch);return GLib.SOURCE_REMOVE;});});
    const motionGroup=new Adw.PreferencesGroup({title:'Motion'});inspector.append(motionGroup);const motion=new Adw.SwitchRow({title:'Animations'});motionGroup.add(motion);motion.connect('notify::active',()=>{if(!syncing)save({animations:motion.active});});
    inspector.append(text('Changes apply immediately','inspector-note'));
    function applySearch() {
        const q=search.text.trim().toLowerCase();
        for(const [id,{row}] of previewRows) {
            const match=!q||id.includes(q)||PROVIDERS.find(x=>x[0]===id)[1].toLowerCase().includes(q);
            row.visible=match&&(id!=='stopwatch'||activities.some(a=>a.id==='stopwatch')||Boolean(q));
        }
        sizes.visible=!q||'pill size'.includes(q);cards.visible=!q||'card size'.includes(q);
    }
    search.connect('search-changed',applySearch);
    function command(id,action,seconds) {proxy?.call('Command',new GLib.Variant('(sst)',[id,action,seconds]),Gio.DBusCallFlags.NONE,3000,null,(p,r)=>{try{p.call_finish(r);}catch{status.label='This action is unavailable.';}});}
    let saving=false,queued={},inFlight={},draft={};
    function save(patch) {queued={...queued,...patch};flush();}
    function flush() {
        if(closed||saving||!Object.keys(queued).length)return;
        if(!proxy?.g_name_owner){status.label='Start VelaPulse to change settings.';return;}
        const patch=queued;queued={};inFlight=patch;config={...config,...patch};saving=true;
        proxy.call('Configure',new GLib.Variant('(s)',[JSON.stringify(config)]),Gio.DBusCallFlags.NONE,3000,null,(p,r)=>{saving=false;inFlight={};if(closed)return;try{p.call_finish(r);status.label='Changes apply immediately';}catch{status.label='Settings could not be saved.';refresh();}flush();});
    }
    function update(json) {
        if(closed)return;let s;try{s=JSON.parse(json);}catch{return;}
        if(lastConfigKey===null)status.label='Changes apply immediately';
        config={...s.config,...inFlight,...queued,...draft};activities=s.activities;syncing=true;
        const configKey=JSON.stringify(config);
        if(configKey!==lastConfigKey) {
            lastConfigKey=configKey;
            backend.selected=Math.max(0,['auto','layer-shell','gnome-extension'].indexOf(config.backend??'auto'));placement.selected=config.surface==='panel'?1:0;position.sensitive=config.surface!=='panel';theme.selected=Math.max(0,['dark','glass','light'].indexOf(config.appearance));position.selected=config.position==='bottom'?1:0;opacity.set_value(config.opacity??98);motion.active=config.animations;startup.active=config.autostart;monitor.selected=config.monitor+1;
            for(const [id,b] of sizeButtons)b.active=id===config.size;for(const [id,b] of cardButtons)b.active=id===(config.card_size??'normal');
            for(const [id,refs] of providerPages) {
                toggles.get(id).active=config.enabled.includes(id);
                refs.visible.active=config.enabled.includes(id);refs.priority.value=config.priorities[id]??50;
            }
            if(config.appearance!==lastAppearance) {
                lastAppearance=config.appearance;
                root.set_css_classes(['vela-settings',...(config.appearance==='light'?['settings-light']:config.appearance==='glass'?['settings-glass']:[])]);
                if(config.appearance==='glass')window.add_css_class('vela-preferences-glass');else window.remove_css_class('vela-preferences-glass');
                Adw.StyleManager.get_default().color_scheme=config.appearance==='light'?Adw.ColorScheme.FORCE_LIGHT:Adw.ColorScheme.FORCE_DARK;
            }
        }
        for(const [id,{row,titleLabel,detail,positionLabel}] of previewRows) {
            const a=activities.find(a=>a.id.split(':')[0]===id),p=present(a);
            const title=a?p.compact:(id==='media'?'Media':'');
            const subtitle=a?` · ${p.detail}`:(id==='media'?'Nothing playing':'Not running');
            if(titleLabel.label!==title)titleLabel.label=title;
            if(detail.label!==subtitle)detail.label=subtitle;
            const foreground=activities[0]?.id.split(':')[0]===id;
            const position=foreground?'foreground':'background';
            if(positionLabel.label!==position)positionLabel.label=position;
            if(row.has_css_class('preview-row-selected')!==foreground) {
                if(foreground)row.add_css_class('preview-row-selected');else row.remove_css_class('preview-row-selected');
            }
            const description=a?`${a.title} · ${a.description}`:'No activity right now.';
            const refs=providerPages.get(id);if(refs.description.label!==description)refs.description.label=description;
        }
        musicSettings.update();applySearch();syncing=false;
    }
    function refresh() {if(!proxy?.g_name_owner){status.label='Activity service unavailable';return;}proxy.call('Snapshot',null,Gio.DBusCallFlags.NONE,3000,null,(p,r)=>{try{update(p.call_finish(r).deep_unpack()[0]);}catch{status.label='Activity service unavailable';}});}
    Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION,Gio.DBusProxyFlags.NONE,null,'io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',null,(_,result)=>{if(closed)return;try{proxy=Gio.DBusProxy.new_for_bus_finish(result);}catch{status.label='Activity service unavailable';return;}signal=proxy.connect('g-signal',(_,__,name,args)=>{if(name==='Changed')update(args.deep_unpack()[0]);});ownerSignal=proxy.connect('notify::g-name-owner',refresh);refresh();});
    window.connect('close-request',()=>{closed=true;if(signal)proxy.disconnect(signal);if(ownerSignal)proxy.disconnect(ownerSignal);if(pending)GLib.Source.remove(pending);Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(),css);return false;});
}
