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

Phase 3–4: `scripts/test-phase34.sh` runs deterministic private-bus command, hook privacy/config merge, ownership, deduplication, restart and settings checks and records short daemon resource samples. `VELAPULSE_TEST_LIVE_WEATHER=1` explicitly queries a test city; `VELAPULSE_TEST_REAL_AGENTS=1` invokes installed CLIs with a minimal test prompt, private working directory and no session persistence. These optional checks are not CI model/network claims. `VELAPULSE_TEST_WEATHER_UI=1 scripts/test-preferences-input.sh` adds actual city search/result selection through real input. `VELAPULSE_TEST_PHASE34=1` with `tests/gnome_smoke.py` captures weather/agent/brief cards using a previously saved live test forecast and synthetic agent UI events. Stock GNOME callback/render checks do not constitute physical input proof.


## Structured context UI regression

Run `node tests/context-cards.mjs` and `scripts/test-context-ui.sh`. The latter needs the same private Sway/Gtk4LayerShell setup as native music tests. Set `VELAPULSE_TEST_GRIM` for genuine screenshot capture, `VELAPULSE_TEST_SCALE=1.25` for fractional scaling, and optionally `VELAPULSE_TEST_ARTIFACTS` for a separate output directory. The test uses declared weather/agent fixtures and verifies private configuration persistence.

For actual GNOME pointer/keyboard delivery, build the marked-private-runtime EIS helper with the libei development headers and existing runtime:

```sh
cc -Wall -Wextra -Werror tests/fixtures/gnome_input.c \
  $(pkg-config --cflags --libs libei-1.0) -o target/gnome-input
VELAPULSE_TEST_GNOME_INPUT=1 VELAPULSE_TEST_PHASE34=1 \
  dbus-run-session --config-file=tests/fixtures/dbus-isolated.conf -- \
  /usr/bin/python3 tests/gnome_smoke.py
```

Add `VELAPULSE_TEST_GNOME_SCALE=1.25` for the private fractional output. This mode delivers actual EIS events, checks the private Shell owns the remote-desktop bus, and does not activate widget signals. Never target the active user desktop. The default mode remains a callback/render smoke. Optional `VELAPULSE_TEST_REAL_CODEX_UI=1` runs a real minimal ephemeral Codex task and requires working model access; it is not a fixture or a default CI requirement. Do not infer real Claude permission validation from its explicitly synthetic UI card.

See [UI quality report](PHASE_3_4_UI_REPORT.md) for results, screenshots and remaining limits. No dependency installation or host application replacement is performed by these checks.
