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
- Reference-led charcoal/plum styling, content-specific media/timer/power cards and compact icon controls implemented in both native renderers.
- Pure presentation checks pass for clocks, paused/playing controls, media timing, external and idle states.
- Native libadwaita widget test passes: selecting size/appearance and toggling motion updates and persists the real service configuration on an isolated bus.
- Local screenshots inspected for GNOME timer and media cards, GTK battery layout, light appearance and native preferences. Controlled MPRIS fixtures are labeled as test players and do not ship as production providers.
- Configuration writes are serialized; invalid opacity/size and external attempts to supply provider metadata are rejected by integration tests.
- Live installed service upgraded; the previous login-started instance was stopped only after verifying no active clocks/external work. The GNOME extension has updated files, but version 1 remains loaded until a new login. Standalone preferences was opened against the live service.

A final layer-shell screenshot exposed an artwork sizing bug: the source image's intrinsic width could expand the GTK card off-screen. The renderer now uses a native artwork widget whose measurement is independent of source pixels, and limits label measurement. The corrected media card was inspected under Sway without clipping.

## Reference layout and Top Bar update
- GNOME 50 isolated test: six live switches between floating and panel placements, compact-button activation, media controls, repeated expansion, panel cleanup and re-enable. Panel mode hides the floating pill and anchors the expanded card below the panel control.
- Custom three-column preferences verified through both the GNOME extension preferences host and the standalone app. Native widget integration persists appearance, size, motion and panel placement over D-Bus.
- Dark media and settings screenshots inspected at 1600×1000; GTK media card inspected at 1280×720 under Sway. Test artwork/title are deterministic fixtures.
- Added validation for unknown surface and card sizes. Existing settings default to floating with normal cards. Layer-shell intentionally stays floating.
- User-level files installed. An active desktop timer caused the installer to defer the core restart; the timer was preserved. Updated core and extension take effect at the next login. The isolated session ran the updated binaries.

A synthetic stress test that destroys the extension immediately after 20 expand/collapse calls in one frame triggers a GNOME allocation warning for the removed actor. Allowing a frame before lifecycle removal passes without new warnings; ordinary mode switches and preferences were inspected independently. The responsiveness update below resolves this edge case; immediate teardown after rapid toggling was rechecked without new allocation warnings.

## Responsiveness fix — 2026-10-27
- Reproduced card allocation warnings with animations enabled. The same isolated GNOME exercise (12 open/switch/close cycles, large pill, running timer) produced 152 positioning calls before the fix and 105 after; 19 versus 20 incoming updates. This is a bounded workload comparison, not a frame-rate or general desktop performance claim. The previous log had six allocation warnings; the updated floating and panel workloads had none.
- Layout notifications now schedule one coalesced idle positioning pass, rather than resizing/repositioning actors inside allocation callbacks. Width/style writes are skipped when unchanged; activity switching updates selection immediately. Pending positioning work is removed during disable.
- Settings now separate configuration synchronization from activity ticks and preserve draft/in-flight changes. The native regression test reproduced an opacity edit being overwritten on the previous code and passes against the fix, including search results surviving clock updates.
- Existing Rust format, Clippy, unit, D-Bus/provider and presentation checks passed. Test peers stayed on an isolated bus; real user configuration and the login-started daemon were preserved.
- Version 4 extension files and standalone preferences installed. The corrected settings window was launched without a reported process error. The running GNOME extension needs a new login to load the card fix; live desktop smoothness after that login still needs user confirmation.
