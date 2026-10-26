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
```

The second test suite requires `/usr/bin/python3` with PyGObject. Tests run on private D-Bus sessions; do not redirect them to the real session. Optional system UPower/wpctl reads are still possible but no system setting is changed.

For isolated Shell testing use separate XDG_DATA_HOME/XDG_CONFIG_HOME, `GSETTINGS_BACKEND=keyfile`, a private D-Bus session, and `gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x720 --wayland-display velapulse-test`. Install the extension only into that test data directory and set its enabled-extensions list there. Do not replace the running compositor. Shell Eval was enabled only in a disposable test copy for actor inspection; production extension never enables it.

Sway tests used headless backend, pixman rendering and locally extracted Ubuntu packages. The client used `GSK_RENDERER=cairo` to avoid software-headless Vulkan warnings. `cargo build --example test-pointer` builds a small virtual-pointer fixture; use `VELAPULSE_ISOLATED_TEST=1` and an explicitly isolated WAYLAND_DISPLAY. Never point this fixture at a user's live desktop.

Package core and extension independently. `scripts/install-user.sh` installs to user directories; `scripts/uninstall-user.sh` reverses the installation and preserves settings. No system Mutter patching is involved.
