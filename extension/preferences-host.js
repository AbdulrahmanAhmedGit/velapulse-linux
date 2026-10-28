import Adw from 'gi://Adw';
import {fillPreferences} from './preferences.js';

// GNOME owns this tracking window and may make it modal before loading prefs.js.
// Transfer modality to the visible custom window: a hidden modal host keeps GTK's
// input grab and silently redirects mouse and keyboard events away from controls.
export function fillExtensionPreferences(host) {
    host.add(new Adw.PreferencesPage({title:'VelaPulse'}));
    const modal=host.modal;
    host.modal=false;
    const window=new Adw.ApplicationWindow({application:host.get_application(),transient_for:host,modal});
    fillPreferences(window);
    let closing=false;
    host.connect('map',()=>{host.hide();if(!closing)window.present();});
    host.connect('close-request',()=>{if(!closing){closing=true;window.close();}return false;});
    window.connect('close-request',()=>{if(!closing){closing=true;host.close();}return false;});
    window.present();
    return window;
}
