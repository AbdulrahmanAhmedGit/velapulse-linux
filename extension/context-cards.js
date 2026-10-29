// Structured, toolkit-independent card composition. All content is literal text.
// The adapters supply actual GTK or St widgets; no HTML or markup is interpreted.
const text=(key,value,style='',wrap=false)=>({key,type:'text',text:String(value??''),style,wrap});
const icon=(key,name,size=20)=>({key,type:'icon',icon:name,size});
const row=(key,children,style='')=>({key,type:'row',children,style});
const col=(key,children,style='')=>({key,type:'column',children,style});
const button=(key,label,action)=>({key,type:'button',text:label,action,style:'vela-context-button'});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function weatherSymbol(code){if(code===0)return 'weather-clear-symbolic';if(code>=1&&code<=3)return 'weather-few-clouds-symbolic';if([45,48].includes(code))return 'weather-fog-symbolic';if((code>=71&&code<=77)||[85,86].includes(code))return 'weather-snow-symbolic';if([95,96,99].includes(code))return 'weather-storm-symbolic';if((code>=51&&code<=67)||(code>=80&&code<=82))return 'weather-showers-symbolic';return 'weather-overcast-symbolic';}
export function weatherCondition(code){if(code===0)return 'Clear skies';if(code===1)return 'Mostly clear';if(code===2)return 'Partly cloudy';if(code===3)return 'Overcast';if([45,48].includes(code))return 'Fog';if(code>=51&&code<=57)return 'Drizzle';if(code>=61&&code<=67)return 'Rain';if((code>=71&&code<=77)||[85,86].includes(code))return 'Snow';if(code>=80&&code<=82)return 'Showers';if([95,96,99].includes(code))return 'Thunderstorms';return 'Conditions unavailable';}
export function temperature(n,units,unit=false){return finite(n)?`${Math.round(units==='fahrenheit'?n*1.8+32:n)}°${unit?(units==='fahrenheit'?'F':'C'):''}`:'—';}
function zone(w){try{new Intl.DateTimeFormat('en',{timeZone:w.timezone});return w.timezone||'UTC';}catch{return 'UTC';}}
const elapsed=n=>{const s=Math.max(0,Math.floor(n||0));return s>=3600?`${Math.floor(s/3600)}h ${Math.floor(s/60)%60}m`:`${Math.floor(s/60)}m ${s%60}s`;};
const stateNames={starting:'Starting',running:'Running',waiting:'Needs your attention',completed:'Completed',failed:'Failed',cancelled:'Cancelled',disconnected:'Disconnected'};
const stateIcons={starting:'content-loading-symbolic',running:'system-run-symbolic',waiting:'dialog-warning-symbolic',completed:'emblem-ok-symbolic',failed:'dialog-error-symbolic',cancelled:'process-stop-symbolic',disconnected:'network-offline-symbolic'};
function friendlyActivity(value){return String(value??'').replace(/^(starting|running|waiting|completed|failed|cancelled|disconnected) · /,'').replace(/SessionStart/g,'Session started').replace(/UserPromptSubmit/g,'Working on your request').replace(/PreToolUse/g,'Using tool').replace(/PostToolUseFailure/g,'Tool failed').replace(/PostToolUse/g,'Tool finished').replace(/StopFailure/g,'Agent stopped with an error').replace(/SessionEnd/g,'Session ended').replace(/PermissionRequest/g,'Permission requested').replace(/Notification/g,'Agent update').replace(/^Stop$/,'Response completed').replace(/Codex exec structured events/g,'Session connected').replace(/Codex structured lifecycle event/g,'Agent status updated').replace(/^Exit status: 0$/,'Task finished successfully').replace(/^Exit status: (\d+)$/,'Task exited with code $1');}
export function contextTree(a){
 if(a?.id==='weather'){
  const w=a.weather;
  if(!w)return col('weather',[icon('empty-icon','weather-overcast-symbolic',44),text('empty-title','Weather unavailable','vela-context-heading'),text('empty-detail','Choose a location in Preferences, or refresh to try again.','vela-context-muted',true)],'vela-context-empty');
  const tz=zone(w),t=n=>temperature(n,w.units),hours=w.hours.slice(0,12),days=w.days.slice(0,5),lows=days.map(d=>d.low).filter(finite),highs=days.map(d=>d.high).filter(finite),low=Math.min(...lows),high=Math.max(...highs),span=Math.max(1,high-low);
  const metric=(key,name,value)=>col(key,[text(key+'-value',value,'vela-condition-value'),text(key+'-label',name,'vela-context-muted')],'vela-condition-cell');
  const hourNodes=hours.map((h,i)=>({...col(`hour-${h.at}`,[text('time',new Date(h.at*1000).toLocaleTimeString([],{hour:'numeric',timeZone:tz}),'vela-hour-time'),icon('icon',weatherSymbol(h.code),24),text('temperature',t(h.temperature),'vela-hour-temperature'),text('rain',finite(h.rain)?`${Math.round(h.rain)}%`:'—','vela-hour-rain')],'vela-hour-tile'),expand:false}));
  const daily=days.map((d,i)=>row(`day-${d.at}`,[{...text('day',new Date(d.at*1000).toLocaleDateString('en-CA',{timeZone:tz})===new Date().toLocaleDateString('en-CA',{timeZone:tz})?'Today':new Date(d.at*1000).toLocaleDateString([],{weekday:'short',timeZone:tz}),'vela-day-name'),expand:true},icon('icon',weatherSymbol(d.code),20),text('rain',finite(d.rain)?`${Math.round(d.rain)}%`:'','vela-day-rain'),text('low',t(d.low),'vela-day-low'),{key:'range',type:'range',start:(d.low-low)/span,end:(d.high-low)/span,style:'vela-day-range'},text('high',t(d.high),'vela-day-high')],'vela-day-row'));
  const notices=(w.notices??[]).map((n,i)=>row(`notice-${i}`,[icon('icon','weather-showers-symbolic',18),col('copy',[text('label','Forecast notice','vela-notice-title'),text('body',n,'vela-context-body',true)])],'vela-forecast-notice'));
  const status=w.stale?row('stale',[icon('icon','network-offline-symbolic',17),text('text','Offline · showing cached forecast','vela-notice-title',true)],'vela-forecast-notice'):null;
  return col('weather',[
   row('hero',[col('copy',[text('location',w.location.name,'vela-weather-location',true),text('condition',weatherCondition(w.code),'vela-context-muted'),text('temperature',temperature(w.temperature,w.units,true),'vela-weather-temperature')]),icon('hero-icon',weatherSymbol(w.code),64)],'vela-weather-hero'),
   row('conditions',[metric('feels','Feels like',t(w.feels_like)),metric('humidity','Humidity',finite(w.humidity)?`${Math.round(w.humidity)}%`:'—'),metric('wind','Wind',finite(w.wind)?`${Math.round(w.wind)} km/h`:'—')],'vela-condition-grid'),
   ...[status,...notices].filter(Boolean),
   col('hourly',[text('heading','Next hours','vela-context-section'),{key:'hours',type:'scroll',children:[row('tiles',hourNodes,'vela-hour-strip')],style:'vela-hour-scroll'},text('hint','Rain probability · scroll for more →','vela-context-footnote')],'vela-forecast-section'),
   col('daily',[text('heading','5-day forecast','vela-context-section'),...daily],'vela-daily-list'),
   col('footer',[text('updated',`Updated ${new Date(w.updated*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',timeZone:tz})}${w.stale?' · Cached':''}`,'vela-context-footnote'),...(w.error?[text('error','Refresh failed. Your last forecast is still available.','vela-context-footnote',true)]:[]),text('credit','Open-Meteo · CC BY 4.0','vela-context-footnote')],'vela-context-footer')
  ],'vela-context-card');
 }
 if(a?.developer){
  const d=a.developer,state=d.state,waiting=state==='waiting',events=[...new Set((d.events??[]).map(friendlyActivity))].filter(e=>e!==friendlyActivity(d.message)).slice(-3);
  return col('developer',[
   row('identity',[icon('agent-icon','utilities-terminal-symbolic',32),col('identity-copy',[...(a.title!==({'codex':'Codex','claude':'Claude Code','task':'Local command'}[d.provider])?[text('provider',({'codex':'Codex','claude':'Claude Code','task':'Local command'}[d.provider])||'Developer activity','vela-context-muted')]:[]),text('agent',a.title,'vela-context-heading',true),text('project',d.project||'Local session','vela-context-muted',true)])],'vela-agent-identity'),
   row('state',[icon('state-icon',stateIcons[state]||stateIcons.running,18),{...text('state-label',stateNames[state]||state,'vela-state-label'),expand:true},text('elapsed',elapsed(d.elapsed),'vela-agent-elapsed')],`vela-agent-state vela-state-${state}`),
   ...(waiting?[col('attention',[text('heading','Review in your agent','vela-notice-title'),text('body','Return to the original agent to inspect the request and decide. VelaPulse cannot approve or reject it.','vela-context-body',true)],'vela-agent-attention')]:[]),
   col('status',[text('heading',waiting?'Request context':'Latest update','vela-context-section'),text('message',friendlyActivity(d.message)||'Waiting for the next lifecycle update.','vela-context-body',true)],'vela-agent-status'),
   ...(events.length?[col('recent',[text('heading','Recent activity','vela-context-section'),...events.map((event,i)=>row('event-'+i,[icon('dot','pan-end-symbolic',12),text('event',friendlyActivity(event),'vela-context-muted',true)],'vela-agent-event'))],'vela-agent-history')]:[]),
   ...(a.controls?.includes('cancel')?[button('cancel','Cancel owned task','cancel')]:[]),
   text('privacy',d.provider==='task'?'Only this owned command can be cancelled.':'Lifecycle updates only · details stay in your agent','vela-context-footnote',true)
  ],'vela-context-card');
 }
 if(a?.id==='brief'){
  const lines=a.summary??[],credit=lines.find(s=>s.startsWith('Weather data by '));
  const items=lines.slice(1).filter(s=>s!==credit).map((line,i)=>{
   const parts=line.split(' · '),heading=parts.shift(),symbol=line.startsWith('Today:')||/°[CF]/.test(line)?'weather-few-clouds-symbolic':/^(Codex|Claude)/.test(line)?'utilities-terminal-symbolic':/^Battery/.test(line)?'battery-good-symbolic':/^Audio/.test(line)?'audio-volume-high-symbolic':/timer|stopwatch/i.test(line)?'alarm-symbolic':'audio-x-generic-symbolic';
   return row('summary-'+i,[icon('icon',symbol,24),col('copy',[text('heading',heading,'vela-brief-heading',true),...(parts.length?[text('detail',parts.join(' · '),'vela-context-muted',true)]:[])])],'vela-brief-item');
  });
  return col('brief',[text('title','Now Brief','vela-context-heading'),text('date',lines[0]||'Your day at a glance','vela-context-muted',true),...items,...(credit?[text('credit','Weather: Open-Meteo · CC BY 4.0','vela-context-footnote')]:[])],'vela-context-card');
 }

 return null;
}
// Preserve widgets, keyboard targets and horizontal scroll position across updates.
export function createContextCard(ui,activity,onAction){
 function build(node){const widget=ui.create(node,onAction);return {node,widget,children:[]};}
 function reconcile(instance,node){ui.update(instance.widget,node);const old=new Map(instance.children.map(c=>[c.node.key,c]));const children=[];for(const child of node.children??[]){let c=old.get(child.key);if(c&&c.node.type!==child.type){ui.remove(instance.widget,c.widget);c=null;}old.delete(child.key);if(!c)c=build(child);reconcile(c,child);children.push(c);}for(const c of old.values())ui.remove(instance.widget,c.widget);ui.children(instance.widget,children.map(c=>c.widget));instance.children=children;instance.node=node;}
 const tree=contextTree(activity),instance=build(tree);reconcile(instance,tree);return {widget:instance.widget,update:a=>reconcile(instance,contextTree(a))};
}
