#!/usr/bin/gjs -m
// Original GTK4 renderer. Requires gtk4-layer-shell 1.x introspection at runtime.
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Layer from 'gi://Gtk4LayerShell';
const BUS = 'io.github.velapulse.Service';
const PATH = '/io/github/velapulse/Service';
const IFACE = 'io.github.velapulse.Service1';
const app = new Gtk.Application({application_id: 'io.github.velapulse.LayerShell'});
let proxy, window, pill, card, title, detail, progress, artwork, controls, state, selected, expanded = false;
let signal = 0, monitorSignal = 0, lastMonitor, lastPosition;
function call(method, signature, args, done = () => {}) {
    proxy.call(method, new GLib.Variant(signature,args), Gio.DBusCallFlags.NONE, 3000, null, (p,r) => {
        try {done(p.call_finish(r).deep_unpack());} catch (e) {pill.label = 'VelaPulse · Service unavailable';}
    });
}
function button(label, action) {const b = new Gtk.Button({label});b.connect('clicked', action);return b;}
function position() {
    const monitors = Gdk.Display.get_default().get_monitors();
    const index = state?.config.monitor ?? -1;
    if (monitors.get_n_items()) {const m = monitors.get_item(index >= 0 && index < monitors.get_n_items() ? index : 0);if (m !== lastMonitor) {Layer.set_monitor(window,m);lastMonitor=m;}}
    const bottom = state?.config.position === 'bottom';
    if (lastPosition === bottom) return;
    lastPosition = bottom;
    Layer.set_anchor(window, Layer.Edge.TOP, !bottom);
    Layer.set_anchor(window, Layer.Edge.BOTTOM, bottom);
    Layer.set_margin(window, Layer.Edge.TOP, 28);
    Layer.set_margin(window, Layer.Edge.BOTTOM, 28);
}
function render(json) {
    const oldTop = state?.activities[0]?.id;
    try {state = JSON.parse(json);} catch {return;}
    if ((!expanded && oldTop !== state.activities[0]?.id) || !state.activities.some(a => a.id === selected)) selected = state.activities[0]?.id;
    const a = state.activities.find(a => a.id === selected);
    pill.label = a ? `◈  ${a.title.slice(0,40)} · ${['timer','stopwatch'].includes(a.id) ? a.description : a.status}` : '◈  VelaPulse · Ready';
    title.label = a?.title ?? 'A little space for what matters';
    detail.label = a?.description ?? 'Start a timer or stopwatch below';
    progress.fraction = a?.progress ?? 0;
    if (artwork._uri !== a?.icon) {artwork._uri = a?.icon;artwork.clear();if (a?.icon?.startsWith('file://')) {const path=Gio.File.new_for_uri(a.icon).get_path();if(path)artwork.set_from_file(path);}}
    const key = JSON.stringify([a?.id,a?.controls,state.activities.map(a=>a.id)]);
    if (controls._key !== key) {
        controls._key = key;
        while (controls.get_first_child()) controls.remove(controls.get_first_child());
        for (const action of a?.controls ?? []) controls.append(button(action, () => call('Command','(sst)',[a.id,action,0])));
        if (state.activities.length > 1) controls.append(button('Next activity', () => {selected = state.activities[(state.activities.findIndex(x=>x.id===selected)+1)%state.activities.length].id;render(JSON.stringify(state));}));
    }
    window.set_css_classes(state.config.appearance === 'light' ? ['vela','light'] : ['vela']);
    card.transition_duration = state.config.animations ? 220 : 0;
    position();
}
app.connect('activate', () => {
    if (!Layer.is_supported()) {printerr('The compositor does not advertise zwlr_layer_shell_v1. Use the GNOME extension on this session.');app.quit();return;}
    window = new Gtk.ApplicationWindow({application:app, title:'VelaPulse', decorated:false, resizable:false});
    Layer.init_for_window(window);
    Layer.set_namespace(window,'velapulse');
    Layer.set_layer(window,Layer.Layer.TOP);
    Layer.set_exclusive_zone(window,0);
    Layer.set_keyboard_mode(window,Layer.KeyboardMode.NONE);
    const box = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:8});window.set_child(box);
    pill = button('◈  VelaPulse', () => {
        expanded = !expanded;card.reveal_child = expanded;
        Layer.set_keyboard_mode(window, expanded ? Layer.KeyboardMode.ON_DEMAND : Layer.KeyboardMode.NONE);
    });box.append(pill);
    card = new Gtk.Revealer({transition_type:Gtk.RevealerTransitionType.SLIDE_DOWN});box.append(card);
    const inner = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:14,margin_top:20,margin_bottom:20,margin_start:20,margin_end:20});card.set_child(inner);
    inner.append(new Gtk.Label({label:'VELAPULSE',xalign:0,css_classes:['eyebrow']}));
    title = new Gtk.Label({label:'Ready',xalign:0,ellipsize:3,max_width_chars:32,css_classes:['title']});inner.append(title);
    detail = new Gtk.Label({xalign:0,ellipsize:3,max_width_chars:40});inner.append(detail);
    artwork = new Gtk.Image({pixel_size:64});inner.append(artwork);
    progress = new Gtk.ProgressBar();inner.append(progress);
    controls = new Gtk.Box({spacing:6});inner.append(controls);
    const start = new Gtk.Box({spacing:6});
    for (const [label,id,seconds] of [['5 min','timer',300],['25 min','timer',1500],['Stopwatch','stopwatch',0]]) start.append(button(label,()=>call('Command','(sst)',[id,'start',seconds])));
    inner.append(start);
    const settings = new Gtk.Box({spacing:6});
    const configure = patch => call('Configure','(s)',[JSON.stringify({...state.config,...patch})]);
    settings.append(button('Theme',()=>configure({appearance:state.config.appearance==='light'?'dark':'light'})));
    settings.append(button('Position',()=>configure({position:state.config.position==='top'?'bottom':'top'})));
    settings.append(button('Motion',()=>configure({animations:!state.config.animations})));
    inner.append(settings);
    inner.append(button('Close',()=>{expanded=false;card.reveal_child=false;Layer.set_keyboard_mode(window,Layer.KeyboardMode.NONE);}));
    const keys = new Gtk.EventControllerKey();keys.connect('key-pressed',(_,key)=>{if(key===Gdk.KEY_Escape){expanded=false;card.reveal_child=false;Layer.set_keyboard_mode(window,Layer.KeyboardMode.NONE);return true;}return false;});window.add_controller(keys);
    const focus = new Gtk.EventControllerFocus();focus.connect('leave',()=>{expanded=false;card.reveal_child=false;Layer.set_keyboard_mode(window,Layer.KeyboardMode.NONE);});window.add_controller(focus);
    const css = new Gtk.CssProvider();css.load_from_string('window.vela {background: #132222; color: #f4f1e9; border: 1px solid #49625c; border-radius: 26px;} window.vela button {background: #2b403b; color: #f4f1e9; border-radius: 20px; padding: 10px 14px;} .title {font-size: 23px; font-weight: bold;} .eyebrow {font-size: 10px; color: #9bc7b7;} progress {background: #a0edc9;} window.light {background: #f6f3e9; color: #182b27;} window.light button {background: #dce7db; color: #182b27;}');Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),css,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    monitorSignal = Gdk.Display.get_default().get_monitors().connect('items-changed',position);
    proxy = Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION,Gio.DBusProxyFlags.NONE,null,BUS,PATH,IFACE,null);
    signal = proxy.connect('g-signal',(_,__,name,args)=>{if(name==='Changed')render(args.deep_unpack()[0]);});
    proxy.connect('notify::g-name-owner',()=>{if(proxy.g_name_owner)call('Snapshot','()',[],([json])=>render(json));else pill.label='VelaPulse · Service unavailable';});
    call('Snapshot','()',[],([json])=>render(json));position();window.present();
});
app.connect('shutdown',()=>{if(signal)proxy.disconnect(signal);if(monitorSignal)Gdk.Display.get_default().get_monitors().disconnect(monitorSignal);});
app.run([]);
