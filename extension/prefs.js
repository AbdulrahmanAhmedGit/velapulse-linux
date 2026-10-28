import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {fillExtensionPreferences} from './preferences-host.js';
export default class VelaPulsePreferences extends ExtensionPreferences {
    fillPreferencesWindow(host) {
        fillExtensionPreferences(host);
    }
}
