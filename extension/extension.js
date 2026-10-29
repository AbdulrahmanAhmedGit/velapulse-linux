import {activityLines} from './context-state.js';
import {createMusicControls} from './music-shell.js';
import {activePlayer,pillWidth} from './music-state.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {present, kind, actionInfo, SIZES, drawProgress, drawRing} from './presentation.js';

const BUS = 'io.github.velapulse.Service';
const PATH = '/io/github/velapulse/Service';
const XML = `<node><interface name="io.github.velapulse.Service1"><method name="Snapshot"><arg direction="out" type="s"/></method><method name="Command"><arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="in" type="t"/></method><signal name="Changed"><arg type="s"/></signal></interface></node>`;
const Proxy = Gio.DBusProxy.makeProxyWrapper(XML);
const CENTER = Clutter.ActorAlign.CENTER;

export default class VelaPulse extends Extension {
    enable() {
        this._alive = true;
        this._layoutSource = 0;
        const generation = this._generation = (this._generation ?? 0) + 1;
        this._bottom = null;
        this._expanded = false;
        this._launcherOpen = false;
        this._state = {activities: [], config: {}};
        this._selected = null;
        this._root = new St.BoxLayout({vertical: true, style_class: 'vela-root', reactive: true});
        this._pill = new St.BoxLayout({style_class: 'vela-pill', x_align: CENTER, y_align: CENTER});
        this._pillMain = new St.Button({style_class: 'vela-pill-main', x_expand: true, can_focus: true, accessible_name: 'Expand live activity'});
        const summary = new St.BoxLayout({style_class: 'vela-pill-summary', x_expand: true, x_align: Clutter.ActorAlign.FILL});
        this._pillWell = new St.Bin({style_class: 'vela-well', x_align: CENTER, y_align: CENTER});
        this._pillIcon = new St.Icon({icon_name: 'weather-clear-night-symbolic', icon_size: 17});
        this._pillWell.set_child(this._pillIcon);
        const indicator = new St.Widget({layout_manager:new Clutter.BinLayout(),width:32,height:32,y_align:CENTER});
        indicator.add_child(this._pillWell);
        this._pillRing=new St.DrawingArea({width:32,height:32});
        this._pillRing.connect('repaint',area=>{const cr=area.get_context();const [w,h]=area.get_surface_size();const p=present(this._current());drawRing(cr,w,h,p.progress,p.accent);cr.$dispose();});
        indicator.add_child(this._pillRing);summary.add_child(indicator);
        const lines = new St.BoxLayout({style_class: 'vela-pill-text', x_expand: true, y_align: CENTER});
        this._pillTitle = this._label('VelaPulse', 'vela-pill-title');
        this._pillDetail = this._label('Ready when you are', 'vela-pill-detail');
        lines.add_child(this._pillTitle); lines.add_child(this._pillDetail); summary.add_child(lines);
        this._pillMain.set_child(summary); this._pill.add_child(this._pillMain);
        this._pillControls = new St.BoxLayout({style_class: 'vela-inline-controls', y_align: CENTER});
        this._pill.add_child(this._pillControls);
        this._root.add_child(this._pill);
        this._card = new St.BoxLayout({vertical: true, style_class: 'vela-card'});
        this._card.connect('notify::allocation',()=>this._queuePosition());
        this._cardScroll=new St.ScrollView({visible:false});this._cardScroll.set_policy(St.PolicyType.NEVER,St.PolicyType.AUTOMATIC);this._cardScroll.set_child(this._card);this._root.add_child(this._cardScroll);this._card.hide();
        this._pill.connect('notify::allocation', () => this._queuePosition());
        this._pillMain.connect('clicked', () => this._expand(!this._expanded));
        this._root.connect('key-press-event', (_, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {this._expand(false); return Clutter.EVENT_STOP;}
            return Clutter.EVENT_PROPAGATE;
        });
        Main.layoutManager.addChrome(this._root, {affectsStruts: false, trackFullscreen: true});
        this._monitorSignal = Main.layoutManager.connect('monitors-changed', () => this._queuePosition());
        this._root.connect('notify::allocation', () => this._queuePosition());
        this._overviewShowing=Main.overview.connect('showing',()=>{this._expand(false);this._syncRenderer();});
        this._overviewHidden=Main.overview.connect('hidden',()=>this._syncRenderer());
        this._outsideSignal = global.stage.connect('captured-event', (_, event) => {
            if (this._expanded && event.type() === Clutter.EventType.BUTTON_PRESS) {
                const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ...event.get_coords());
                if (actor && !this._root.contains(actor) && !this._pill.contains(actor) && !this._panel?.contains(actor)) this._expand(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._proxy = new Proxy(Gio.DBus.session, BUS, PATH, (proxy, error) => {
            if (!this._alive || generation !== this._generation) return;
            if (error) {this._error('Service unavailable'); return;}
            this._signal = proxy.connectSignal('Changed', (_, __, [json]) => this._update(json));
            this._ownerSignal = proxy.connect('notify::g-name-owner', () => this._refresh());
            this._refresh();
        });
        this._nativeActive = false;
        this._rendererWatch = Gio.bus_watch_name(Gio.BusType.SESSION, 'io.github.velapulse.Renderer', Gio.BusNameWatcherFlags.NONE, () => {this._nativeActive = true;this._syncRenderer();}, () => {this._nativeActive = false;this._syncRenderer();});
        this._queuePosition();
    }
    _syncRenderer() {
        if (!this._alive) return;
        if (this._nativeActive && this._expanded) this._expand(false);
        this._root.visible = !this._nativeActive && !Main.overview.visible && (!this._panel || this._expanded);
        if (this._panel) this._panel.visible = !this._nativeActive&&!Main.overview.visible;
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
    _musicRequest(method,signature,args){return new Promise((resolve,reject)=>{if(!this._proxy?.g_name_owner){reject(new Error('Activity service unavailable'));return;}this._proxy.call(method,new GLib.Variant(signature,args),Gio.DBusCallFlags.NONE,6000,null,(p,r)=>{try{resolve(p.call_finish(r).deep_unpack());}catch(e){reject(e);}});});}
    _command(id, action, seconds = 0) {
        if(action==='cancel'){Gio.DBus.session.call(BUS,PATH,'io.github.velapulse.Service1','DeveloperCancel',new GLib.Variant('(s)',[id]),null,Gio.DBusCallFlags.NONE,5000,null,null);return;}
        if (action === 'start') {this._selected = id; this._launcherOpen = false;}
        this._proxy?.CommandRemote(id, action, seconds, (_, error) => {if (error) this._error('This control is unavailable');else if(id==='brief'){this._selected='brief';this._refresh();}});
    }
    _update(json) {
        const oldTop = this._state.activities[0]?.id;
        try {this._state = JSON.parse(json);} catch {return;}
        const activities = this._state.activities;
        if ((!this._expanded && oldTop !== activities[0]?.id) || !activities.some(a => a.id === this._selected)) this._selected = activities[0]?.id;
        const a = this._current(), p = present(a), config = this._state.config;
        const classes = `vela-root ${['light','glass'].includes(config.appearance) ? `vela-${config.appearance}` : ''} vela-${p.type}`;
        if (this._root.get_style_class_name() !== classes) this._root.set_style_class_name(classes);
        this._syncSurface();
        // Panel placement reparents the pill outside the floating root.
        if(this._panel)for(const theme of ['light','glass']) {
            if(config.appearance===theme)this._panel.add_style_class_name(`vela-${theme}`);
            else this._panel.remove_style_class_name(`vela-${theme}`);
        }
        this._root.opacity = Math.round((config.opacity ?? 98) * 2.55);
        this._pill.opacity = this._panel ? this._root.opacity : 255;
        const wellStyle = `background-color: ${p.tint}; color: #ffffff;`;
        if (this._pillWell.get_style() !== wellStyle) this._pillWell.set_style(wellStyle);
        const artUri=p.type==='media'&&a.icon?.startsWith('file://')?a.icon:p.icon;if(this._pillArtUri!==artUri){this._pillArtUri=artUri;if(artUri.startsWith('file://')&&Gio.File.new_for_uri(artUri).query_exists(null))this._pillIcon.gicon=new Gio.FileIcon({file:Gio.File.new_for_uri(artUri)});else this._pillIcon.icon_name=p.icon;}
        this._pillRing.visible = a?.progress !== null && a?.progress !== undefined;
        if(this._pillRing.visible)this._pillRing.queue_repaint();
        this._pillTitle.text = p.compact;
        this._pillDetail.text = `${p.type === 'media' ? '· ' : ''}${p.detail}`;
        const key = JSON.stringify([a?.id, a?.controls, a?.status]);
        if (key !== this._pillKey) {
            this._pillKey = key; this._pillControls.destroy_all_children();
            const actions = p.type === 'media' ? (a.controls ?? []) : (a?.controls ?? []).filter(c => c !== 'reset');
            for (const action of actions) {
                const [icon, name] = actionInfo(action, a.status);
                this._pillControls.add_child(this._iconButton(icon, name, () => this._command(a.id, action), 'vela-inline'));
            }
        }
        this._renderCard(); this._queuePosition();this._syncRenderer();
    }
    _renderCard() {
        if (!this._expanded) return;
        const a = this._current(), p = present(a);
        const key = JSON.stringify([a?.id, a?.controls, this._state.activities.map(a => a.id), this._launcherOpen]);
        if (key !== this._cardKey) {
            this._cardKey = key;this._musicTools?.dispose();this._musicTools=null;this._transportButtons=[];
            this._title = this._detail = this._metricLabel = this._hero = null;
            this._track = this._progress = this._sourceLabel = this._elapsedLabel = this._durationLabel = null;
            this._contextLabel=null;this._card.destroy_all_children();
            this._artUri = null;this._oldCover=null;
            const header = new St.BoxLayout({style_class: 'vela-card-header'});
            const tag = new St.BoxLayout({style_class: 'vela-tag', x_expand: true, y_align: CENTER});
            tag.add_child(new St.Icon({icon_name: p.icon, icon_size: 13, style: `color: ${p.accent};`}));
            tag.add_child(this._label(p.label, 'vela-caption'));
            header.add_child(tag);
            header.add_child(this._iconButton('emblem-system-symbolic', 'Preferences', () => {this._expand(false);this.openPreferences().catch(() => this._error('Preferences could not be opened'));}, 'vela-quiet'));
            header.add_child(this._iconButton('window-close-symbolic', 'Collapse activity', () => this._expand(false), 'vela-quiet'));
            if (p.type !== 'media') this._card.add_child(header);
            if (p.type === 'media') this._buildMedia(p);
            else if (['timer', 'stopwatch', 'battery', 'volume'].includes(p.type)) this._buildMetric(p);
            else this._buildSummary(p);
            if (a?.controls?.length&&p.type!=='media') {
                const transport = new St.BoxLayout({style_class: 'vela-transport', x_align: CENTER});
                const ordered = p.type === 'timer' || p.type === 'stopwatch' ? [...a.controls].reverse() : a.controls;
                for (const action of ordered) {
                    const [icon, name] = actionInfo(action, a.status);
                    const primary = ['PlayPause', 'pause', 'resume'].includes(action);
                    const b=this._iconButton(icon,name,()=>this._command(a.id,action),primary?'vela-primary':(['weather','brief'].includes(p.type)?'vela-context-action':'vela-secondary'));transport.add_child(b);this._transportButtons.push({button:b,action});
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
        if(!this._contextLabel||this._contextLabel.get_parent()!==this._card){this._contextLabel=this._label('','vela-context-lines');this._contextLabel.clutter_text.line_wrap=true;this._contextLabel.clutter_text.ellipsize=0;this._card.add_child(this._contextLabel);this._card.add_child(this._textButton('Now Brief',()=>{this._selected='brief';this._command('brief','open');}));}
        this._updateCard(p, a);
    }
    _select(id) {
        if (id === this._selected) return;
        this._card.remove_all_transitions();
        this._selected = id;this._launcherOpen = false;
        if(id.startsWith('media:'))this._musicRequest('SelectPlayer','(s)',[id]).catch(()=>this._error('Player selection unavailable'));
        this._update(JSON.stringify(this._state));
        this._card.opacity = this._motion() ? 180 : 255;
        this._card.ease({opacity:255,duration:this._motion()?120:0,mode:Clutter.AnimationMode.EASE_OUT_CUBIC});
    }
    _buildMedia(p) {
        const hero = new St.Widget({layout_manager: new Clutter.BinLayout(), style_class: 'vela-artwork', height: 220});
        this._hero = new St.Widget({style_class: 'vela-cover-image', x_expand: true, y_expand: true});hero.add_child(this._hero);
        const overlay = new St.BoxLayout({vertical: true, style_class: 'vela-cover-caption', x_expand: true, y_expand: true, y_align: Clutter.ActorAlign.END});
        this._title = this._label(p.title, 'vela-title');this._detail = this._label(p.subtitle, 'vela-subtitle');overlay.add_child(this._title);overlay.add_child(this._detail);hero.add_child(overlay);
        const corners = new St.BoxLayout({style_class: 'vela-cover-corners', x_expand: true, y_expand: true, y_align: Clutter.ActorAlign.START});
        corners.add_child(this._iconButton('emblem-system-symbolic', 'Preferences', () => {this._expand(false);this.openPreferences().catch(() => this._error('Preferences unavailable'));}, 'vela-cover-button'));
        corners.add_child(new St.Widget({x_expand: true}));
        corners.add_child(this._iconButton('window-close-symbolic', 'Collapse', () => this._expand(false), 'vela-cover-button'));hero.add_child(corners);this._card.add_child(hero);
        const source = new St.BoxLayout({style_class: 'vela-provider-row'});
        source.add_child(new St.Icon({icon_name: p.icon, icon_size: 18, style_class: 'vela-provider-icon'}));
        this._sourceLabel = this._label(p.source, 'vela-source', true);source.add_child(this._sourceLabel);
        const volume = this._state.activities.find(a => a.id === 'volume');
        if (volume) {source.add_child(new St.Icon({icon_name: 'audio-headphones-symbolic', icon_size: 15}));source.add_child(this._label('System audio', 'vela-output'));}
        this._card.add_child(source);
        this._musicTools=createMusicControls({request:(...args)=>this._musicRequest(...args),getActivity:()=>this._current(),getActivities:()=>this._state.activities,getConfig:()=>this._state.config,onSelect:id=>{this._state.config.selected_player=id;this._selected=id||activePlayer(this._state.activities)?.id;this._cardKey=null;this._renderCard();},attachLyrics:()=>{const a=this._current();if(a?.music)Gio.Subprocess.new(['gjs','-m',this.dir.get_child('lyrics-picker.js').get_path(),a.id,a.music.track_id],Gio.SubprocessFlags.NONE);}});this._card.add_child(this._musicTools.actor);
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
        if(!['weather','developer','brief'].includes(p.type))panel.add_child(new St.Icon({icon_name: p.icon, icon_size: 34, style: `color: ${p.accent};`, x_align: Clutter.ActorAlign.START}));
        this._title = this._label(p.title, 'vela-title'); panel.add_child(this._title);
        this._detail = this._label(p.subtitle, 'vela-subtitle'); panel.add_child(this._detail);
        this._card.add_child(panel); this._buildProgress();
    }
    _buildProgress(wave = false) {
        this._wave = wave;
        if (wave) {
            this._track = new St.DrawingArea({height: 14, style_class: 'vela-wave'});
            this._track.connect('repaint', area => {const cr=area.get_context();const [w,h]=area.get_surface_size();drawProgress(cr,w,h,present(this._current()).progress);cr.$dispose();});
            this._progress = null;this._card.add_child(this._track);return;
        }
        this._track = new St.BoxLayout({style_class: 'vela-track', height: 4});
        this._progress = new St.Widget({style_class: 'vela-progress', height: 4});
        this._track.add_child(this._progress); this._card.add_child(this._track);
        this._track.connect('notify::allocation', () => this._queuePosition());
    }
    _setProgress(p) {
        if(!this._track)return;
        if (this._wave) {this._track.queue_repaint();return;}
        if (!this._progress) return;
        const width = Math.round(Math.max(0, this._track.width) * p.progress);
        if (this._progress.width !== width) this._progress.ease({width,duration:this._motion()?500:0,mode:Clutter.AnimationMode.LINEAR});
        const style = `background-color: ${p.accent};`;
        if (this._progress.get_style() !== style) this._progress.set_style(style);
    }
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
        if(this._contextLabel){this._contextLabel.text=activityLines(a).join('\n');this._contextLabel.visible=Boolean(this._contextLabel.text);}
        this._setProgress(p);
        if(this._track)this._track.visible = a?.progress !== null && a?.progress !== undefined;
        this._musicTools?.update();for(const {button,action}of this._transportButtons??[]){const[icon,name]=actionInfo(action,a?.status);button.get_child().icon_name=icon;button.accessible_name=name;}
        if (p.type === 'media') {
            const uri = a?.icon?.startsWith('file://')&&Gio.File.new_for_uri(a.icon).query_exists(null) ? Gio.File.new_for_uri(a.icon).get_uri() : this.dir.get_child('assets').get_child('orbit.svg').get_uri();
            if (uri !== this._artUri) {if(this._oldCover){this._oldCover.destroy();this._oldCover=null;}if(this._artUri&&this._motion()){const faded=new St.Widget({x_expand:true,y_expand:true,style_class:'vela-cover-image',style:this._hero.get_style()});this._hero.insert_child_at_index(faded,0);this._oldCover=faded;faded.ease({opacity:0,duration:180,onComplete:()=>{if(this._oldCover===faded){this._oldCover=null;faded.destroy();}}});}this._artUri=uri;this._hero.set_style(`background-image: url("${uri.replace(/["\\\n\r]/g, c => `\\${c}`)}");`);}
            this._sourceLabel.text = p.source;

        } else this._artUri = null;
    }
    _syncSurface() {
        const panel = this._state.config.surface === 'panel';
        if (panel === Boolean(this._panel)) return;
        this._pill.get_parent()?.remove_child(this._pill);
        if (panel) {
            this._panel = new PanelMenu.Button(0.0, 'VelaPulse live activities', true);
            this._panel.add_child(this._pill);this._pill.add_style_class_name('vela-panel-pill');
            this._panel.connect('notify::allocation', () => this._queuePosition());
            this._panel.connect('key-press-event', (_, event) => {
                if (event.get_key_symbol() === Clutter.KEY_Escape) {this._expand(false);return Clutter.EVENT_STOP;}
                if (global.stage.get_key_focus() === this._panel && [Clutter.KEY_Return, Clutter.KEY_space].includes(event.get_key_symbol())) {this._expand(!this._expanded);return Clutter.EVENT_STOP;}
                return Clutter.EVENT_PROPAGATE;
            });
            Main.panel.addToStatusArea('velapulse', this._panel, 0, 'right');
        } else {
            this._pill.remove_style_class_name('vela-panel-pill');this._root.insert_child_at_index(this._pill, 0);
            this._panel.destroy();this._panel = null;this._bottom = null;this._root.show();
        }
    }
    _motion() {return this._state.config.animations !== false && St.Settings.get().enable_animations;}
    _expand(open) {
        this._expanded = open; if (open) this._root.show();this._card.remove_all_transitions();
        if (open) {
            this._cardScroll.show();this._card.show(); this._renderCard(); this._card.opacity = 0; this._card.translation_y = this._state.config.position === 'bottom' ? 10 : -10;
            this._card.ease({opacity: 255, translation_y: 0, duration: this._motion() ? 240 : 0, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        } else {
            this._launcherOpen = false;this._musicTools?.dispose();this._musicTools=null;this._cardKey=null;
            this._card.ease({opacity: 0, duration: this._motion() ? 150 : 0, onComplete: () => {if (!this._expanded && this._alive) {this._card.hide();this._cardScroll.hide();this._queuePosition();}}});
        }
        this._queuePosition();
    }
    _queuePosition() {
        if (!this._alive || this._layoutSource) return;
        this._layoutSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._layoutSource = 0;
            this._position();
            return GLib.SOURCE_REMOVE;
        });
    }
    _position() {
        if (!this._alive || this._nativeActive || !this._root?.get_stage()) return;
        if (this._expanded && !this._wave) this._setProgress(present(this._current()));
        const config = this._state.config, sizes = SIZES[config.size] ?? SIZES.medium;
        const monitor = this._panel ? Main.layoutManager.primaryMonitor : Main.layoutManager.monitors[config.monitor] ?? Main.layoutManager.primaryMonitor;
        if (!monitor) return;
        const width = Math.min(this._expanded ? (config.card_size === 'large' ? 520 : sizes.card) : pillWidth(this._current(),sizes.pill), monitor.width - 32);
        if (this._root.width !== width) this._root.width = width;
        if(this._expanded){const natural=this._card.get_preferred_height(width)[1];const height=Math.min(natural,Math.max(180,monitor.height-130));if(this._cardScroll.height!==height)this._cardScroll.height=height;}
        if (this._panel) {
            const panelWidth = Math.min(sizes.pill, 280);
            if (this._pill.width !== panelWidth) this._pill.width = panelWidth;
            const [px, py] = this._panel.get_transformed_position();
            const x = Math.round(Math.max(monitor.x + 12, Math.min(px + this._panel.width / 2 - width / 2, monitor.x + monitor.width - width - 12)));
            const y = Math.round(py + this._panel.height + 10);
            if (this._root.x !== x || this._root.y !== y) this._root.set_position(x,y);
            this._root.visible = this._expanded;return;
        }
        const compactWidth = Math.min(pillWidth(this._current(),sizes.pill),width);
        if (this._pill.width !== compactWidth) this._pill.width = compactWidth;
        const bottom = config.position === 'bottom';
        if (this._bottom !== bottom) {this._bottom = bottom;this._root.set_child_at_index(this._cardScroll, bottom ? 0 : 1);}
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        const y = bottom ? Math.round(monitor.y + monitor.height - this._root.height - 28) : monitor.y + 46;
        if (this._root.x !== x || this._root.y !== y) this._root.set_position(x, y);
    }
    disable() {
        this._alive = false;this._musicTools?.dispose();this._musicTools=null;
        if (this._rendererWatch) Gio.bus_unwatch_name(this._rendererWatch);
        this._rendererWatch = 0;
        this._generation++;
        if (this._layoutSource) {GLib.Source.remove(this._layoutSource);this._layoutSource = 0;}
        if (this._signal) this._proxy.disconnectSignal(this._signal);
        if (this._ownerSignal) this._proxy.disconnect(this._ownerSignal);
        if (this._monitorSignal) Main.layoutManager.disconnect(this._monitorSignal);
        if(this._overviewShowing)Main.overview.disconnect(this._overviewShowing);if(this._overviewHidden)Main.overview.disconnect(this._overviewHidden);this._overviewShowing=this._overviewHidden=0;
        if (this._outsideSignal) global.stage.disconnect(this._outsideSignal);
        if (this._panel) {this._pill.get_parent()?.remove_child(this._pill);this._root.add_child(this._pill);this._panel.destroy();this._panel = null;}
        if (this._root) {Main.layoutManager.removeChrome(this._root);this._root.destroy();}
        this._root = this._proxy = null;
        this._signal = this._ownerSignal = this._monitorSignal = this._outsideSignal = null;
        this._cardKey = this._pillKey = this._artUri = this._pillArtUri = null;
        this._title = this._detail = this._metricLabel = this._hero = this._progress = null;
    }
}
