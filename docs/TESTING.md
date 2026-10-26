# Validation — 2026-10-26

## Passed
- Rust debug and optimized release builds with Rust 1.99.1.
- cargo fmt, Clippy all targets with warnings denied, git diff whitespace check.
- Four unit tests: clock pause/resume, completed-clock behavior, payload rejection, expiry/priority behavior.
- Isolated D-Bus integration suite: countdown completion, pause/resume, reset, stopwatch, external expiry, validation, settings persistence, autostart entry creation/removal and single-instance rejection.
- Isolated MPRIS fixture suite: player discovery/removal, title/artist, progress extrapolation, property signals, play/pause and next controls, unsupported previous rejection.
- External API ownership suite: update/removal on the same connection, cross-connection removal rejection and per-connection quota enforcement.
- JavaScript syntax checks for both renderers.
- GNOME Shell 50.1 headless isolated session: extension reported enabled with empty error field; real pill and card inspected in screenshots; timer button actor signal reached the service; rapid expand/collapse repeated 20 times, final opacity 255; updated code loaded after isolated Shell restart. No extension JS ERROR/TypeError/CRITICAL in final test log.
- Sway 1.11/wlroots 0.19.2 isolated headless compositor: live registry advertises layer-shell v4; actual `velapulse` layer surface confirmed in compositor log; screenshot inspected. Virtual-pointer click expanded the card and timer-button click started the core timer. Added a synthetic output, selected it, disabled it, and restored default monitor without process crash. This does not establish physical-hotplug/scaling correctness.
- Actual GNOME session: Rust user service installed and active. Extension files installed and enabled-extension setting queued. Newly installed extension is not discovered until logout/login; live desktop rendering is therefore pending.

## Measured, not estimated
Release daemon, no clocks/player active, UPower and wpctl enabled: 20.00-second sample, 0.01 CPU seconds (0.05% of one core), VmRSS 6336 kB (about 6.2 MiB). Measurement excludes GNOME Shell, GTK renderer and transient child process resources. No long-term benchmark claim.

## Defects found and fixed
- Second daemon initially queued for the D-Bus name. Explicit DoNotQueue now rejects it and the integration test passes.
- Without library preloading, the GTK layer renderer initially created an ordinary xdg toplevel. The launcher now preloads gtk4-layer-shell and Sway logs confirm a real layer surface.
- Repeated monitor assignment was avoided to prevent needless surface remapping.
- UPower fully-charged state now has its own correct label.

## Not established
Real Spotify/browser-player behavior; end-to-end notification visibility; real keyboard/screen-reader accessibility; fullscreen/lockscreen behavior; fractional scaling; physical monitor hotplug; suspend/resume; timer recovery after restart; long-duration CPU/memory stability. GNOME declares version 50 only. The Python fixture emits a deprecation warning for Gio.register_object on this host but passes; it is test-only code.

CI workflow is supplied. Its hosted result is separate from these local results and must be checked after publication.

## Design refinement validation
- Midnight/iris/sea-glass styling, content-specific media/timer/power cards and compact icon controls implemented in both native renderers.
- Pure presentation checks pass for clocks, paused/playing controls, media timing, external and idle states.
- Native libadwaita widget test passes: selecting size/appearance and toggling motion updates and persists the real service configuration on an isolated bus.
- Local screenshots inspected for GNOME timer and media cards, GTK battery layout, light appearance and native preferences. Controlled MPRIS fixtures are labeled as test players and do not ship as production providers.
- Configuration writes are serialized; invalid opacity/size and external attempts to supply provider metadata are rejected by integration tests.
- Live installed service upgraded; the previous login-started instance was stopped only after verifying no active clocks/external work. The GNOME extension has updated files, but version 1 remains loaded until a new login. Standalone preferences was opened against the live service.
