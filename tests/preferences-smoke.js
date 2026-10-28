// Optional native-widget integration test. Use an isolated D-Bus and test display.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {fillPreferences} from '../extension/preferences.js';
if (GLib.getenv('VELAPULSE_ISOLATED_TEST') !== '1') throw new Error('Requires VELAPULSE_ISOLATED_TEST=1 on an isolated session');
const app = new Adw.Application({application_id: 'io.github.velapulse.PreferencesTest'});
let failed = false;
function rows(widget, result = []) {result.push(widget);for(let c=widget.get_first_child();c;c=c.get_next_sibling())rows(c,result);return result;}
function snapshot() {return JSON.parse(Gio.DBus.session.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Snapshot',null,null,Gio.DBusCallFlags.NONE,3000,null).deep_unpack()[0]);}
app.connect('activate',()=>{
    const window = new Adw.ApplicationWindow({application:app});try {fillPreferences(window);window.present();} catch(e) {printerr(e.stack);failed=true;window.close();app.quit();return;}
    GLib.timeout_add(GLib.PRIORITY_DEFAULT,700,()=>{
        try {
            const find = title => rows(window).find(r=>r.title===title);
            rows(window).find(w=>w.get_name()==='size-large').active = true;
            find('Appearance').selected = 2;
            find('Animations').active = false;
            find('Placement').selected = 1;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT,700,()=>{
                try {
                    const c=snapshot().config;
                    if(c.size!=='large' || c.appearance!=='light' || c.animations!==false || c.surface!=='panel')throw new Error(`Settings did not persist: ${JSON.stringify(c)}`);
                    const widgets=rows(window);
                    widgets.find(w=>w instanceof Gtk.SearchEntry).text='media';
                    widgets.find(w=>w instanceof Gtk.Scale).set_value(73);
                    // Force a service update while the slider's debounce is pending.
                    Gio.DBus.session.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Command',new GLib.Variant('(sst)',['timer','start',120]),null,Gio.DBusCallFlags.NONE,3000,null);
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT,1400,()=>{
                        try {
                            const latest=snapshot().config;
                            if(latest.opacity!==73)throw new Error(`Live updates overwrote the slider: ${latest.opacity}`);
                            const timerRow=rows(window).find(w=>w.get_name()==='preview-timer');
                            if(timerRow.visible)throw new Error('Live updates undid the search filter');
                            print('PASS: queued settings persist; live clock updates preserve slider edits and search results');
                        }catch(e){printerr(e.stack);failed=true;}
                        window.close();app.quit();return GLib.SOURCE_REMOVE;
                    });
                    return GLib.SOURCE_REMOVE;
                } catch(e) {printerr(e.stack);failed=true;}
                window.close();app.quit();return GLib.SOURCE_REMOVE;
            });
        } catch(e) {printerr(e.stack);failed=true;window.close();app.quit();}
        return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
if(failed)throw new Error('Preferences smoke test failed');
