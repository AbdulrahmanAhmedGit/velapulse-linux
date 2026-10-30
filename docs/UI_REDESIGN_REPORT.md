# Product UI overhaul — 2026-10-30

## Review scope

Branch: `refactor/product-ui-overhaul`, based on `7ee1ab6` from
`feature/weather-ai-activities`. This is deliberately stacked on the newest
feature branch: targeting old `main` directly would obscure the redesign with
all earlier music/weather/developer work. No automatic merge or installation.
Pull request: recorded below after branch publication.

The Rust engine, D-Bus signatures, stored settings schema, provider opt-ins,
command ownership and renderer supervision remain unchanged. The installed
VelaPulse and active GNOME desktop have not been replaced or restarted.

## Implemented changes

- Central semantic spacing, geometry, typography, colors and motion tokens.
  Deterministic generation replaces historical overlapping CSS experiments;
  GTK and St retain separate valid toolkit stylesheets.
- One leading/content/actions compact composition per renderer. Floating pills
  have independently ellipsized title/detail lines; panel pills retain one row.
  Width uses measured native text; fixed hit targets and balanced outer padding
  are protected. Explicit single-line text mode handles Arabic shaping without
  wrapping compact content into controls.
- Shared card header and rhythm. Music artwork has a bounded 176 px height with
  track identity on a separate readable surface. Seek, player selection,
  transport, local lyrics and audio functions remain available. General titles
  can wrap, and GTK exposes complete music metadata through tooltips.
- Weather keeps its existing structured current/hour/day model, with consistent
  metrics, legible attribution and enough viewport height for rain labels and
  the scrollbar. Brief uses divider rows instead of nested filled cards.
  Developer states retain meaningful status colors, elapsed time, safe return
  guidance and owned-task cancellation. Timer/stopwatch/power/audio use a common
  numeric hierarchy and restrained controls.
- Keyed context-card reconciliation is extracted into `card-tree.js`, keeping
  widget identity, keyboard targets and scroll positions across data updates.
- Preferences uses native libadwaita rows, one scrollable content column and an
  adaptive sidebar. Appearance controls are grouped together. Dark/light/glass
  follow the same visual language as the activity UI. Search indexes actual
  native settings rows across pages, navigates to the real control, supports
  Ctrl+F/Enter/Escape, and preserves result widgets during activity updates.
- Opacity affects background surfaces while preserving text/control contrast.
  Artwork, expansion and lyric transitions honor reduced motion.

## Genuine before / after evidence

These are unedited compositor captures of running GTK/St code, not mockups.
Weather, media peers, battery/audio layout data and developer lifecycle data are
clearly identified test fixtures. Pointer actions and keyboard events are sent
through private Wayland/Mutter EIS input; they do not target the user's desktop.

| Component | Baseline `7ee1ab6` | Redesigned |
| --- | --- | --- |
| Music pill | [Before](screenshots/ui-overhaul/before/gtk-music-pill-preview.png) | [GTK](screenshots/ui-overhaul/gtk/gtk-music-pill-preview.png), [Shell](screenshots/ui-overhaul/shell/gnome-music-pill-preview.png) |
| Music card | [Before](screenshots/ui-overhaul/before/gtk-music-card-preview.png) | [GTK](screenshots/ui-overhaul/gtk/gtk-music-card-preview.png), [Shell](screenshots/ui-overhaul/shell/gnome-music-card-preview.png) |
| Weather | [Before](screenshots/ui-overhaul/before/gtk-weather-card-preview.png) | [GTK](screenshots/ui-overhaul/gtk/gtk-weather-card-preview.png), [Shell](screenshots/ui-overhaul/shell/gnome-weather-card-preview.png) |
| Brief | [Before](screenshots/ui-overhaul/before/gtk-brief-card-preview.png) | [GTK](screenshots/ui-overhaul/gtk/gtk-brief-card-preview.png), [Shell](screenshots/ui-overhaul/shell/gnome-brief-card-preview.png) |
| Preferences | [Before](screenshots/ui-overhaul/before/preferences.png) | [Dark](screenshots/ui-overhaul/preferences/dark.png), [Light](screenshots/ui-overhaul/preferences/light.png), [Glass](screenshots/ui-overhaul/preferences/glass.png), [640 px navigation](screenshots/ui-overhaul/preferences/narrow.png) |

Additional idle, developer, timer, stopwatch, battery and audio pill/card captures,
long text, Arabic RTL and reduced motion are included beside these files. Source
and screenshot hashes are in [the evidence manifest](screenshots/ui-overhaul/manifest.json).

Inspected iterations caught and corrected hourly rain-label clipping, hover
metadata covering expanded content, Arabic compact wrapping, a light-theme
preview contrast failure, unsupported St background-position syntax, and excess
vertical space in Appearance settings. Geometry checks alone missed several of
these; the final captures were reviewed visually.

## Validation

The release checks and input transcripts are saved in
[docs/validation/ui-overhaul](validation/ui-overhaul).

| Check | Result |
| --- | --- |
| Rust formatting / strict Clippy / locked tests | Passed: 18 tests, one explicitly opt-in artwork network test ignored. |
| Core D-Bus | Timer/pause/resume/completion/reset, stopwatch, expiration, bounds, persistence and single instance passed. |
| Providers / advanced music | Discovery, two-player selection, signals, seek/stale-track handling, artwork, lyrics, history, audio and disconnect/restart passed. |
| Weather/developer/brief contracts | Existing Phase 3–4 suite passed, including owned command completion/failure/concurrency/cancel, hook sanitization and restart behavior. |
| D-Bus activation | Activation/reactivation and persisted timer recovery passed on a private bus. |
| GTK actual input | Production layer-shell expansion, transport/player/seek, Brief, owned-task selection/cancel and Escape passed. Separate controls test passed lyrics file chooser, Follow, output/volume/mute and Next. |
| Preferences actual input | Standalone and extension-host paths passed all existing categories/controls and persisted configuration; global search navigated to and changed a real Weather row. Narrow 640 px sidebar/search/dropdown path passed. |
| Layout matrix | Nine pill/card types, short/long text, enlarged text, Arabic RTL, small/large sizes, running/waiting/completed/failed, light/dark/glass and reduced-motion paths exercised on private GTK and stock GNOME. 100%, 125% and 150% passed on both renderers; scale-specific outcomes are in the transcripts. |
| Installation safety | User-level installer not invoked; active service and installed-file hashes checked at the end. |

## Performance observations

A matched five-second sample of the production GTK compact music renderer, without
geometry instrumentation, used a private software-rendered Sway output and two
fixture MPRIS players. Baseline: **2.2% CPU / 71,328 KiB RSS**. Redesign: **2.6% /
71,428 KiB**. The RSS difference is 100 KiB; the CPU difference is 0.4 percentage
points in a very short sample. This does not establish statistical significance,
idle power consumption or hardware/endurance performance. No broad performance
claim is made. Raw results and scope are saved in `renderer-performance.json`.

The unchanged Rust advanced-music suite also measured idle 0.67% CPU, 18,136 KiB
RSS and 0.94 ms median Snapshot latency; two fixture players measured 1.0%,
21,284 KiB and 1.11 ms. These are short local samples, not production guarantees.

## Limits and review gate

Headless input and captures establish native layout/interaction behavior; they do
not certify physical GPUs, monitor hotplug, suspend, long-duration operation,
screen-reader behavior or an independently reviewed aesthetic standard. Multiple
physical monitors were not tested in this overhaul. Preferences labels remain
English; Arabic content/direction is exercised, not a full UI translation.
Actual weather networking and real authenticated agent sessions were not rerun
for a UI-only change; their deterministic contracts were regressed. Tests use
private fake audio tools, so physical speaker routing is not newly certified.

The user's installed extension remains the earlier revision. Active-installation
and physical-desktop acceptance require explicit approval and a separate backed-up
installation. No desktop restart, Mutter changes or package installation occurred.
Private libei development headers were extracted in the workspace only.

## Commits and rollback

Audit/spec `63b9d23`; tokens/tree `3d90168`; layout composition `899319d`;
native design system `9c9511d`; adaptive preferences `3460ab8`;
opacity `21fe6ac`; focus/RTL `3e98eb3`; settings density `f0cc723`;
expanded input/matrix/profile tests `723e7c5`. Subsequent search discovery and final evidence commits are visible in the branch log.

Rollback is to keep using the untouched installed application or check out
`7ee1ab6` in a separate development tree. No stored-data migration is needed.
