# Expanded card rebuild — 31 October 2026

This revision responds to the rejection of the earlier card experience. The
previous overhaul's screenshots and measurements remain historical evidence;
passing them did not establish product acceptance.

## Problems corrected

Both renderers keyed the entire card on the complete activity-ID list and control
array. Starting a timer, discovering a player or removing another activity could
therefore destroy the open music subtree, resetting lyrics, scroll and focus.
Timer pause/resume also replaced its primary button. Weather/developer cards hid
the activity switcher, and all other cards truncated it to five entries.

The card's identity now depends on its selected activity and presentation type.
Membership changes reconcile only the keyed navigation subtree. Timer controls
retain a playback slot whose action updates in place; the callback reads the
current action. Native audio polling retains device controls when the list has
not changed. Errors from regular card commands are visible inside the card.

## Redesigned composition

- Music: 88-pixel square artwork beside track, artist and player identity. The
  existing player chooser, seek, time labels and transport follow directly below.
  Lyrics attachment and output controls remain available; Follow appears when
  lyrics are open. Long and Arabic metadata use bounded native text layout.
- Weather: location/conditions and an inline temperature/icon reading, three
  metrics, then Hourly / 5 days tabs. Both forecast trees stay mounted, preserving
  the selected tab during live updates. Attribution and stale/error states stay
  visible. Explicit shared viewport sizing reserves space for the scrollbar;
  a geometry assertion catches rain labels underneath it.
- Timers/stopwatch/power/audio: concise titles and real status replace decorative
  copy. Tabular numeric readings, progress and the existing contextual actions
  share a compact hierarchy. Pause/resume retains keyboard focus.
- Brief: an At a glance overview with existing structured rows, shared header and
  navigation. It no longer includes a disabled button to reopen itself.
- Developer/external activities: shared header/footer and available activity
  navigation, status-driven content, existing owned-task cancel behavior and
  explicit guidance to return to the original agent for permission decisions.
- Every card: shared category/close/preferences header, horizontal navigation
  without a five-item cap, and a compact Now Brief / New activity footer. Timer
  presets are disclosed without replacing the open activity's body. The idle
  card shows presets directly and hides the redundant New activity control.

The compact pill's geometry, Rust engine, D-Bus contracts, providers and settings
schema are retained. `card-state.js` owns plain presentation identity, controls
and navigation descriptions. The GTK/St adapters render keyed native widgets,
including forecast tabs. Modified shared adapters and music controls have been
formatted into readable modules rather than compressed one-line implementations.

## Genuine captures

These are unedited captures of running native code in private sessions. Media,
weather, battery/audio and agent state in layout fixtures are explicitly test
data. They are not mockups or current conditions.

| View | Prior cards | Rebuilt |
| --- | --- | --- |
| Music | [Before](screenshots/ui-overhaul/gtk/gtk-music-card-preview.png) | [GTK](screenshots/card-rebuild/gtk-music-card-preview.png), [Shell](screenshots/card-rebuild/gnome-music-card-preview.png) |
| Weather | [Before](screenshots/ui-overhaul/gtk/gtk-weather-card-preview.png) | [GTK hourly](screenshots/card-rebuild/gtk-weather-card-preview.png), [Daily tab](screenshots/card-rebuild/gtk-weather-daily.png), [Shell](screenshots/card-rebuild/gnome-weather-card-preview.png) |
| Timer | [Before](screenshots/ui-overhaul/gtk/gtk-timer-card-preview.png) | [GTK](screenshots/card-rebuild/gtk-timer-card-preview.png), [Shell](screenshots/card-rebuild/gnome-timer-card-preview.png) |
| Brief | [Before](screenshots/ui-overhaul/gtk/gtk-brief-card-preview.png) | [GTK](screenshots/card-rebuild/gtk-brief-card-preview.png), [Shell](screenshots/card-rebuild/gnome-brief-card-preview.png) |

Other activity layouts, long metadata, Arabic RTL and reduced motion captures are
stored alongside these. The image manifest records checksums and source scope.

## Actual validation

- Native Wayland input: player selection, playback, seek, file chooser/LRC,
  synchronized lyrics, Follow, output selection, volume/mute, Brief, owned-task
  cancellation and Escape.
- Regression: an open music/lyrics subtree keeps the same widget/actor identity
  while a stopwatch appears and disappears. GTK additionally checks that the
  lyric toggle stays open.
- Regression: actual timer pause, identical focused button, Space to resume using
  the updated command, then reset.
- Regression: eight real owned external fixtures overflow the navigation viewport;
  actual horizontal input reaches a target beyond the previous five-item limit,
  then the same D-Bus connection removes its fixtures.
- Forecast tabs: actual pointer selection of daily/hourly in both renderers; daily
  selection persists while another activity is inserted. Keyboard and pointer
  forecast scrolling, empty/offline states and theme changes remain exercised.
- GTK and stock GNOME: 100%, 125% and 150%, nine existing activity layouts,
  long/short text, Arabic RTL, enlarged type, reduced motion and small/large cards.
  Final expanded long/RTL/enlarged metadata checks also passed at 100%; scaled
  runs preceded the final metadata bounds and seek-track refinement.
- Rust formatting, strict Clippy, unit tests, release build, core/provider/music/
  Phase 3–4 contracts and isolated D-Bus activation regressions.
- Installer import-closure test covers `card-state.js` and all relative imports in
  both installation roots. Installed Preferences maps correctly after the update.

Raw input transcripts and allocation matrices are in
[validation/card-rebuild](validation/card-rebuild). The test input driver waits
for target and bottom-anchored surface geometry from a settled frame before
clicking, avoiding stale coordinates during intentional view changes. Fixture
publishers retain their D-Bus connection to exercise actual ownership semantics.

## Installation and limits

The user authorized installation and requested that validated revisions keep the
installed version current. The updated native UI files are installed; checks
compare every installed JavaScript/CSS file to the checkout and verify preserved
settings and a responsive service. A private recovery archive was created first.

GNOME 50 caches loaded extension modules. The running desktop is not restarted;
new Shell card code takes effect after logout/login. Updated Preferences runs in
a fresh process immediately. Native layer shell remains unavailable on the
active stock GNOME desktop, with its existing extension fallback retained.

The genuine private-session evidence does not certify physical GPU/hotplug,
suspend, screen readers, real speaker routing or endurance. Visual acceptance
remains the user's judgment. No new provider or product feature was added.

Implementation: `1dd778c`; input regressions: `4ae3204`; subsequent geometry and
verification refinements: `ff326bc` and `f9dfeba`. Review continues on
[PR #4](https://github.com/AbdulrahmanAhmedGit/velapulse-linux/pull/4).
