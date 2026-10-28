# VelaPulse × Mutter integration report

Implemented and verified on 2026-10-28. Application branch:
`integration/product-experience`. Runtime implementation starts at `469e83a`;
`f081b47` adds the artwork-fixture regression and compact-well alignment;
subsequent branch commits contain final evidence/documentation and matching compact-content alignment across renderers. Use the branch tip for delivery.

## Independent integration boundary

VelaPulse remains MIT-licensed and independently maintained. No Mutter code was
copied into it. The integration boundary is the standard Wayland layer-shell
protocol, session D-Bus, and the existing desktop interfaces.

Mutter was inspected at `1b348db8feafbc869aa8b150bc4555c05ddd25b2`, branch
`ubuntu/resolute-layer-shell`, with final compositor code
`efc2763aefb45176e7088868a9f278d44e3d4fe3` and candidate
`50.1-0ubuntu2.4+layershell4`. GitHub confirmed its repository is private. No
Mutter source, history or visibility changes were made. Its upstream/package/
protocol validation suites were not repeated and its packages were not rebuilt.
Existing candidate DEBs were reused only inside the established disposable VM.

## What changed

- The daemon probes the actual Wayland registry and supervises native GTK when
  supported. Panel mode and explicit extension mode select the GNOME path.
- GTK owns `io.github.velapulse.Renderer` only after mapping. The extension
  follows ownership, hides during native rendering, collapses hidden cards and
  returns on failure. GTK exits when its service disappears. SIGTERM, bus loss,
  child cleanup, an eight-second initialization deadline and three failed
  attempts bound the lifecycle. Neither renderer takes exclusive keyboard focus.
- Installation now includes D-Bus activation and a systemd `Type=dbus` service,
  retaining `DoNotQueue` single-instance ownership. The prior installer started
  a service without enabling it and installed no activation file: after login
  there could be no owner for `io.github.velapulse.Service`. The extension can
  now activate the same service when needed. Autostart requests use activation
  rather than spawning a competing unmanaged daemon.
- `velapulse doctor` reports configuration, live protocol availability, service
  ownership/responsiveness, native readiness, extension installation/state when
  available, and remediation. It does not activate the daemon just to inspect it.
- Timers/stopwatch now use Linux `CLOCK_BOOTTIME` and atomic saved state. Running
  clocks include suspend time; paused clocks remain paused after daemon restart.
  Same-boot recovery uses boot-time deltas; reboot recovery uses wall-time deltas.
- Added `velapulse run TITLE -- PROGRAM ARGS...`: one public-API activity per
  explicit command, bounded lease refresh, completion/failure and exit status.
  Codex/Claude examples indicate session lifetime without private API assumptions.
- Fixed stale volume data after failed optional `wpctl` sampling.
- Added backend preferences, a desktop settings launcher, existing-window reuse,
  and an installation path that skips GNOME enablement for native-only sessions.

## Visual experience

VelaPulse Orbit adds shared Cairo progress rings around the compact 24px icon
well, lavender primary controls, fine surface borders, legible compact text and
consistent dark/light surfaces. Both renderers share presentation, icon/action
semantics and ring drawing. Native media cards retain original fallback artwork,
provider identity, timings and capability-driven transport controls. Settings
retain the existing live previews, sizes, opacity, provider priorities, display,
placement and motion controls. GTK collapses its card when settings opens.

Actual screenshots were reviewed, not merely collected. Review caught compact
text inheriting an unsuitable GTK button color, which was corrected. The minimal
VM selected Yaru without its icon package; installing the guest's missing theme
fixed placeholder icons. This was a guest dependency repair, not a host change.

Screenshots in `docs/screenshots/` show native music/timer/compact surfaces,
settings, extension cards, second-display placement, fractional scale and
fullscreen. Music screenshots use the explicitly named deterministic MPRIS peer
and original fallback artwork. They are not evidence of Spotify/browser playback.

## Actual verification

| Check | Result |
| --- | --- |
| Release build, formatting, Clippy with warnings denied, four Rust tests | Passed |
| Isolated D-Bus application integration | Timer pause/resume/completion/reset, stopwatch, expiry, validation, configuration, restart recovery and single-instance passed |
| Isolated provider suite | MPRIS metadata/local artwork/progress/actions/removal; unavailable controls; external ownership/update/removal/quotas passed |
| Actual private-bus activation | Initial activation, termination/reactivation and saved running timer recovery passed |
| Presentation tests and JS/shell syntax | Passed |
| Native GNOME VM | Mapped GTK layer role, compact/expanded UI, pointer timer pause and Escape collapse passed |
| Renderer handoff | Explicit extension/automatic-native switching passed with only one mapped interface |
| Final native lifecycle | Stop removes actual GTK process and readiness, extension returns; activation starts a fresh renderer; missing renderer assets produce bounded failures while fallback remains usable |
| Service restart | Native and extension reconnect; running/paused clock recovery passed |
| Settings widgets | Queued changes, live clock updates, slider draft preservation and search passed in actual GTK widgets |
| Actual MPRIS UI | Native music card and pointer playback pause passed with controlled peer |
| Output/scale/fullscreen | Second actual virtual output/top placement, live 125% GTK bounds and TOP placement below focused fullscreen passed |
| Real lock screen | GTK actor became unmapped and extension disabled while locked; normal password authentication restored the desktop |
| Stock Ubuntu session | Stock `50.1-0ubuntu2.4`, no layer-shell global, fresh-login activation, extension card/pointer pause/restart/recovery passed |
| VM uninstall/reinstall | Binary and D-Bus activation removed, settings retained, then reinstalled successfully |

The initial lock harness incorrectly used an actor's logical `visible` property.
Actual state showed `visible=true` but `mapped=false`; the latter is the relevant
rendering observation. No claim about password-input isolation was inferred from
that flag. The earlier Mutter input-security campaign was not rerun. An early
artwork-fixture failure was corrected in the fixture's D-Bus variant construction
and local-artwork metadata is now covered by the provider suite.

## Performance and deployment boundaries

The final 15-second idle sample in the 4-vCPU/6-GiB KVM guest recorded 0.0% of one
CPU core at the sample's tick resolution for both the daemon and mapped GTK.
RSS: daemon **6.22 MiB**, GTK/GJS **171.87 MiB**. This is a short idle measurement,
not proof of zero CPU usage or active-playback/hardware performance. GTK memory
is material and should be profiled before a broad release. No permanent visual
animation loop was added; ring/progress updates follow activity updates. Guest
software-rendering EGL/Vulkan fallback diagnostics remain in logs.

No experimental packages were installed on the workstation. Its running GNOME,
GDM, power state, user application, service and autostart were not changed. Only
source/build work and isolated application buses ran there. Host read-only
package checks still report stock Mutter `50.1-0ubuntu2.4`. The guest was returned
to stock packages after native testing; package audit/integrity were clean.

## Remaining limitations

- GNOME extension support is declared for Shell 50. Other versions are unverified.
- Real Spotify/browser players and multiple real concurrent players have not
  been independently exercised. The activity rail supports selection, but test
  peers do not establish universal player compatibility.
- Remote artwork is not fetched; local file artwork works and remote-only tracks
  use the original fallback. Volume is optional 15-second sampling, not a mixer.
- Physical hotplug, mixed physical scales, hardware suspend/wake, accessibility,
  long-duration operation and active GPU/resource profiling remain open.
- Boot-time accounting is implemented and pause/restart recovery tested. No host
  or new guest suspend campaign was run. Cross-reboot wall-clock corrections can
  affect recovered intervals. Notification delivery remains best-effort.
- Native startup retries are intentionally bounded; change the backend or restart
  VelaPulse to retry after repairing dependencies. New/cached extension code and
  compositor changes may require a fresh session.
- Native layer shell has no GNOME fallback outside GNOME if initialization fails;
  doctor/journal diagnostics explain the missing prerequisites.
- The experimental Mutter deployment keeps the prior unresolved power/hardware
  and long-term stability gates. It is not workstation-ready.

See [release readiness](RELEASE_READINESS.md), [installation](docs/INSTALLATION.md),
[developer adapters](docs/INTEGRATIONS.md) and the recorded `docs/evidence/` files.
