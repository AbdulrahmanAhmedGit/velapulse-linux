import {musicColor} from './music-state.js';
// Pure presentation rules shared by the two native renderers.
export const PALETTE = {
    weather:{accent:"#88cafa",tint:"#245784",icon:"weather-few-clouds-symbolic",label:"Weather"},
    clock:{accent:"#b5a4f5",tint:"#493e64",icon:"preferences-system-time-symbolic",label:"Local time"},
    brief:{accent:"#f0ce87",tint:"#51432a",icon:"view-list-symbolic",label:"Now Brief"},
    developer:{accent:"#89ddbc",tint:"#245946",icon:"utilities-terminal-symbolic",label:"Developer activity"},
    media: {accent: '#b778a7', tint: '#4a2539', icon: 'audio-x-generic-symbolic', label: 'Now playing'},
    timer: {accent: '#6558d8', tint: '#6558d8', icon: 'alarm-symbolic', label: 'Timer'},
    stopwatch: {accent: '#347bfa', tint: '#347bfa', icon: 'preferences-system-time-symbolic', label: 'Stopwatch'},
    battery: {accent: '#2ac85a', tint: '#2ac85a', icon: 'battery-good-symbolic', label: 'Power'},
    volume: {accent: '#347bfa', tint: '#347bfa', icon: 'audio-volume-high-symbolic', label: 'Audio'},
    external: {accent: '#f0bd7e', tint: '#392e23', icon: 'view-refresh-symbolic', label: 'Live activity'},
    idle: {accent: '#b778a7', tint: '#4a2539', icon: 'weather-clear-night-symbolic', label: 'VelaPulse'},
};
export const SIZES = {small: {pill: 310, card: 400}, medium: {pill: 380, card: 440}, large: {pill: 430, card: 480}};
export function kind(a) {return a ? (PALETTE[a.id.split(':')[0]] ? a.id.split(':')[0] : 'external') : 'idle';}
export function clock(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function timeText(text = '') {return text.startsWith('00:') ? text.slice(3) : text;}
export function actionInfo(action, status) {
    const names = {
        Previous: ['media-skip-backward-symbolic', 'Previous track'],
        Next: ['media-skip-forward-symbolic', 'Next track'],
        PlayPause: [status === 'active' ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic', status === 'active' ? 'Pause' : 'Play'],
        pause: ['media-playback-pause-symbolic', 'Pause'],
        resume: ['media-playback-start-symbolic', 'Resume'],
        cancel:['process-stop-symbolic','Cancel owned task'],
        refresh:['view-refresh-symbolic','Refresh'],
        reset: ['view-refresh-symbolic', 'Reset'],
    };
    return names[action] ?? ['dialog-information-symbolic', action];
}
export function present(a) {
    const type = kind(a), p = {...PALETTE[type]};
    if (a?.status === 'warning') {p.accent = '#f0bd7e'; p.tint = '#392e23';}
    if(type==='weather'&&a?.icon)p.icon=a.icon;
    if(type==='developer'&&a?.developer?.state==='waiting'){p.accent='#f0bd7e';p.icon='dialog-warning-symbolic';}
    if(type==='media'&&a.music){p.accent=musicColor(a);p.tint=a.music.color||p.tint;}
    const progress = Math.max(0, Math.min(1, a?.progress ?? 0));
    let title = a?.title ?? 'Make room for the moment';
    let subtitle = a?.description || 'Your live activities, in one quiet place.';
    let compact = type === 'idle' ? 'VelaPulse' : title;
    let detail = type === 'idle' ? 'Ready when you are' : a?.status === 'paused' ? 'Paused' : p.label;
    if(type==='developer'&&a?.developer){const d=a.developer;detail=`${d.state} · ${clock(d.elapsed)}`;const symbols={waiting:'dialog-warning-symbolic',failed:'dialog-error-symbolic',completed:'emblem-ok-symbolic',cancelled:'process-stop-symbolic',disconnected:'network-offline-symbolic'};p.icon=symbols[d.state]??p.icon;}
    if(type==='clock'){const parts=subtitle.split(' · ');detail=parts.length>1?`${parts.at(-1)} · ${parts[0]}`:subtitle;}
    if(type==='weather'&&a?.weather)detail=`${a.weather.stale?'Cached · ':''}${a.weather.location.name}`;
    if(type==='brief')detail='Daily overview';
    let metric = '';
    if (type === 'timer' || type === 'stopwatch') {
        metric = timeText(a.description);
        compact = metric;
        subtitle = a.status === 'completed' ? 'Time is up. Take a breath.' : a.status === 'paused' ? 'Paused · ready when you are' : type === 'timer' ? 'A little focus goes a long way.' : 'Every moment counts.';
        detail = a.status === 'completed' ? 'Complete' : a.status === 'paused' ? 'Paused' : p.label;
    } else if (type === 'battery') {
        metric = `${Math.round(progress * 100)}%`;
        compact = metric;
        detail = a.description.split('·')[1]?.trim() || 'Battery';
        title = a.status === 'warning' ? 'Time to plug in' : progress >= .99 ? 'Ready to go' : 'Power for what’s next';
        subtitle = a.description;
    } else if (type === 'volume') {
        const level = Number(a.description.match(/Volume:\s*([\d.]+)/)?.[1]);
        metric = Number.isFinite(level) ? `${Math.round(level * 100)}%` : 'Audio';
        compact = metric;
        detail = a.description.includes('MUTED') ? 'Muted' : 'Output volume';
        title = detail; subtitle = 'Default audio output';
    } else if (type === 'media') {
        detail = a.description || 'Unknown artist';
        subtitle = detail;
    }
    return {...p, type, title, subtitle, compact, detail, metric, progress,
        state: a?.status ?? 'idle',
        source: a?.source || (type === 'media' ? a.id.replace('media:org.mpris.MediaPlayer2.', '').split('.')[0] : 'VelaPulse'),
        elapsed: Number.isFinite(a?.position_seconds) ? clock(a.position_seconds) : '',
        duration: Number.isFinite(a?.duration_seconds) ? clock(a.duration_seconds) : '',
    };
}

// Native Cairo drawing used by St and GTK; no animation loop or image assets.
export function drawProgress(cr,width,height,fraction,color='#b778a7') {
    const rgb=color.replace('#','').match(/../g).map(c=>parseInt(c,16)/255);
    const end=4+Math.max(0,Math.min(1,fraction))*Math.max(0,width-8),mid=height/2;
    cr.setLineWidth(3);cr.setLineCap(1);cr.setSourceRGBA(.55,.51,.55,.6);cr.moveTo(4,mid);cr.lineTo(Math.max(4,width-4),mid);cr.stroke();
    cr.setSourceRGBA(...rgb,1);cr.moveTo(4,mid);
    for(let x=4;x<=end;x+=2)cr.lineTo(x,mid+Math.sin((x-4)/3.4)*2.6);
    cr.stroke();cr.setSourceRGBA(1,1,1,1);cr.arc(end,mid,4,0,Math.PI*2);cr.fill();
}

// One shared native Cairo ring for the compact activity in both renderers.
export function drawRing(cr, width, height, fraction, color='#b5a4f5') {
    const rgb=color.replace('#','').match(/../g).map(c=>parseInt(c,16)/255);
    const r=Math.max(0,Math.min(width,height)/2-1.5),x=width/2,y=height/2;
    cr.setLineWidth(2);cr.setSourceRGBA(...rgb,.18);cr.arc(x,y,r,0,Math.PI*2);cr.stroke();
    if(fraction>0){cr.setSourceRGBA(...rgb,1);cr.setLineCap(1);cr.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0,Math.min(1,fraction)));cr.stroke();}
}
