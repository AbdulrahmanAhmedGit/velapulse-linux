# VelaPulse

Native Linux live activities with an original forest-and-mint visual identity. A Rust session service drives a GNOME Shell extension and a GTK4 Wayland layer-shell client. This is a working **early milestone**, not a daily-use stability release.

## What works
- Countdown timers and stopwatches: start, pause, resume, reset and completion notification.
- MPRIS discovery, metadata, local artwork, extrapolated progress, capability-checked controls and player removal.
- UPower battery status and optional PipeWire/WirePlumber volume via `wpctl`.
- Priority-ordered activities; bounded, connection-owned external activities over session D-Bus.
- XDG configuration, themes, top/bottom placement, monitor selection, motion preference and daemon autostart.
- GNOME pill/card with outside-click collapse, Escape, focusable controls and lifecycle cleanup.
- Real layer-shell surface using GTK4, with zero exclusive zone and on-demand expanded keyboard input.

## Build and run
Requires Rust 1.99.1 (the version used for validation), a C linker, Linux and session D-Bus. The core does not require GTK development packages.

```sh
cargo build --release --locked
./target/release/velapulse capabilities
./target/release/velapulse daemon
# In another terminal:
./target/release/velapulse timer start 300
./target/release/velapulse stopwatch start
./target/release/velapulse snapshot
```

### GNOME 50

```sh
./scripts/install-user.sh
```

This installs only user files and starts `velapulse.service`. GNOME Wayland may require logout/login to discover the new extension. The installer queues enablement without restarting Shell. Start the service again after login with `systemctl --user start velapulse.service`, or turn on the application's Autostart setting. Autostart is off by default. Existing unrelated extensions are preserved. Remove with `./scripts/uninstall-user.sh`; configuration is retained.

### Layer-shell compositors
Requires GJS, GTK4 and `gir1.2-gtk4layershell-1.0`/`libgtk4-layer-shell0` (distribution names vary). Start the Rust daemon, then:

```sh
./scripts/run-layer-shell.sh
```

The launcher sets Wayland and preloads gtk4-layer-shell before GTK. Always use it instead of invoking the JavaScript file directly. Unsupported compositors are rejected; GNOME's extension remains independent of future Mutter work. Never run both renderers in the same session unless duplicate UI is intentional.

## External activities

```sh
./target/release/velapulse push '{"id":"build","title":"Building project","description":"Compiling","status":"active","progress":0.4,"expires_in":60}'
```

A CLI push is one-shot and expires. Applications updating/removing activities must retain a single D-Bus connection. See [the API contract](docs/API.md).

## Verification and limitations

See [TESTING](docs/TESTING.md), [ROADMAP](docs/ROADMAP.md), [architecture](docs/ARCHITECTURE.md), and [environment](docs/ENVIRONMENT.md). Tested with isolated GNOME 50.1 and Sway 1.11; live service installation verified. The active desktop needs logout/login before its newly installed extension can be shown. Actual Spotify/browser playback, physical monitor hotplug, suspend/resume, fractional scaling and long-running reliability remain unverified.

Audio uses a bounded 15-second fallback rather than native PipeWire subscription. Remote artwork is deliberately not downloaded. Timers are monotonic in-process and not persisted across service restart; suspend time is not included on Linux. Some settings are available only through the JSON configuration API. Layer-shell styling/features are less complete than the GNOME renderer.

## License and inspiration

Original code: MIT. Conceptual inspiration: [nixesty/now-bar](https://github.com/nixesty/now-bar), an unrelated GPL-3.0 Windows project. No code or assets were copied and there is no affiliation. See [provenance](docs/LEGAL.md) and [dependency inventory](docs/DEPENDENCIES.md). VelaPulse is a provisional name; this is not trademark clearance.
