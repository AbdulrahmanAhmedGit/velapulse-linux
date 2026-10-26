import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {present, SIZES} from './presentation.js';

export function fillPreferences(window) {
    window.set_default_size(860, 680);
    window.set_title('VelaPulse preferences');
    window.set_search_enabled(true);
    let config = {}, syncing = false, proxy, signal, ownerSignal, pending, closed = false;
    const rows = {};
    const css = new Gtk.CssProvider();
    css.load_from_string('.vela-preview {background: #14151e; color: #f4f2f8; border-radius: 28px; padding: 12px 18px; margin: 22px 28px;} .vela-preview .preview-title {font-size: 14px; font-weight: 700;} .vela-preview .preview-detail {font-size: 11px; color: #a8a3b9;} .vela-preview .preview-icon {color: #b5a4f5; margin-right: 12px;} .vela-preview-light {background: #e9e5f1; color: #252431;} .vela-preview-light .preview-detail {color: #777084;} .vela-preview-title {font-size: 24px; font-weight: 700; margin-top: 10px;} .vela-preview-caption {color: #9c95ab; margin-bottom: 6px;}');
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const appearance = new Adw.PreferencesPage({title: 'Appearance', icon_name: 'preferences-desktop-appearance-symbolic'});
    const previewGroup = new Adw.PreferencesGroup();
    const previewBox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    previewBox.append(new Gtk.Label({label: 'A little space for what matters', css_classes: ['vela-preview-title']}));
    previewBox.append(new Gtk.Label({label: 'Changes appear on your desktop as you make them.', css_classes: ['vela-preview-caption']}));
    const preview = new Gtk.Box({css_classes: ['vela-preview'], halign: Gtk.Align.CENTER});
    const previewIcon = new Gtk.Image({icon_name: 'weather-clear-night-symbolic', pixel_size: 22, css_classes: ['preview-icon']}); preview.append(previewIcon);
    const texts = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.CENTER});
    const title = new Gtk.Label({label: 'VelaPulse', xalign: 0, ellipsize: 3, max_width_chars: 26, css_classes: ['preview-title']});
    const detail = new Gtk.Label({label: 'Waiting for the service', xalign: 0, ellipsize: 3, max_width_chars: 32, css_classes: ['preview-detail']});
    texts.append(title); texts.append(detail); preview.append(texts); previewBox.append(preview); previewGroup.add(previewBox); appearance.add(previewGroup);
    const surfaces = new Adw.PreferencesGroup({title: 'Make it yours', description: 'Choose the size, position and finish of your live activities.'}); appearance.add(surfaces);
    const choices = (name, label, values, labels, description = '') => {
        const row = new Adw.ComboRow({title: label, subtitle: description, model: Gtk.StringList.new(labels)});
        rows[name] = {row, values};
        row.connect('notify::selected', () => {if (!syncing) save({[name]: values[row.selected]});});
        surfaces.add(row);
    };
    choices('appearance', 'Appearance', ['dark', 'light'], ['Midnight', 'Daylight']);
    choices('position', 'Position', ['top', 'bottom'], ['Top of screen', 'Bottom of screen']);
    choices('size', 'Pill size', ['small', 'medium', 'large'], ['Compact', 'Balanced', 'Roomy']);
    const opacity = new Adw.ActionRow({title: 'Opacity', subtitle: 'Keep text comfortable to read against your wallpaper.'});
    const opacityScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 65, 100, 1);
    opacityScale.set_size_request(180, -1); opacityScale.set_draw_value(true); opacityScale.set_value_pos(Gtk.PositionType.RIGHT); opacityScale.set_valign(Gtk.Align.CENTER);
    opacity.add_suffix(opacityScale); surfaces.add(opacity);
    opacityScale.connect('value-changed', () => {
        if (syncing) return;
        if (pending) GLib.Source.remove(pending);
        pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 160, () => {pending = 0;save({opacity: Math.round(opacityScale.get_value())});return GLib.SOURCE_REMOVE;});
    });
    const motion = new Adw.SwitchRow({title: 'Animations', subtitle: 'Gentle movement when a card opens or closes.'}); surfaces.add(motion);
    motion.connect('notify::active', () => {if (!syncing) save({animations: motion.active});});
    const activities = new Adw.PreferencesPage({title: 'Activities', icon_name: 'view-grid-symbolic'});
    const providers = new Adw.PreferencesGroup({title: 'Your live activities', description: 'Show the things you want to keep close.'}); activities.add(providers);
    const switches = new Map();
    for (const [id, label, description, icon] of [
        ['media','Music and media','Track information and playback controls','multimedia-player-symbolic'],
        ['timer','Timers','A countdown for a little focus','alarm-symbolic'],
        ['stopwatch','Stopwatch','Keep track of elapsed time','preferences-system-time-symbolic'],
        ['battery','Battery','Charge level and power status','battery-good-symbolic'],
        ['volume','Audio','The volume of your default output','audio-volume-high-symbolic'],
    ]) {
        const row = new Adw.SwitchRow({title: label, subtitle: description});row.add_prefix(new Gtk.Image({icon_name: icon}));
        row.connect('notify::active', () => {if (!syncing) {const enabled = new Set(config.enabled ?? []);if (row.active) enabled.add(id);else enabled.delete(id);save({enabled: [...enabled]});}});
        providers.add(row); switches.set(id, row);
    }
    const general = new Adw.PreferencesPage({title: 'General', icon_name: 'emblem-system-symbolic'});
    const startup = new Adw.PreferencesGroup({title: 'Ready when you are'}); general.add(startup);
    const autostart = new Adw.SwitchRow({title: 'Start at login', subtitle: 'Keep the activity service ready in the background.'}); startup.add(autostart);
    autostart.connect('notify::active', () => {if (!syncing) save({autostart: autostart.active});});
    const display = new Adw.PreferencesGroup({title: 'Display'}); general.add(display);
    const monitor = new Adw.ComboRow({title: 'Show activities on', model: Gtk.StringList.new(['Default display', ...Array.from({length: Gdk.Display.get_default().get_monitors().get_n_items()}, (_,i) => `Display ${i + 1}`)])});
    monitor.connect('notify::selected', () => {if (!syncing) save({monitor: monitor.selected - 1});}); display.add(monitor);
    const info = new Adw.PreferencesGroup({title: 'VelaPulse', description: 'Independent native live activities for Linux. Original design, MIT licensed.'}); general.add(info);
    const statusRow = new Adw.ActionRow({title: 'Activity service', subtitle: 'Connecting…'}); info.add(statusRow);
    const website = new Adw.ActionRow({title: 'Project and source', subtitle: 'github.com/AbdulrahmanAhmedGit/velapulse-linux', activatable: true});website.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));website.connect('activated', () => Gio.AppInfo.launch_default_for_uri_async('https://github.com/AbdulrahmanAhmedGit/velapulse-linux',null,null,()=>{}));info.add(website);
    window.add(appearance); window.add(activities); window.add(general);
    function save(patch) {
        if (!proxy?.g_name_owner) {statusRow.subtitle = 'Start the VelaPulse service to change settings.';return;}
        config = {...config, ...patch};
        proxy.call('Configure',new GLib.Variant('(s)',[JSON.stringify(config)]),Gio.DBusCallFlags.NONE,3000,null,(p,r)=>{
            try {p.call_finish(r);statusRow.subtitle = 'Connected · settings saved';} catch (e) {statusRow.subtitle = 'Settings could not be saved';refresh();}
        });
    }
    function update(json) {
        if (closed) return;
        let snapshot;try {snapshot = JSON.parse(json);} catch {return;}
        config = snapshot.config; syncing = true;
        for (const [key,{row, values}] of Object.entries(rows)) row.selected = Math.max(0,values.indexOf(config[key]));
        opacityScale.set_value(config.opacity ?? 98);motion.active = config.animations;autostart.active = config.autostart;
        monitor.selected = config.monitor + 1;
        for (const [id,row] of switches) row.active = config.enabled.includes(id);
        syncing = false;
        preview.set_css_classes(['vela-preview', ...(config.appearance === 'light' ? ['vela-preview-light'] : [])]);
        const p = present(snapshot.activities[0]);title.label = p.compact;detail.label = p.detail;previewIcon.icon_name = p.type === 'media' ? 'media-playback-start-symbolic' : p.icon;
        const size = SIZES[config.size] ?? SIZES.medium;preview.set_size_request(size.pill - 40, -1);preview.opacity = (config.opacity ?? 98)/100;
        statusRow.subtitle = 'Connected · changes apply immediately';
        Adw.StyleManager.get_default().color_scheme = config.appearance === 'light' ? Adw.ColorScheme.FORCE_LIGHT : Adw.ColorScheme.FORCE_DARK;
    }
    function refresh() {
        if (!proxy?.g_name_owner) {statusRow.subtitle = 'Service unavailable · start VelaPulse and try again';detail.label = 'Service unavailable';return;}
        proxy.call('Snapshot',null,Gio.DBusCallFlags.NONE,3000,null,(p,r)=>{try {update(p.call_finish(r).deep_unpack()[0]);} catch {statusRow.subtitle='Service unavailable';}});
    }
    Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION,Gio.DBusProxyFlags.NONE,null,'io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1',null,(_,result)=>{
        if (closed) return;
        try {proxy = Gio.DBusProxy.new_for_bus_finish(result);} catch {statusRow.subtitle='Service unavailable';return;}
        signal = proxy.connect('g-signal',(_,__,name,args)=>{if(name==='Changed')update(args.deep_unpack()[0]);});
        ownerSignal = proxy.connect('notify::g-name-owner',refresh);refresh();
    });
    window.connect('close-request',()=>{closed=true;if(signal)proxy.disconnect(signal);if(ownerSignal)proxy.disconnect(ownerSignal);if(pending)GLib.Source.remove(pending);Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(),css);return false;});
}
