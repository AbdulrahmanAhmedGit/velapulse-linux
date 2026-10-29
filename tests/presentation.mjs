import assert from 'node:assert/strict';
import {present, clock, actionInfo} from '../extension/presentation.js';
assert.equal(clock(3661), '1:01:01');
assert.equal(clock(-1), '0:00');
const timer = present({id:'timer',title:'Timer',description:'00:04:32',status:'paused',progress:.4});
assert.equal(timer.metric, '04:32');
assert.equal(timer.detail, 'Paused');
assert.equal(actionInfo('PlayPause','paused')[1], 'Play');
assert.equal(actionInfo('PlayPause','active')[1], 'Pause');
const track = present({id:'media:org.mpris.MediaPlayer2.player',title:'Track',description:'Artist',status:'active',position_seconds:83,duration_seconds:214});
assert.equal(track.elapsed, '1:23');assert.equal(track.duration,'3:34');
assert.equal(track.subtitle, 'Artist');
assert.equal(present({id:'external::1:job',title:'Build',description:'Compiling',status:'warning'}).type,'external');
assert.equal(present(null).state,'idle');
console.log('PASS: native presentation formatting, pause controls, media timing, external and empty states');

const {activePlayer,lyricIndex,musicColor,pillWidth}=await import('../extension/music-state.js');
const peers=[{id:'media:paused',status:'paused'},{id:'media:playing',status:'active'}];
assert.equal(activePlayer(peers).id,'media:playing');assert.equal(activePlayer(peers,'media:paused').id,'media:paused');assert.equal(activePlayer(peers,'media:gone').id,'media:playing');
assert.equal(lyricIndex([{seconds:0},{seconds:12.5},{seconds:20}],13),1);assert.equal(lyricIndex([{seconds:3}],1),-1);
assert.equal(musicColor({music:{color:'url(malicious)'}}),'#b5a4f5');assert.match(musicColor({music:{color:'#102030'}}),/^#[0-9a-f]{6}$/);
assert.ok(pillWidth({title:'Long title '.repeat(100),controls:['PlayPause','Next']},310)<=310);
console.log('PASS: shared player preference, lyric synchronization, safe palette and bounded pill width');

const {mergeSettings}=await import('../extension/context-state.js');
const merged=mergeSettings({weather:{enabled:false,units:'celsius',location:{name:'Test'}},developer:{codex:false,claude:false}},{weather:{enabled:true}},{weather:{units:'fahrenheit'}},{developer:{claude:true}});
assert.equal(merged.weather.enabled,true);assert.equal(merged.weather.units,'fahrenheit');assert.equal(merged.weather.location.name,'Test');assert.equal(merged.developer.codex,false);assert.equal(merged.developer.claude,true);
assert.equal(present({id:'weather',title:'Weather',icon:'weather-snow-symbolic'}).icon,'weather-snow-symbolic');

console.log('PASS: nested settings patches, weather presentation and safe permission guidance');

assert.equal(present({id:'developer:task:test',title:'Build',description:'task',status:'warning',developer:{state:'cancelled',elapsed:65}}).detail,'cancelled · 1:05');
assert.equal(present({id:'clock',title:'12:00',description:'Thursday · 8°C',status:'active'}).detail,'8°C · Thursday');
assert.equal(present({id:'weather',title:'8°C',weather:{stale:true,location:{name:'Berlin'}}}).detail,'Cached · Berlin');
assert.equal(present({id:'weather',title:'Weather',weather:{code:3,temperature:10,units:'celsius',location:{name:'Berlin'}}}).compact,'10°C · Overcast');
