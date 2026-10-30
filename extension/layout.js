// Logical-pixel tokens shared by GTK and GNOME. CSS is generated from this file
// because GNOME St does not support GTK's CSS custom-property syntax.
export const SPACE = Object.freeze({xs:4, sm:8, md:12, lg:16, xl:24});
export const LAYOUT = Object.freeze({
    pillPaddingX:12, pillPaddingY:6, iconGap:10, textGap:2,
    actionGap:4, hitArea:32, indicator:32, well:24, icon:16,
    cardPadding:20, cardGap:12, cardRadius:24, pillRadius:999,
    panelIndicator:24, panelWell:20, panelIcon:14,
});

// Preferred width uses the toolkit's measured text, never a character heuristic.
// The configured size is a ceiling. Controls and the activity icon retain their
// natural size; both labels may ellipsize within the remaining allocation.
export function compactWidth(textWidth, actions, maximum, panel=false) {
    const indicator=panel?LAYOUT.panelIndicator:LAYOUT.indicator;
    const inset=panel?SPACE.xs:LAYOUT.pillPaddingX;
    const count=Math.max(0,actions);
    const fixed=inset*2+indicator+LAYOUT.iconGap+(count?SPACE.sm+count*(LAYOUT.hitArea+2)+(count-1)*LAYOUT.actionGap:0)+2;
    return Math.min(maximum,Math.max(fixed+SPACE.xl,fixed+Math.max(0,textWidth)));
}

// Semantic tokens: native toolkit adapters intentionally keep distinct CSS.
export const TYPE = Object.freeze({primary:13, secondary:11, title:22, body:13, caption:11, numeric:52});
export const COLOR = Object.freeze({
    dark:{surface:'#202127',raised:'#2c2d36',text:'#f4f3f8',muted:'#b4b3c2',accent:'#b5a4f5'},
    light:{surface:'#f8f7fb',raised:'#eceaf2',text:'#252431',muted:'#625e70',accent:'#6558c4'},
});
export const MOTION = Object.freeze({feedback:120, artwork:180, expand:220, collapse:140});
export function compactTextWidth(primary,secondary,panel=false) {
    return panel ? primary+(secondary?LAYOUT.textGap+secondary:0) : Math.max(primary,secondary);
}

// Opacity belongs to surfaces; text and keyboard focus always remain opaque.
export function surfaceColor(appearance='dark',opacity=98) {
    const color=appearance==='light'?COLOR.light.surface:COLOR.dark.surface;
    const rgb=color.slice(1).match(/../g).map(c=>parseInt(c,16));
    const alpha=Math.max(.65,Math.min(1,(Number(opacity)||98)/100))*(appearance==='glass'?.74:1);
    return `rgba(${rgb.join(',')},${alpha.toFixed(3)})`;
}
