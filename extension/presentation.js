// Pure presentation rules shared by the two native renderers.
export const PALETTE = {
    media: {accent: '#b5a4f5', tint: '#292436', icon: 'audio-x-generic-symbolic', label: 'Now playing'},
    timer: {accent: '#b5a4f5', tint: '#2a253c', icon: 'alarm-symbolic', label: 'Timer'},
    stopwatch: {accent: '#89bdf1', tint: '#202e41', icon: 'preferences-system-time-symbolic', label: 'Stopwatch'},
    battery: {accent: '#77d5b6', tint: '#1b332f', icon: 'battery-good-symbolic', label: 'Power'},
    volume: {accent: '#89bdf1', tint: '#202e41', icon: 'audio-volume-high-symbolic', label: 'Audio'},
    external: {accent: '#f0bd7e', tint: '#392e23', icon: 'view-refresh-symbolic', label: 'Live activity'},
    idle: {accent: '#b5a4f5', tint: '#292436', icon: 'weather-clear-night-symbolic', label: 'VelaPulse'},
};
export const SIZES = {small: {pill: 278, card: 354}, medium: {pill: 338, card: 390}, large: {pill: 386, card: 426}};
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
        reset: ['view-refresh-symbolic', 'Reset'],
    };
    return names[action] ?? ['dialog-information-symbolic', action];
}
export function present(a) {
    const type = kind(a), p = {...PALETTE[type]};
    if (a?.status === 'warning') {p.accent = '#f0bd7e'; p.tint = '#392e23';}
    const progress = Math.max(0, Math.min(1, a?.progress ?? 0));
    let title = a?.title ?? 'Make room for the moment';
    let subtitle = a?.description || 'Your live activities, in one quiet place.';
    let compact = title;
    let detail = a?.status === 'paused' ? 'Paused' : p.label;
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
