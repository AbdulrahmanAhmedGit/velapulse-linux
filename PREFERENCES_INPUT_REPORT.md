# Preferences interaction regression

## Scope and root cause

The installed release and `integration/product-experience` started at
`1e88bf1becc71cc42dfe9e51cce49ebcb1701f56`; their shared preferences module and
standalone launcher matched. No installed application files were replaced during
this investigation.

A reproducible defect exists in the GNOME extension preferences wrapper:
GNOME can mark its tracking `Adw.PreferencesWindow` modal. VelaPulse hides that
host and opens a separate `Adw.ApplicationWindow`, leaving GTK's modal input grab
on the invisible host. Real pointer and keyboard input then bypass the visible
controls, although the widgets remain sensitive and targetable. This is an input
routing failure rather than a missing callback, disabled widget, or transparent
overlay. The fix transfers modality to the visible window, sets its transient
parent, and closes the pair without recursive close handlers.

The user identified the **VelaPulse Settings launcher** as their original entry
point. A fresh instrumented window using the installed shared module received
real GNOME desktop pointer events; the user confirmed that its controls respond.
The standalone path also passed the isolated real-input suite without changes to
its production code. Therefore the modal-wrapper defect is proven, but it is not
proven to explain the earlier standalone launcher window. That original process
was closed for the fresh-window check; its original event state was not captured.
Do not describe the original standalone failure as conclusively diagnosed.

## Changes

- `extension/preferences-host.js`, `extension/prefs.js`: transfer modality and
  maintain the tracking-window lifecycle.
- Installation/removal scripts: include the new wrapper module.
- `tests/preferences-input.js`, `tests/preferences_input.py`,
  `tests/fixtures/wayland_input.rs`, `scripts/test-preferences-input.sh`:
  actual pointer/key regression in a private headless Wayland session, covering
  both standalone and GNOME-wrapper paths.
- `tests/fixtures/dbus-isolated.conf` and integration/provider runners: disable
  ambient D-Bus activation in tests, preventing races with the installed service.
- Cargo dev dependencies and CI: build the input driver and run the regression.
  Test compositor packages are installed only by CI, not on the user's system.

## Verification

The old wrapper redirects real pointer/key events to its hidden modal host and
receives no such events at the visible window. The fixed wrapper receives them
at the visible window, with none redirected to the hidden host.

Each full run delivered 152 pointer events and 148 key events to the visible window. The full real-input suite exercises all eight sidebar destinations; search text,
filtering and clearing; all five preview checkboxes; three pill sizes and two
card sizes; theme, placement, position, renderer and display dropdowns; animation
and startup switches; opacity keyboard adjustment and pointer dragging; all five
provider switches and priority editors; timer duration/start/reset; and stopwatch
start/reset. It checks the applied theme, dependent position sensitivity,
autostart file, live service settings, saved configuration and service restart.
The About link is clicked and its URL captured by a private URI handler; no host browser is opened.

Rust formatting, Clippy with warnings denied, Rust unit tests, release build,
application integration, provider fixtures, D-Bus activation/recovery, presentation
checks and diff whitespace checks are run separately. Automated input occurs only
in a marked private compositor and uses private configuration and D-Bus. The
active GNOME session and compositor components are not modified.

The existing host service remains active and responsive, with the GNOME extension
active. Host preferences were restored after manual checks. Installation of this
source fix is deferred; extension preferences changes can load in a new prefs
process and do not require restarting GNOME Shell.

To reproduce the automated input checks, build the debug binary and examples,
then run `scripts/test-preferences-input.sh` with GJS, GTK 4, libadwaita and Sway
available in the test environment. `VELAPULSE_TEST_COMPOSITOR_ROOT` can point to
an extracted Sway package tree so no system package installation is required.
Failure logs are kept in `target/preferences-input/` and uploaded by CI.
