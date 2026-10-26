// Optional native-widget integration test. Use an isolated D-Bus and test display.
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {fillPreferences} from '../extension/preferences.js';
if (GLib.getenv('VELAPULSE_ISOLATED_TEST') !== '1') throw new Error('Requires VELAPULSE_ISOLATED_TEST=1 on an isolated session');
const app = new Adw.Application({application_id: 'io.github.velapulse.PreferencesTest'});
let failed = false;
function rows(widget, result = []) {if(widget instanceof Adw.ComboRow || widget instanceof Adw.SwitchRow)result.push(widget);for(let c=widget.get_first_child();c;c=c.get_next_sibling())rows(c,result);return result;}
function snapshot() {return JSON.parse(Gio.DBus.session.call_sync('io.github.velapulse.Service','/io/github/velapulse/Service','io.github.velapulse.Service1','Snapshot',null,null,Gio.DBusCallFlags.NONE,3000,null).deep_unpack()[0]);}
app.connect('activate',()=>{
    const window = new Adw.PreferencesWindow({application:app});fillPreferences(window);window.present();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT,700,()=>{
        try {
            const find = title => rows(window).find(r=>r.title===title);
            find('Pill size').selected = 2;
            find('Appearance').selected = 1;
            find('Animations').active = false;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT,700,()=>{
                try {
                    const c=snapshot().config;
                    if(c.size!=='large' || c.appearance!=='light' || c.animations!==false)throw new Error(`Settings did not persist: ${JSON.stringify(c)}`);
                    print('PASS: native preferences widgets update the real D-Bus configuration');
                } catch(e) {printerr(e.stack);failed=true;}
                window.close();app.quit();return GLib.SOURCE_REMOVE;
            });
        } catch(e) {printerr(e.stack);failed=true;window.close();app.quit();}
        return GLib.SOURCE_REMOVE;
    });
});
app.run([]);
if(failed)throw new Error('Preferences smoke test failed');
