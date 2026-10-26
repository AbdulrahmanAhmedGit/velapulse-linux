# VelaPulse design direction

The supplied Now Bar screenshots guide the visual hierarchy and proportions: single-line rounded pills, colored activity wells, near-black media cards, large artwork, white type, a wavy progress line and neutral round transport buttons. Implementation and fallback artwork are original; reference assets and code are not imported.

Media uses plum (#b778a7), timers purple (#6558d8), battery green (#2ac85a) and audio blue (#347bfa). Native system typography keeps text legible at desktop scale. The original peach/plum/purple gradient is used when local album artwork is absent. No font binaries are bundled.

Preferences follow the supplied three-column reference: navigation, live activity previews and size tiles, then an appearance inspector. A warm yellow accent marks selection. Pill and expanded-card sizes are independent. Dark and light appearances are supported.

GNOME supports either a floating pill at the top/bottom or a compact activity in the Top Bar. Panel mode keeps the card anchored beneath its panel control without reserving desktop space. The layer-shell renderer remains floating because GNOME panel integration belongs to the extension.

Native St/Clutter and GTK4 implementations share presentation rules. Only supported actions are displayed. Weather, sports, device controls and lyrics are not fabricated. Controlled test peers shown in validation screenshots are fixtures, not release providers.
