#!/usr/bin/gjs -m
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Layer from 'gi://Gtk4LayerShell';
import {present, actionInfo, SIZES} from '../extension/presentation.js';

const BUS = 'io.github.velapulse.Service', PATH = '/io/github/velapulse/Service', IFACE = 'io.github.velapulse.Service1';
const here = Gio.File.new_for_uri(import.meta.url).get_parent();
const app = new Gtk.Application({application_id: 'io.github.velapulse.LayerShell'});
let window, proxy, root, pill, pillIcon, pillTitle, pillDetail, pillControls, revealer, card;
let state = {activities: [], config: {}}, selected, expanded = false, launcherOpen = false;
let lastMonitor, lastPosition, cardKey, pillKey, refs = {}, signal = 0, ownerSignal = 0, monitorSignal = 0;
function call(method, signature, args, done = () => {}) {
    proxy?.call(method, new GLib.Variant(signature, args), Gio.DBusCallFlags.NONE, 3000, null, (p,r) => {
        try {done(p.call_finish(r).deep_unpack());} catch {pillDetail.label = 'This control is unavailable';}
    });
}
function command(id, action, seconds = 0) {if(action === 'start') {selected = id;launcherOpen = false;}call('Command', '(sst)', [id, action, seconds]);}
function label(text, style, expand = false) {return new Gtk.Label({label:text, xalign:0, ellipsize:3, hexpand:expand, css_classes:[style]});}
function box(vertical = false, style = '', spacing = 0) {return new Gtk.Box({orientation:vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL, spacing, css_classes:style ? [style] : []});}
function clear(widget) {while(widget.get_first_child())widget.remove(widget.get_first_child());}
function iconButton(icon, name, action, style = '') {
    const b = new Gtk.Button({icon_name:icon, tooltip_text:name, css_classes:['vela-icon-button', ...(style ? [style] : [])]});b.update_property([Gtk.AccessibleProperty.LABEL], [name]);b.connect('clicked',action);return b;
}
function textButton(text, action, style = '') {const b = new Gtk.Button({label:text, css_classes:['vela-text-button', ...(style ? [style] : [])]});b.connect('clicked',action);return b;}
function preferences() {
    setExpanded(false);
    Gio.Subprocess.new(['gjs','-m',here.get_child('preferences.js').get_path()],Gio.SubprocessFlags.NONE);
}
function position() {
    const monitors = Gdk.Display.get_default().get_monitors(), index = state.config.monitor ?? -1;
    if(monitors.get_n_items()) {const m = monitors.get_item(index >= 0 && index < monitors.get_n_items() ? index : 0);if(m !== lastMonitor){Layer.set_monitor(window,m);lastMonitor=m;}}
    const bottom = state.config.position === 'bottom';
    if(lastPosition !== bottom) {
        lastPosition = bottom;Layer.set_anchor(window,Layer.Edge.TOP,!bottom);Layer.set_anchor(window,Layer.Edge.BOTTOM,bottom);
        Layer.set_margin(window,Layer.Edge.TOP,28);Layer.set_margin(window,Layer.Edge.BOTTOM,28);
        root.reorder_child_after(pill,bottom ? revealer : null);
        revealer.transition_type = bottom ? Gtk.RevealerTransitionType.SLIDE_UP : Gtk.RevealerTransitionType.SLIDE_DOWN;
    }
    const sizes = SIZES[state.config.size] ?? SIZES.medium;
    const m = Layer.get_monitor(window), width = m ? m.get_geometry().width - 32 : sizes.card;
    pill.set_size_request(Math.min(sizes.pill,width), -1);card.set_size_request(Math.min(sizes.card,width),-1);
}
function setExpanded(open) {
    expanded = open;renderCard();revealer.reveal_child = open;
    Layer.set_keyboard_mode(window,open ? Layer.KeyboardMode.ON_DEMAND : Layer.KeyboardMode.NONE);
}
function render(json) {
    const oldTop = state.activities[0]?.id;
    try {state = JSON.parse(json);} catch {return;}
    if((!expanded && oldTop !== state.activities[0]?.id) || !state.activities.some(a=>a.id===selected))selected=state.activities[0]?.id;
    const a = state.activities.find(a=>a.id===selected), p = present(a);
    root.set_css_classes(['vela-root', ...(state.config.appearance === 'light' ? ['vela-light'] : []), `vela-${p.type}`]);
    root.opacity = (state.config.opacity ?? 98)/100;
    pillIcon.icon_name=p.icon;pillTitle.label=p.compact;pillDetail.label=p.detail;
    const key = JSON.stringify([a?.id,a?.controls,a?.status]);
    if(key !== pillKey) {
        pillKey=key;clear(pillControls);
        const actions = p.type==='media' ? (a.controls ?? []) : (a?.controls ?? []).filter(c=>c!=='reset');
        for(const action of actions) {const [icon,name]=actionInfo(action,a.status);pillControls.append(iconButton(icon,name,()=>command(a.id,action),'vela-inline'));}
    }
    revealer.transition_duration=state.config.animations!==false && Gtk.Settings.get_default().gtk_enable_animations ? 240 : 0;
    renderCard();position();
}
function buildProgress() {refs.progress = new Gtk.ProgressBar({css_classes:['vela-progress']});card.append(refs.progress);}
function renderCard() {
    if(!expanded)return;
    const a=state.activities.find(a=>a.id===selected),p=present(a);
    const key=JSON.stringify([a?.id,a?.controls,a?.status,state.activities.map(a=>a.id),launcherOpen]);
    if(key !== cardKey) {
        cardKey=key;clear(card);refs={};
        const header=box(false,'vela-card-header',6),tag=box(false,'vela-tag',7);
        tag.hexpand=true;tag.valign=Gtk.Align.CENTER;tag.append(new Gtk.Image({icon_name:p.icon,pixel_size:13}));tag.append(label(p.label,'vela-caption'));
        header.append(tag);header.append(iconButton('emblem-system-symbolic','Preferences',preferences,'vela-quiet'));header.append(iconButton('window-close-symbolic','Collapse activity',()=>setExpanded(false),'vela-quiet'));card.append(header);
        if(p.type==='media') {
            const hero=new Gtk.Box({css_classes:['vela-artwork'],overflow:Gtk.Overflow.HIDDEN,height_request:190});
            refs.art=new Gtk.Picture({content_fit:Gtk.ContentFit.COVER,can_shrink:true,hexpand:true,vexpand:true});hero.append(refs.art);card.append(hero);
            refs.source=label(p.source,'vela-source');card.append(refs.source);
            refs.title=label(p.title,'vela-title');card.append(refs.title);refs.detail=label(p.subtitle,'vela-subtitle');card.append(refs.detail);buildProgress();
            const times=box(false,'vela-times');refs.elapsed=label(p.elapsed,'vela-time-label',true);refs.duration=label(p.duration,'vela-time-label');times.append(refs.elapsed);times.append(refs.duration);card.append(times);
        } else if(['timer','stopwatch','battery','volume'].includes(p.type)) {
            const panel=box(true,'vela-metric-panel',9);refs.metric=label(p.metric,'vela-metric');panel.append(refs.metric);
            refs.title=label(p.title,'vela-metric-title');panel.append(refs.title);refs.detail=label(p.subtitle,'vela-subtitle');panel.append(refs.detail);card.append(panel);buildProgress();
        } else {
            const panel=box(true,'vela-summary-panel',15);panel.append(new Gtk.Image({icon_name:p.icon,pixel_size:34,halign:Gtk.Align.START}));
            refs.title=label(p.title,'vela-title');panel.append(refs.title);refs.detail=label(p.subtitle,'vela-subtitle');panel.append(refs.detail);card.append(panel);buildProgress();
        }
        if(a?.controls.length) {
            const controls=box(false,'vela-transport',17);controls.halign=Gtk.Align.CENTER;
            const ordered=['timer','stopwatch'].includes(p.type) ? [...a.controls].reverse() : a.controls;
            for(const action of ordered) {const [icon,name]=actionInfo(action,a.status);controls.append(iconButton(icon,name,()=>command(a.id,action),['PlayPause','pause','resume'].includes(action)?'vela-primary':'vela-secondary'));}card.append(controls);
        }
        if(state.activities.length>1) {
            const rail=box(false,'vela-activity-rail',6);rail.halign=Gtk.Align.CENTER;
            for(const activity of state.activities.slice(0,5))rail.append(iconButton(present(activity).icon,`Show ${activity.title}`,()=>{selected=activity.id;launcherOpen=false;render(JSON.stringify(state));},activity.id===a?.id?'vela-rail-selected':'vela-rail-item'));
            card.append(rail);
        }
        if(!a || launcherOpen) {
            const launcher=box(true,'vela-launcher',10);launcher.append(label('Start something','vela-caption'));
            const presets=box(false,'vela-presets',8);
            for(const minutes of [5,15,25])presets.append(textButton(`${minutes} min`,()=>command('timer','start',minutes*60),'vela-preset'));
            launcher.append(presets);launcher.append(textButton('Start a stopwatch',()=>command('stopwatch','start'),'vela-stopwatch-launch'));card.append(launcher);
        } else card.append(textButton('+  New activity',()=>{launcherOpen=!launcherOpen;renderCard();},'vela-new-activity'));
    }
    refs.title.label=p.type==='timer' ? (p.state==='completed'?'A moment well spent':'Time to focus') : p.title;
    refs.detail.label=p.subtitle;if(refs.metric)refs.metric.label=p.metric;
    refs.progress.fraction=p.progress;refs.progress.visible=a?.progress!==null && a?.progress!==undefined;
    if(refs.art) {
        const uri=a?.icon?.startsWith('file://') ? a.icon : here.get_parent().get_child('extension/assets/orbit.svg').get_uri();
        if(refs.artUri!==uri) {refs.artUri=uri;refs.art.set_file(Gio.File.new_for_uri(uri));}
        refs.source.label=p.source;refs.elapsed.label=p.elapsed;refs.duration.label=p.duration;
    }
}
app.connect('activate',()=>{
    if(!Layer.is_supported()){printerr('This compositor does not advertise zwlr_layer_shell_v1. Use the GNOME extension.');app.quit();return;}
    window=new Gtk.ApplicationWindow({application:app,title:'VelaPulse',decorated:false,resizable:false,css_classes:['vela-window']});
    Layer.init_for_window(window);Layer.set_namespace(window,'velapulse');Layer.set_layer(window,Layer.Layer.TOP);Layer.set_exclusive_zone(window,0);Layer.set_keyboard_mode(window,Layer.KeyboardMode.NONE);
    root=box(true,'vela-root',10);window.set_child(root);
    pill=box(false,'vela-pill',3);pill.halign=Gtk.Align.CENTER;
    const main=new Gtk.Button({css_classes:['vela-pill-main'],hexpand:true});main.connect('clicked',()=>setExpanded(!expanded));
    const summary=box(false,'vela-pill-summary',10),well=new Gtk.CenterBox({css_classes:['vela-well'],valign:Gtk.Align.CENTER});
    pillIcon=new Gtk.Image({icon_name:'weather-clear-night-symbolic',pixel_size:17,halign:Gtk.Align.CENTER,valign:Gtk.Align.CENTER});well.set_center_widget(pillIcon);summary.append(well);
    const lines=box(true);lines.hexpand=true;lines.valign=Gtk.Align.CENTER;
    pillTitle=label('VelaPulse','vela-pill-title');pillDetail=label('Ready when you are','vela-pill-detail');lines.append(pillTitle);lines.append(pillDetail);summary.append(lines);main.set_child(summary);pill.append(main);
    pillControls=box(false,'vela-inline-controls',1);pillControls.valign=Gtk.Align.CENTER;pill.append(pillControls);root.append(pill);
    revealer=new Gtk.Revealer({transition_type:Gtk.RevealerTransitionType.SLIDE_DOWN});card=box(true,'vela-card',12);revealer.set_child(card);root.append(revealer);
    const css=new Gtk.CssProvider();css.load_from_file(here.get_child('style.css'));Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),css,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const keys=new Gtk.EventControllerKey();keys.connect('key-pressed',(_,key)=>{if(key===Gdk.KEY_Escape){setExpanded(false);return true;}return false;});window.add_controller(keys);
    const focus=new Gtk.EventControllerFocus();focus.connect('leave',()=>setExpanded(false));window.add_controller(focus);
    monitorSignal=Gdk.Display.get_default().get_monitors().connect('items-changed',position);
    proxy=Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION,Gio.DBusProxyFlags.NONE,null,BUS,PATH,IFACE,null);
    const refresh=()=>{if(proxy.g_name_owner)call('Snapshot','()',[],([json])=>render(json));else {state.activities=[];render(JSON.stringify(state));pillDetail.label='Start the VelaPulse service';}};
    signal=proxy.connect('g-signal',(_,__,name,args)=>{if(name==='Changed')render(args.deep_unpack()[0]);});ownerSignal=proxy.connect('notify::g-name-owner',refresh);
    refresh();position();window.present();
});
app.connect('shutdown',()=>{if(signal)proxy.disconnect(signal);if(ownerSignal)proxy.disconnect(ownerSignal);if(monitorSignal)Gdk.Display.get_default().get_monitors().disconnect(monitorSignal);});
app.run([]);
