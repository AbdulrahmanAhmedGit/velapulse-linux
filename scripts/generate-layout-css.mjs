import {readFileSync,writeFileSync} from 'node:fs';
import {SPACE as S,LAYOUT as L} from '../extension/layout.js';
const begin='/* BEGIN GENERATED LAYOUT: scripts/generate-layout-css.mjs */';
const end='/* END GENERATED LAYOUT */';
const px=n=>`${n}px`;
for(const [file,shell,settings]of [['extension/stylesheet.css',true],['backends/style.css',false],['extension/preferences.css',false,true]]){
 const rule=(selector,props)=>`${selector} { ${Object.entries(props).map(([k,v])=>`${k}: ${typeof v==='number'&&k!=='font-weight'?px(v):v};`).join(' ')} }`;
 const size=(w,h)=>shell?{width:w,height:h}:{'min-width':w,'min-height':h};
 const gap=n=>shell?{spacing:n}:{};
 const rules=settings?[
  rule('.settings-sidebar',{padding:`${S.lg}px ${S.md}px`,margin:S.sm}),
  rule('.settings-page',{padding:`${S.lg}px ${S.xl}px ${S.xl}px`}),
  rule('.settings-brand',{padding:`0 ${S.sm}px ${S.lg}px`}),
  rule('.nav-button',{'min-height':L.hitArea,padding:`${S.sm}px ${S.md}px`}),
  rule('.settings-search',{padding:`${S.sm}px ${S.md}px`}),
  rule('.preview-row',{padding:S.sm,'margin-top':0}),
  rule('.pill-preview',{'min-height':L.indicator,padding:`${L.pillPaddingY}px ${L.pillPaddingX}px`,'border-radius':L.pillRadius}),
  rule('.preview-well',{'min-width':L.well,'min-height':L.well,padding:0,'border-radius':L.pillRadius}),
  rule('.settings-inspector',{padding:`${S.lg}px ${S.md}px`}),
  rule('.provider-controls button',{'min-height':L.hitArea,padding:`${S.sm}px ${S.md}px`}),
 ]:[
  rule('.vela-root',gap(S.md)),
  rule('.vela-pill',{'min-height':L.indicator,padding:`${L.pillPaddingY}px ${L.pillPaddingX}px`,'border-radius':L.pillRadius,...gap(S.sm)}),
  rule('.vela-pill-main',{padding:0,'min-height':0,'border-radius':0,background:'transparent',border:'none','box-shadow':'none',...(!shell?{outline:'none'}:{})}),
  rule('.vela-pill-main:hover, .vela-pill-main:active, .vela-pill-main:focus, .vela-light .vela-pill-main:hover, .vela-light .vela-pill-main:focus',{background:'transparent'}),
  rule('.vela-pill-main:focus'+(shell?'': '-visible'),{'box-shadow':'inset 0 -2px #b5a4f5'}),
  rule('.vela-pill-summary',gap(L.iconGap)),rule('.vela-pill-text',gap(L.textGap)),
  rule('.vela-well',{...size(L.well,L.well),'border-radius':L.well/2}),
  rule('.vela-inline-controls',{padding:0,...gap(L.actionGap)}),
  rule('.vela-icon-button',{padding:0,...size(L.hitArea,L.hitArea),'border-radius':L.pillRadius}),
  rule('.vela-inline, .vela-quiet, .vela-cover-button, .vela-rail-item, .vela-rail-selected',{...size(L.hitArea,L.hitArea)}),
  rule('.vela-pill-title',{'font-size':'1em','font-weight':700}),
  rule('.vela-pill-detail',{'font-size':'.92em',padding:0}),
  rule('.vela-card',{padding:L.cardPadding,'border-radius':L.cardRadius,...gap(L.cardGap)}),
  rule('.vela-card-header',{padding:0,...gap(S.xs)}),rule('.vela-tag',gap(S.sm)),
  rule('.vela-transport',{padding:`${S.xs}px 0`,...gap(S.lg)}),
  rule('.vela-primary, .vela-secondary',{...size(56,56),'border-radius':L.pillRadius}),
  rule('.vela-provider-row',{padding:0,...gap(S.sm)}),rule('.vela-times',{padding:0}),
  rule('.vela-metric-panel',{padding:`${S.sm}px 0`,...gap(S.sm)}),
  rule('.vela-summary-panel',{padding:`${S.sm}px 0`,...gap(S.md)}),
  rule('.vela-activity-rail',{padding:0,...gap(S.sm)}),
  rule('.vela-text-button, .vela-context-button, .vela-new-activity',{padding:`${S.sm}px ${S.md}px`,'min-height':S.lg}),
  rule('.vela-cover-caption',{padding:L.cardPadding,...gap(S.sm)}),
  rule('.vela-cover-corners',{padding:S.md,...gap(S.sm)}),
  rule('.vela-music-tools',gap(S.md)),rule('.vela-music-actions',gap(S.sm)),rule('.vela-audio-controls',gap(S.sm)),
  rule('.vela-launcher',{'padding-top':S.sm,...gap(S.md)}),rule('.vela-presets',gap(S.sm)),
  rule('.vela-lyrics',{padding:S.md,...gap(S.sm)}),
  rule('.vela-context-footer',{'padding-top':S.sm}),
  ...(shell?[
   rule('.vela-context-card',gap(S.md)),
   rule('.vela-context-card StBoxLayout',gap(S.sm)),
   rule('.vela-panel-pill, .vela-light .vela-panel-pill, .vela-glass .vela-panel-pill',{border:'none',padding:`0 ${S.xs}px`,'min-height':0,'border-radius':L.pillRadius,'box-shadow':'none'}),
   rule('.vela-panel-pill .vela-well',{width:L.panelWell,height:L.panelWell,'border-radius':L.panelWell/2}),
   rule('.vela-panel-pill .vela-inline',{width:L.hitArea-2,height:L.hitArea-2}),
   rule('.vela-panel-pill .vela-well StIcon, .vela-panel-pill .vela-inline StIcon',{'icon-size':L.panelIcon}),
   rule('.vela-panel-pill .vela-pill-title, .vela-panel-pill .vela-pill-detail',{'font-size':'.85em'}),
  ]:[]),
 ];
 const generated=begin+'\n'+rules.join('\n')+'\n'+end;
 let source=readFileSync(file,'utf8');
 if(source.includes(begin))source=source.slice(0,source.indexOf(begin)).trimEnd()+'\n';
 // Remove conflicting geometry for the selectors owned here, retaining palette
 // and interaction rules. This is a migration, not another cascade of overrides.
 const owned=new Map();for(const r of rules){const selectors=r.slice(0,r.indexOf(' {')).split(',').map(s=>s.trim());for(const sel of selectors){if(!owned.has(sel))owned.set(sel,new Set());for(const m of r.matchAll(/([\w-]+):/g))owned.get(sel).add(m[1]);}}
 source=source.replace(/([^{}]+)\{([^{}]*)\}/g,(whole,raw,body)=>{
  const selector=raw.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, '');const selectors=selector.split(',').map(s=>s.trim());if(!selectors.every(s=>owned.has(s)))return whole;const properties=new Set([...owned.get(selectors[0])].filter(key=>selectors.every(sel=>owned.get(sel).has(key))));
  const kept=body.split(';').filter(decl=>!properties.has(decl.split(':')[0].trim())&&!(['padding','margin'].some(key=>properties.has(key)&&decl.split(':')[0].trim().startsWith(key+'-')))).join(';').trim();return kept?`${raw}{ ${kept} }`:'';
 });
 const result=source.trimEnd()+'\n\n'+generated+'\n';
 if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==result)throw new Error(`${file} layout CSS is stale`);}else writeFileSync(file,result);
}
