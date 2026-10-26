# Second-session handoff

Use [the complete implementation prompt](../CODEX_SESSION_2_PROMPT.md). The projects remain independent; do not replace the GNOME extension with a dependency on a patched compositor.

- Host: Ubuntu 26.04.1, GNOME 50.1, Mutter 50.1-0ubuntu2.4, x86_64 Wayland.
- Live registry: layer-shell absent. Isolated Sway 1.11: layer-shell v4 present.
- Core: Rust, zbus 5, Tokio; D-Bus contract in API.md.
- GNOME: extension/extension.js and stylesheet.css, version 50 only.
- Layer-shell: backends/layer-shell.js and scripts/run-layer-shell.sh; GTK4/GJS, runtime gtk4-layer-shell 1.3.0 tested.
- Surface: namespace velapulse, TOP, zero exclusive zone, top/bottom anchoring, compact keyboard NONE and expanded ON_DEMAND.
- Key regression: preload gtk4-layer-shell before GTK or an ordinary xdg toplevel may appear.
- Tests: core/provider suites pass; isolated Shell screenshot and timer actor signal tested; Sway real layer surface plus synthetic pointer-driven expansion/timer start tested.
- Limits: fullscreen/lockscreen/scaling/physical hotplug and long-term operation still require validation; see TESTING.md.
- No system compositor was changed. User service installation was explicitly authorized; live extension discovery awaits logout/login.

Locate/clone https://github.com/AbdulrahmanAhmedGit/velapulse-linux and use its actual checkout as VELAPULSE_ROOT. Machine-private paths and transient bus addresses are intentionally not published. Build Mutter in a separate directory/prefix. Use a private bus and isolated display for VelaPulse integration to avoid controlling the user's running instance.
