import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {fillPreferences} from './preferences.js';
export default class VelaPulsePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {fillPreferences(window);}
}
