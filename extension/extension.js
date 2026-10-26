import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const BUS = 'io.github.velapulse.Service';
const PATH = '/io/github/velapulse/Service';
const IFACE = 'io.github.velapulse.Service1';
const XML = `<node><interface name="${IFACE}"><method name="Snapshot"><arg direction="out" type="s"/></method><method name="Command"><arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="in" type="t"/></method><method name="Configure"><arg direction="in" type="s"/></method><signal name="Changed"><arg type="s"/></signal></interface></node>`;
const Proxy = Gio.DBusProxy.makeProxyWrapper(XML);
export default class VelaPulse extends Extension {
    enable() {
        this._alive = true;
        this._expanded = false;
        this._selected = null;
        this._state = {activities: [], config: {}};
        this._root = new St.BoxLayout({vertical: true, style_class: 'vela-root', reactive: true});
        this._pill = new St.Button({style_class: 'vela-pill', can_focus: true, reactive: true, accessible_name: 'Open VelaPulse activities'});
        this._label = new St.Label({text: '◈  VelaPulse', y_align: Clutter.ActorAlign.CENTER});
        this._pill.set_child(this._label);
        this._root.add_child(this._pill);
        this._card = new St.BoxLayout({vertical: true, style_class: 'vela-card'});
        this._root.add_child(this._card);
        this._card.hide();
        this._pill.connect('clicked', () => this._expand(!this._expanded));
        this._root.connect('key-press-event', (_, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {this._expand(false); return Clutter.EVENT_STOP;}
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addChrome(this._root, {affectsStruts: false, trackFullscreen: true});
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._sizeSignal = this._root.connect('notify::allocation', () => this._position());
        this._outsideSignal = global.stage.connect('captured-event', (_, event) => {
            if (this._expanded && event.type() === Clutter.EventType.BUTTON_PRESS) {
                const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ...event.get_coords());
                if (actor && !this._root.contains(actor)) this._expand(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._proxy = new Proxy(Gio.DBus.session, BUS, PATH, (proxy, error) => {
            if (!this._alive) return;
            if (error) {this._label.text = '◈  Service unavailable'; return;}
            this._signal = proxy.connectSignal('Changed', (_, __, [json]) => this._update(json));
            this._ownerSignal = proxy.connect('notify::g-name-owner', () => this._refresh());
            this._refresh();
        });
        this._clockSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            if (this._expanded) {this._clockLabel.text = GLib.DateTime.new_now_local().format('%H:%M');}
            return GLib.SOURCE_CONTINUE;
        });
        this._position();
    }
    _refresh() {
        if (!this._proxy?.g_name_owner) {this._label.text = '◈  Start VelaPulse service';this._state.activities = [];this._renderCard();return;}
        this._proxy.SnapshotRemote((result, error) => {if (this._alive && !error) this._update(result[0]);});
    }
    _update(json) {
        const oldTop = this._state.activities[0]?.id;
        try {this._state = JSON.parse(json);} catch {return;}
        if ((!this._expanded && oldTop !== this._state.activities[0]?.id) || !this._state.activities.some(a => a.id === this._selected)) this._selected = this._state.activities[0]?.id;
        const a = this._current();
        this._label.text = a ? `◈  ${a.title.slice(0, 36)}  ·  ${a.id === 'timer' || a.id === 'stopwatch' ? a.description : a.status}` : '◈  VelaPulse  ·  Ready';
        this._root.set_style_class_name(`vela-root ${this._state.config.appearance === 'light' ? 'vela-light' : ''}`);
        this._renderCard(); this._position();
    }
    _current() {return this._state.activities.find(a => a.id === this._selected);}
    _button(text, fn) {const b = new St.Button({label: text, style_class: 'vela-button', reactive: true, can_focus: true});b.connect('clicked', fn);return b;}
    _command(id, action, seconds = 0) {this._proxy?.CommandRemote(id, action, seconds, (_, error) => {if (error && this._alive) this._label.text = '◈  Action unavailable';});}
    _configure(patch) {this._proxy?.ConfigureRemote(JSON.stringify({...this._state.config, ...patch}), (_, error) => {if (error && this._alive) this._label.text = '◈  Settings could not be saved';});}
    _renderCard() {
        if (!this._expanded) return;
        // Preserve actors and keyboard focus during per-second updates.
        const a = this._current();
        const key = JSON.stringify([a?.id,a?.controls,this._state.activities.map(a => a.id),this._state.config]);
        if (key === this._cardKey) {this._title.text = a?.title ?? 'A little space for what matters';this._detail.text = a?.description ?? 'Start a timer or keep track of your time.';this._progress.width = Math.round(300 * (a?.progress ?? 0));return;}
        this._cardKey = key;
        this._card.destroy_all_children();
        const top = new St.BoxLayout({style_class: 'vela-row'});
        top.add_child(new St.Label({text: 'VELAPULSE', style_class: 'vela-eyebrow', x_expand: true}));
        this._clockLabel = new St.Label({text: GLib.DateTime.new_now_local().format('%H:%M'), style_class: 'vela-eyebrow'});top.add_child(this._clockLabel);
        top.add_child(this._button('×', () => this._expand(false)));this._card.add_child(top);
        this._title = new St.Label({text: a?.title ?? 'A little space for what matters', style_class: 'vela-title'});this._title.clutter_text.set_ellipsize(3);this._card.add_child(this._title);
        this._detail = new St.Label({text: a?.description ?? 'Start a timer or keep track of your time.', style_class: 'vela-detail'});this._detail.clutter_text.set_ellipsize(3);this._card.add_child(this._detail);
        if (a?.icon?.startsWith('file://')) {
            try {const file = Gio.File.new_for_uri(a.icon);this._card.add_child(new St.Icon({gicon: new Gio.FileIcon({file}), icon_size: 64}));} catch {/* optional artwork */}
        }
        const track = new St.BoxLayout({style_class: 'vela-track', x_align: Clutter.ActorAlign.START, width: 300});
        this._progress = new St.Widget({style_class: 'vela-progress', height: 4, width: Math.round(300 * (a?.progress ?? 0)), x_align: Clutter.ActorAlign.START});track.add_child(this._progress);this._card.add_child(track);
        const controls = new St.BoxLayout({style_class: 'vela-row'});
        for (const action of a?.controls ?? []) controls.add_child(this._button(action, () => this._command(a.id, action)));
        if (this._state.activities.length > 1) controls.add_child(this._button('Next activity →', () => {const items = this._state.activities;this._selected = items[(items.findIndex(x => x.id === this._selected) + 1) % items.length].id;this._renderCard();}));
        this._card.add_child(controls);
        const start = new St.BoxLayout({style_class: 'vela-row'});
        start.add_child(this._button('5 min', () => this._command('timer', 'start', 300)));
        start.add_child(this._button('25 min', () => this._command('timer', 'start', 1500)));
        start.add_child(this._button('Stopwatch', () => this._command('stopwatch', 'start')));this._card.add_child(start);
        const settings = new St.BoxLayout({style_class: 'vela-row'});
        settings.add_child(this._button('◐ Theme', () => this._configure({appearance: this._state.config.appearance === 'light' ? 'dark' : 'light'})));
        settings.add_child(this._button('↕ Position', () => this._configure({position: this._state.config.position === 'bottom' ? 'top' : 'bottom'})));
        settings.add_child(this._button('Motion', () => this._configure({animations: !this._state.config.animations})));
        this._card.add_child(settings);
        this._card.add_child(this._button(this._state.config.autostart ? 'Autostart: on' : 'Autostart: off', () => this._configure({autostart: !this._state.config.autostart})));
    }
    _expand(open) {
        this._expanded = open;
        this._card.remove_all_transitions();
        if (open) {this._card.show();this._renderCard();this._card.opacity = 0;this._card.translation_y = -6;this._card.ease({opacity: 255, translation_y: 0, duration: this._state.config.animations ? 220 : 0, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});}
        else {this._card.ease({opacity: 0, translation_y: -6, duration: this._state.config.animations ? 140 : 0, mode: Clutter.AnimationMode.EASE_OUT_CUBIC, onComplete: () => {if (!this._expanded && this._alive) {this._card.hide();this._cardKey = null;this._position();}}});}
        this._position();
    }
    _position() {
        if (!this._root) return;
        const monitors = Main.layoutManager.monitors;
        const m = monitors[this._state.config.monitor] ?? Main.layoutManager.primaryMonitor;
        if (!m) return;
        const width = this._expanded ? Math.min(364, m.width - 32) : Math.min(330, m.width - 32);
        this._root.width = width;
        const x = Math.round(m.x + (m.width - width) / 2);
        const y = this._state.config.position === 'bottom' ? Math.round(m.y + m.height - this._root.height - 32) : m.y + 48;
        if (this._root.x !== x || this._root.y !== y) this._root.set_position(x,y);
    }
    disable() {
        this._alive = false;
        if (this._clockSource) GLib.Source.remove(this._clockSource);
        this._clockSource = null;
        if (this._signal) this._proxy.disconnectSignal(this._signal);
        if (this._ownerSignal) this._proxy.disconnect(this._ownerSignal);
        if (this._monitorSignal) Main.layoutManager.disconnect(this._monitorSignal);
        if (this._outsideSignal) global.stage.disconnect(this._outsideSignal);
        this._root?.destroy();this._root = null;this._proxy = null;
        this._signal = this._ownerSignal = this._monitorSignal = this._outsideSignal = null;
        this._cardKey = null;
    }
}
