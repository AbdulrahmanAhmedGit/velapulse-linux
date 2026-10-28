# VelaPulse design direction

VelaPulse Orbit uses a quiet pill, a fine activity ring around a compact 24px icon well, restrained surface borders, large tabular timer numerals and lavender primary controls. Media cards retain original plum artwork and native transport affordances. No proprietary code or assets are imported.

Media uses plum (#b778a7), timers purple (#6558d8), battery green (#2ac85a) and audio blue (#347bfa). Native system typography keeps text legible at desktop scale. The original peach/plum/purple gradient is used when local album artwork is absent. No font binaries are bundled.

Preferences follow the supplied three-column reference: navigation, live activity previews and size tiles, then an appearance inspector. A warm yellow accent marks selection. Pill and expanded-card sizes are independent. Dark and light appearances are supported.

GNOME supports either a floating pill at the top/bottom or a compact activity in the Top Bar. Panel mode keeps the card anchored beneath its panel control without reserving desktop space. The layer-shell renderer remains floating because GNOME panel integration belongs to the extension.

Native St/Clutter and GTK4 implementations share presentation rules. Only supported actions are displayed. Weather, sports, device controls and lyrics are not fabricated. Controlled test peers shown in validation screenshots are fixtures, not release providers.

The St and GTK ring use the same Cairo function. Progress updates are event/second driven, with no permanent animation loop. Shell respects desktop animation settings; GTK reveal motion also checks its system reduced-motion preference.
