# VelaPulse design direction

The supplied reference images establish useful density and hierarchy: pill-shaped live summaries, immediately reachable controls, content-specific expanded cards, large media imagery and separate preferences. Their assets, typography, branding and exact geometry are not reused.

VelaPulse uses an original orbital motif and a cool neutral ink base (#15161e), raised surfaces (#22242e), off-white type (#f4f2f8), iris (#b5a4f5), sea glass (#77d5b6), sky (#89bdf1) and warm amber (#f0bd7e). Color identifies activity types; warnings override with amber. Adwaita Sans supplies native body/display type and tabular numerals carry clocks. No font binaries are bundled.

The compact surface has a 32px activity well, a two-level summary and independent icon controls. Opening reveals a content-specific card: artwork-first media, large clock figures, power/volume metrics or an external activity summary. A narrow activity rail makes other live work visible. Settings belong in native preferences, reached by a gear button. The orbital artwork is an original SVG used only when actual media artwork is absent; it does not pretend to be album artwork.

Native St/Clutter and GTK4 implementations share pure presentation rules. Only supported actions are displayed. No fabricated weather, sport, device or lyric integrations are shown. Typography, color, spacing, focus states and motion are checked in actual native screenshots, with controlled test peers clearly identified as fixtures.
