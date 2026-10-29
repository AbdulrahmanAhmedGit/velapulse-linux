import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contextTree,createContextCard,temperature,weatherCondition,weatherSymbol} from '../extension/context-cards.js';
const weather=JSON.parse(fs.readFileSync(new URL('fixtures/weather-view.json',import.meta.url)));
function flatten(n){return [n,...(n.children??[]).flatMap(flatten)];}
let tree=contextTree({id:'weather',weather});let nodes=flatten(tree);
assert.equal(nodes.filter(n=>n.style==='vela-hour-tile').length,12);
assert.equal(nodes.filter(n=>n.style==='vela-day-row').length,5);
assert.equal(nodes.filter(n=>n.type==='range').length,5);
assert.equal(nodes.filter(n=>n.style==='vela-condition-cell').length,3);
assert.ok(nodes.every(n=>!n.text?.includes('\n')),'Forecasts must be individual components');
assert.equal(temperature(0,'fahrenheit',true),'32°F');assert.equal(temperature(null,'celsius'),'—');assert.equal(weatherCondition(4),'Conditions unavailable');assert.equal(weatherSymbol(0),'weather-clear-symbolic');
assert.ok(flatten(contextTree({id:'weather'})).some(n=>n.text==='Weather unavailable'));
assert.ok(flatten(contextTree({id:'weather',weather:{...weather,stale:true,error:'sensitive transport error'}})).some(n=>n.text?.includes('Offline')));
assert.ok(!JSON.stringify(contextTree({id:'weather',weather:{...weather,error:'sensitive transport error'}})).includes('sensitive transport error'));
for(const state of ['starting','running','waiting','completed','failed','cancelled','disconnected']){
 const activity={id:'developer:claude:test',title:'Claude Code',controls:[],developer:{provider:'claude',state,elapsed:65,project:'<literal text>',message:'Tool update',events:[`${state} · Tool update`]}};
 const n=flatten(contextTree(activity));assert.ok(n.some(x=>x.text==='1m 5s'));assert.ok(!n.some(x=>['Approve','Reject','Allow'].includes(x.text)));assert.equal(n.filter(x=>x.text?.includes('Tool update')).length,1);
 if(state==='waiting')assert.ok(n.some(x=>x.text?.includes('cannot approve or reject')));
}
// Reconciliation must keep real input targets and scroll containers across updates.
const ui={create:n=>({type:n.type}),update:(w,n)=>{w.text=n.text;},children:(w,c)=>{w.children=c;},remove:()=>{}};
const c=createContextCard(ui,{id:'weather',weather},()=>{});const root=c.widget;const find=(w,type)=>w.type===type?w:(w.children??[]).map(c=>find(c,type)).find(Boolean);const scroll=find(root,'scroll');c.update({id:'weather',weather:{...weather,temperature:12}});assert.equal(find(root,'scroll'),scroll);
const original=fs.readFileSync(new URL('../extension/extension.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../backends/layer-shell.js',import.meta.url),'utf8');assert.ok(!original.includes('activityLines'));
console.log('PASS structured forecast hierarchy, units, offline/empty states, safe developer states, stable scroll widgets and renderer routing');
