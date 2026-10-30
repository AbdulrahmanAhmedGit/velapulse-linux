# VelaPulse design system

A quiet desktop instrument: charcoal surfaces, readable neutral text and one soft
lavender action accent. Activity status color carries meaning; artwork never
supplies the only contrast behind track identity. System Adwaita Sans/sans-serif
keeps native shaping/fallback for English and Arabic. Numbers use tabular figures.

## Source of truth

`extension/layout.js` defines logical-pixel geometry, spacing, type, colors and
motion. `scripts/generate-layout-css.mjs` writes geometry for each toolkit. GTK
and St implement their own valid CSS; neither consumes the other's stylesheet.
Run the generator and its `--check` mode after token changes.

## Component contracts

- Floating compact: leading 32 px indicator with a 24 px icon well; vertical
  primary/secondary text; trailing native icon buttons. 12 px balanced horizontal
  insets. Text ellipsizes after measurement; controls retain their hit areas.
  Panel mode uses a single line and smaller leading geometry.
- Cards: 20 px content inset, 12 px section rhythm, 24 px outer radius. Common
  header with category, Preferences and Collapse; native scrolling only when the
  available monitor height requires it. Width settings are ceilings.
- Music: shared header, bounded artwork, separate track/artist identity, source,
  native player/seek/transport, optional lyrics and audio. No metadata over art.
- Weather: current conditions hero, three metrics, horizontal hours, five day
  rows, attribution and stale/error notices. No forecast text dumps.
- Brief: compact section rows with a single divider rhythm, no nested card stack.
- Developer: identity, semantic status strip, elapsed time, current update and
  recent lifecycle rows. Waiting always directs the user to the original agent.
- Timer/stopwatch/power/audio: tabular numeric hero, concise state and native
  controls; progress shown only when meaningful.
- Preferences: scrollable category navigation, one readable settings column,
  native Adw rows, appearance options on their own page. Global search navigates
  to actual controls. Changes continue through existing Configure serialization.

## Type and color

Primary 13 px/600, secondary 11 px/400; card title 22 px/600; body 13 px;
caption 11 px; numeric hero 52 px. Do not uppercase ordinary labels.
Dark surface #202127, elevated #2c2d36, text #f4f3f8, secondary #b4b3c2.
Light surface #f8f7fb, elevated #eceaf2, text #252431, secondary #625e70.
Accent #b5a4f5 (dark), #6558c4 (light). Success green, waiting amber, failure red.
Glass retains transparent surfaces with a subtle rim, no decorative gradients.

## Input, motion and accessibility

32 px compact hit targets, 48 px primary transport; text controls at least 32 px.
Visible focus is required in all themes. Native Tab/Shift+Tab, Space/Return and
Escape behavior is preserved. Ctrl+F focuses global settings search. Labels and
activity strings remain literal; no markup injection. Floating text stacks follow
RTL direction; progress and times remain legible. Reduced motion disables card
and artwork transitions. Motion durations: 120 ms feedback, 180 ms artwork,
220 ms expansion, 140 ms collapse. No perpetual decorative animation.

## Acceptance

Inspect actual GTK and Shell captures, long/missing text, Arabic/RTL, small/large
sizes, dark/light/glass, 100/125/150% and reduced motion. Exercise pointer and
keyboard actions against the real D-Bus service on a private bus. Keep limitations
explicit; headless software-rendered evidence does not certify physical monitors,
suspend or GPU performance.
