#!/usr/bin/gjs -m
import Adw from 'gi://Adw?version=1';
import {fillPreferences} from '../extension/preferences.js';
const app = new Adw.Application({application_id: 'io.github.velapulse.Preferences'});
app.connect('activate',()=>{const window = new Adw.PreferencesWindow({application:app});fillPreferences(window);window.present();});
app.run([]);
