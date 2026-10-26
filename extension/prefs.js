import Adw from 'gi://Adw';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {fillPreferences} from './preferences.js';
export default class VelaPulsePreferences extends ExtensionPreferences {
    fillPreferencesWindow(host) {
        // GNOME tracks a PreferencesPage even though the custom layout uses its own window.
        host.add(new Adw.PreferencesPage({title:'VelaPulse'}));
        const window=new Adw.ApplicationWindow({application:host.get_application()});
        fillPreferences(window);
        host.connect('map',()=>{host.hide();window.present();});
        window.connect('close-request',()=>{host.close();return false;});
        window.present();
    }
}
