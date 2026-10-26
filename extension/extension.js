import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {present, kind, actionInfo, SIZES} from './presentation.js';

const BUS = 'io.github.velapulse.Service';
const PATH = '/io/github/velapulse/Service';
const XML = `<node><interface name="io.github.velapulse.Service1"><method name="Snapshot"><arg direction="out" type="s"/></method><method name="Command"><arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="in" type="t"/></method><signal name="Changed"><arg type="s"/></signal></interface></node>`;
const Proxy = Gio.DBusProxy.makeProxyWrapper(XML);
const CENTER = Clutter.ActorAlign.CENTER;

export default class VelaPulse extends Extension {
    enable() {
        this._alive = true;
        this._expanded = false;
        this._launcherOpen = false;
        this._state = {activities: [], config: {}};
        this._selected = null;
        this._root = new St.BoxLayout({vertical: true, style_class: 'vela-root', reactive: true});
        this._pill = new St.BoxLayout({style_class: 'vela-pill', x_align: CENTER, y_align: CENTER});
        this._pillMain = new St.Button({style_class: 'vela-pill-main', x_expand: true, can_focus: true, accessible_name: 'Expand live activity'});
        const summary = new St.BoxLayout({style_class: 'vela-pill-summary'});
        this._pillWell = new St.Bin({style_class: 'vela-well', y_align: CENTER});
        this._pillIcon = new St.Icon({icon_name: 'weather-clear-night-symbolic', icon_size: 17});
        this._pillWell.set_child(this._pillIcon); summary.add_child(this._pillWell);
        const lines = new St.BoxLayout({vertical: true, x_expand: true, y_align: CENTER});
        this._pillTitle = this._label('VelaPulse', 'vela-pill-title');
        this._pillDetail = this._label('Ready when you are', 'vela-pill-detail');
        lines.add_child(this._pillTitle); lines.add_child(this._pillDetail); summary.add_child(lines);
        this._pillMain.set_child(summary); this._pill.add_child(this._pillMain);
        this._pillControls = new St.BoxLayout({style_class: 'vela-inline-controls', y_align: CENTER});
        this._pill.add_child(this._pillControls);
        this._root.add_child(this._pill);
        this._card = new St.BoxLayout({vertical: true, style_class: 'vela-card'});
        this._root.add_child(this._card); this._card.hide();
        this._pillMain.connect('clicked', () => this._expand(!this._expanded));
        this._root.connect('key-press-event', (_, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {this._expand(false); return Clutter.EVENT_STOP;}
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addChrome(this._root, {affectsStruts: false, trackFullscreen: true});
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._position());
        this._root.connect('notify::allocation', () => this._position());
        this._outsideSignal = global.stage.connect('captured-event', (_, event) => {
            if (this._expanded && event.type() === Clutter.EventType.BUTTON_PRESS) {
                const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ...event.get_coords());
                if (actor && !this._root.contains(actor)) this._expand(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._proxy = new Proxy(Gio.DBus.session, BUS, PATH, (proxy, error) => {
            if (!this._alive) return;
            if (error) {this._error('Service unavailable'); return;}
            this._signal = proxy.connectSignal('Changed', (_, __, [json]) => this._update(json));
            this._ownerSignal = proxy.connect('notify::g-name-owner', () => this._refresh());
            this._refresh();
        });
        this._position();
    }
    _label(text, style, expand = false) {
        const label = new St.Label({text, style_class: style, x_expand: expand, y_align: CENTER});
        label.clutter_text.set_ellipsize(3);
        return label;
    }
    _iconButton(icon, name, action, style = '') {
        const button = new St.Button({style_class: `vela-icon-button ${style}`, can_focus: true, accessible_name: name});
        button.set_child(new St.Icon({icon_name: icon, icon_size: style.includes('primary') ? 24 : 17}));
        button.connect('clicked', action); return button;
    }
    _textButton(text, action, style = '') {
        const button = new St.Button({label: text, style_class: `vela-text-button ${style}`, can_focus: true});
        button.connect('clicked', action); return button;
    }
    _current() {return this._state.activities.find(a => a.id === this._selected);}
    _error(message) {if (this._alive) this._pillDetail.text = message;}
    _refresh() {
        if (!this._proxy?.g_name_owner) {
            this._state.activities = []; this._update(JSON.stringify(this._state));
            this._error('Start the VelaPulse service'); return;
        }
        this._proxy.SnapshotRemote((result, error) => {if (this._alive && !error) this._update(result[0]);});
    }
    _command(id, action, seconds = 0) {
        if (action === 'start') {this._selected = id; this._launcherOpen = false;}
        this._proxy?.CommandRemote(id, action, seconds, (_, error) => {if (error) this._error('This control is unavailable');});
    }
    _update(json) {
        const oldTop = this._state.activities[0]?.id;
        try {this._state = JSON.parse(json);} catch {return;}
        const activities = this._state.activities;
        if ((!this._expanded && oldTop !== activities[0]?.id) || !activities.some(a => a.id === this._selected)) this._selected = activities[0]?.id;
        const a = this._current(), p = present(a), config = this._state.config;
        this._root.set_style_class_name(`vela-root ${config.appearance === 'light' ? 'vela-light' : ''} vela-${p.type}`);
        this._root.opacity = Math.round((config.opacity ?? 98) * 2.55);
        this._pillWell.set_style(`background-color: ${p.tint}; color: ${p.accent};`);
        this._pillIcon.icon_name = p.icon;
        this._pillTitle.text = p.compact;
        this._pillDetail.text = p.detail;
        const key = JSON.stringify([a?.id, a?.controls, a?.status]);
        if (key !== this._pillKey) {
            this._pillKey = key; this._pillControls.destroy_all_children();
            const actions = p.type === 'media' ? (a.controls ?? []) : (a?.controls ?? []).filter(c => c !== 'reset');
            for (const action of actions) {
                const [icon, name] = actionInfo(action, a.status);
                this._pillControls.add_child(this._iconButton(icon, name, () => this._command(a.id, action), 'vela-inline'));
            }
        }
        this._renderCard(); this._position();
    }
    _renderCard() {
        if (!this._expanded) return;
        const a = this._current(), p = present(a);
        const key = JSON.stringify([a?.id, a?.controls, a?.status, this._state.activities.map(a => a.id), this._launcherOpen]);
        if (key !== this._cardKey) {
            this._cardKey = key;
            this._card.destroy_all_children();
            this._artUri = null;
            const header = new St.BoxLayout({style_class: 'vela-card-header'});
            const tag = new St.BoxLayout({style_class: 'vela-tag', x_expand: true, y_align: CENTER});
            tag.add_child(new St.Icon({icon_name: p.icon, icon_size: 13, style: `color: ${p.accent};`}));
            tag.add_child(this._label(p.label, 'vela-caption'));
            header.add_child(tag);
            header.add_child(this._iconButton('emblem-system-symbolic', 'Preferences', () => {this._expand(false);this.openPreferences().catch(() => this._error('Preferences could not be opened'));}, 'vela-quiet'));
            header.add_child(this._iconButton('window-close-symbolic', 'Collapse activity', () => this._expand(false), 'vela-quiet'));
            this._card.add_child(header);
            if (p.type === 'media') this._buildMedia(p);
            else if (['timer', 'stopwatch', 'battery', 'volume'].includes(p.type)) this._buildMetric(p);
            else this._buildSummary(p);
            if (a?.controls?.length) {
                const transport = new St.BoxLayout({style_class: 'vela-transport', x_align: CENTER});
                const ordered = p.type === 'timer' || p.type === 'stopwatch' ? [...a.controls].reverse() : a.controls;
                for (const action of ordered) {
                    const [icon, name] = actionInfo(action, a.status);
                    const primary = ['PlayPause', 'pause', 'resume'].includes(action);
                    transport.add_child(this._iconButton(icon, name, () => this._command(a.id, action), primary ? 'vela-primary' : 'vela-secondary'));
                }
                this._card.add_child(transport);
            }
            if (this._state.activities.length > 1) {
                const rail = new St.BoxLayout({style_class: 'vela-activity-rail', x_align: CENTER});
                for (const activity of this._state.activities.slice(0, 5)) {
                    const q = present(activity);
                    rail.add_child(this._iconButton(q.icon, `Show ${activity.title}`, () => {this._select(activity.id);}, activity.id === a?.id ? 'vela-rail-selected' : 'vela-rail-item'));
                }
                this._card.add_child(rail);
            }
            if (!a || this._launcherOpen) this._buildLauncher();
            else this._card.add_child(this._textButton('+  New activity', () => {this._launcherOpen = !this._launcherOpen;this._renderCard();}, 'vela-new-activity'));
        }
        this._updateCard(p, a);
    }
    _select(id) {
        if (id === this._selected) return;
        this._card.remove_all_transitions();
        const change = () => {
            if (!this._alive) return;
            this._selected = id;this._launcherOpen = false;this._update(JSON.stringify(this._state));
            this._card.ease({opacity: 255, duration: this._motion() ? 160 : 0, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        };
        if (this._motion()) this._card.ease({opacity: 0, duration: 70, onComplete: change});
        else change();
    }
    _buildMedia(p) {
        this._hero = new St.Widget({style_class: 'vela-artwork', height: 190});
        this._card.add_child(this._hero);
        this._sourceLabel = this._label(p.source, 'vela-source'); this._card.add_child(this._sourceLabel);
        this._title = this._label(p.title, 'vela-title'); this._card.add_child(this._title);
        this._detail = this._label(p.subtitle, 'vela-subtitle'); this._card.add_child(this._detail);
        this._buildProgress();
        const times = new St.BoxLayout({style_class: 'vela-times'});
        this._elapsedLabel = this._label(p.elapsed, 'vela-time-label', true);
        this._durationLabel = this._label(p.duration, 'vela-time-label');
        times.add_child(this._elapsedLabel); times.add_child(this._durationLabel); this._card.add_child(times);
    }
    _buildMetric(p) {
        const panel = new St.BoxLayout({vertical: true, style_class: 'vela-metric-panel'});
        this._metricLabel = this._label(p.metric, 'vela-metric'); panel.add_child(this._metricLabel);
        this._title = this._label(p.type === 'timer' ? 'Time to focus' : p.title, 'vela-metric-title'); panel.add_child(this._title);
        this._detail = this._label(p.subtitle, 'vela-subtitle'); panel.add_child(this._detail);
        this._card.add_child(panel); this._buildProgress();
    }
    _buildSummary(p) {
        const panel = new St.BoxLayout({vertical: true, style_class: 'vela-summary-panel'});
        panel.add_child(new St.Icon({icon_name: p.icon, icon_size: 34, style: `color: ${p.accent};`, x_align: Clutter.ActorAlign.START}));
        this._title = this._label(p.title, 'vela-title'); panel.add_child(this._title);
        this._detail = this._label(p.subtitle, 'vela-subtitle'); panel.add_child(this._detail);
        this._card.add_child(panel); this._buildProgress();
    }
    _buildProgress() {
        this._track = new St.BoxLayout({style_class: 'vela-track', height: 4});
        this._progress = new St.Widget({style_class: 'vela-progress', height: 4});
        this._track.add_child(this._progress); this._card.add_child(this._track);
        this._track.connect('notify::allocation', () => this._setProgress(present(this._current())));
    }
    _setProgress(p) {if (this._progress) {this._progress.width = Math.round(Math.max(0, this._track.width) * p.progress);this._progress.set_style(`background-color: ${p.accent};`);}}
    _buildLauncher() {
        const launch = new St.BoxLayout({vertical: true, style_class: 'vela-launcher'});
        launch.add_child(this._label('Start something', 'vela-caption'));
        const timers = new St.BoxLayout({style_class: 'vela-presets'});
        for (const minutes of [5, 15, 25]) timers.add_child(this._textButton(`${minutes} min`, () => this._command('timer', 'start', minutes * 60), 'vela-preset'));
        launch.add_child(timers);
        launch.add_child(this._textButton('Start a stopwatch', () => this._command('stopwatch', 'start'), 'vela-stopwatch-launch'));
        this._card.add_child(launch);
    }
    _updateCard(p, a) {
        if (this._title) this._title.text = p.type === 'timer' ? (p.state === 'completed' ? 'A moment well spent' : 'Time to focus') : p.title;
        if (this._detail) this._detail.text = p.subtitle;
        if (this._metricLabel && ['timer','stopwatch','battery','volume'].includes(p.type)) this._metricLabel.text = p.metric;
        this._setProgress(p);
        this._track.visible = a?.progress !== null && a?.progress !== undefined;
        if (p.type === 'media') {
            const uri = a?.icon?.startsWith('file://') ? Gio.File.new_for_uri(a.icon).get_uri() : this.dir.get_child('assets').get_child('orbit.svg').get_uri();
            if (uri !== this._artUri) {this._artUri = uri;this._hero.set_style(`background-image: url("${uri.replace(/["\\\n\r]/g, c => `\\${c}`)}");`);}
            this._sourceLabel.text = p.source;
            this._elapsedLabel.text = p.elapsed; this._durationLabel.text = p.duration;
        } else this._artUri = null;
    }
    _motion() {return this._state.config.animations !== false && St.Settings.get().enable_animations;}
    _expand(open) {
        this._expanded = open; this._card.remove_all_transitions();
        if (open) {
            this._card.show(); this._renderCard(); this._card.opacity = 0; this._card.translation_y = this._state.config.position === 'bottom' ? 10 : -10;
            this._card.ease({opacity: 255, translation_y: 0, duration: this._motion() ? 240 : 0, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        } else {
            this._launcherOpen = false;
            this._card.ease({opacity: 0, duration: this._motion() ? 150 : 0, onComplete: () => {if (!this._expanded && this._alive) {this._card.hide();this._position();}}});
        }
        this._position();
    }
    _position() {
        if (!this._root) return;
        const config = this._state.config, sizes = SIZES[config.size] ?? SIZES.medium;
        const monitor = Main.layoutManager.monitors[config.monitor] ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const width = Math.min(this._expanded ? sizes.card : sizes.pill, monitor.width - 32);
        this._root.width = width; this._pill.width = Math.min(sizes.pill, width);
        const bottom = config.position === 'bottom';
        if (this._bottom !== bottom) {this._bottom = bottom;this._root.set_child_at_index(this._card, bottom ? 0 : 1);}
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        const y = bottom ? Math.round(monitor.y + monitor.height - this._root.height - 28) : monitor.y + 46;
        if (this._root.x !== x || this._root.y !== y) this._root.set_position(x, y);
    }
    disable() {
        this._alive = false;
        if (this._signal) this._proxy.disconnectSignal(this._signal);
        if (this._ownerSignal) this._proxy.disconnect(this._ownerSignal);
        if (this._monitorSignal) Main.layoutManager.disconnect(this._monitorSignal);
        if (this._outsideSignal) global.stage.disconnect(this._outsideSignal);
        this._root?.destroy(); this._root = this._proxy = null;
        this._signal = this._ownerSignal = this._monitorSignal = this._outsideSignal = null;
        this._cardKey = this._pillKey = this._artUri = null;
        this._title = this._detail = this._metricLabel = this._hero = this._progress = null;
    }
}
