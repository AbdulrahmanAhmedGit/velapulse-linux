// Logical-pixel tokens shared by GTK and GNOME. CSS is generated from this file
// because GNOME St does not support GTK's CSS custom-property syntax.
export const SPACE = Object.freeze({xs:4, sm:8, md:12, lg:16, xl:24});
export const LAYOUT = Object.freeze({
    pillPaddingX:12, pillPaddingY:6, iconGap:10, textGap:8,
    actionGap:4, hitArea:32, indicator:32, well:24, icon:16,
    cardPadding:16, cardGap:12, cardRadius:28, pillRadius:999,
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
