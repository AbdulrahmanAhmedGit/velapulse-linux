# Development

Toolchain used: Rust/Cargo 1.99.1. Use `cargo build --locked`. On the original host the toolchain was installed inside the parent workspace's `work/toolchain`, without changing PATH or privileged packages. This toolchain is not part of the repository.

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo build --locked
./scripts/integration.sh
./scripts/test-providers.sh
node --check extension/extension.js
node --check backends/layer-shell.js
node tests/presentation.mjs
```

The second test suite requires `/usr/bin/python3` with PyGObject. Tests run on private D-Bus sessions; do not redirect them to the real session. Optional system UPower/wpctl reads are still possible but no system setting is changed.

For isolated Shell testing use separate XDG_DATA_HOME/XDG_CONFIG_HOME, `GSETTINGS_BACKEND=keyfile`, a private D-Bus session, and `gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720 --wayland-display velapulse-test`. Install the extension only into that test data directory and set its enabled-extensions list there. Do not replace the running compositor. Shell Eval was enabled only in a disposable test copy for actor inspection; production extension never enables it.

Sway tests used headless backend, pixman rendering and locally extracted Ubuntu packages. The client used `GSK_RENDERER=cairo` to avoid software-headless Vulkan warnings. `cargo build --example test-pointer` builds a small virtual-pointer fixture; use `VELAPULSE_ISOLATED_TEST=1` and an explicitly isolated WAYLAND_DISPLAY. Never point this fixture at a user's live desktop.

Package core and extension independently. `scripts/install-user.sh` installs to user directories; `scripts/uninstall-user.sh` reverses the installation and preserves settings. No system Mutter patching is involved.

Optional preferences integration test on an isolated bus and Wayland display: `VELAPULSE_ISOLATED_TEST=1 gjs -m tests/preferences-smoke.js`. It manipulates actual native controls and verifies the saved D-Bus configuration. libadwaita is required for preferences. Set the private bus activation environment to its test display/XDG directories before testing the extension preferences host; do not let activated applications use the user's real display.

Phase 1–2 checks: build binaries and examples, then run `scripts/test-music.sh` for two deterministic MPRIS players, private audio tools, lyrics/history and resource samples. `scripts/test-music-input.sh` uses the same marked private Sway runtime as preferences to send real pointer and keyboard events to production GTK music controls, including the actual LRC file chooser. Set `VELAPULSE_TEST_NATIVE=1` to additionally exercise the full production layer renderer; Gtk4LayerShell must be available. The temporary native module only records geometry; the test uses the same preload required by the official launcher. No production test hooks are installed.

`tests/gnome_smoke.py`, run with `dbus-run-session --config-file=tests/fixtures/dbus-isolated.conf -- /usr/bin/python3 tests/gnome_smoke.py`, optionally launches a separate stock GNOME 50 headless session and an instrumented disposable extension copy. It observes geometry, activates actual St button signals and captures the private stage. This is a render/callback smoke, not proof of physical pointer/keyboard delivery on the user's GNOME session. It never enables Shell Eval or edits the active compositor/session. Standard session services absent on the private bus may log unrelated startup errors; extension errors and music actions are checked separately.

A real-player check is available through `tests/real_player.py` on a private bus with `VELAPULSE_TEST_MPV_MPRIS` pointing to a distribution mpv-mpris plugin. mpv uses generated silence and null audio/video sinks, without reading a user profile or playing sound. No fixture or private audio helper is copied by the installer. Optional test screenshots are captured only when `VELAPULSE_TEST_GRIM` points to grim; logs are in target/music-input and target/phase-1-2.
