# User installation

VelaPulse is independent of Mutter. Standard GNOME needs no compositor patches.
The extension currently declares GNOME Shell **50** support. Other GNOME versions
need compatibility work before enabling it. Native sessions need to advertise
`zwlr_layer_shell_v1`; desktop names alone are not a capability check.

The downloadable preview bundle includes an x86_64 binary built on Ubuntu
26.04.1 and the complete source. Build from source on other distributions.

Build with a stable Rust toolchain and the system Wayland development libraries:

```sh
cargo build --locked --release
```

Runtime: session D-Bus, systemd user manager, GJS, GTK4, libadwaita and a complete
icon theme. Native rendering additionally needs Gtk4LayerShell introspection and
`libgtk4-layer-shell.so.0`. On the Ubuntu 26.04 VM, the relevant runtime packages
are `gjs gir1.2-gtk-4.0 gir1.2-adw-1 gir1.2-gtk4layershell-1.0
libgtk4-layer-shell0 librsvg2-common yaru-theme-icon`. Other distributions may use
different package names. WirePlumber's `wpctl` and UPower are optional providers.
The tested minimal Ubuntu VM had selected Yaru without its icon package; install
the selected theme rather than accepting broken placeholder icons.

When you intend to change the current user's installed application:

```sh
./scripts/install-user.sh
velapulse doctor
velapulse preferences
```

This installs/replaces the user binary, extension and renderer, adds a settings
launcher, installs a systemd **Type=dbus** unit and D-Bus activation file, reloads
the user manager, and starts/reuses the service. It also enables the extension.
A newly installed or cached extension may require logout/login. An active timer
can defer replacement of a running daemon; the installer says when this happens.

For a supported native Wayland session without GNOME:

```sh
./scripts/install-user.sh --native-only
velapulse snapshot
```

This skips GNOME enablement. Native dependencies must still be installed. The
service owns the renderer. Do not also launch `run-layer-shell.sh` for ordinary
use; that script is retained for explicit development diagnostics.

## Startup and backend choices

D-Bus activation makes the service available whenever the extension, settings,
or CLI asks for it, including after login. `Start at login` adds a desktop entry
that requests the service through this same activation path. Turning it off
removes that proactive request; a still-enabled extension can request the service
itself. Disable the extension as well if you want no desktop UI at login.

Automatic mode probes the live Wayland registry, then attempts GTK initialization.
Only a mapped renderer owns `io.github.velapulse.Renderer`; the GNOME extension
hides while that name is owned. If native startup fails or its process exits,
the extension reappears. There are at most three failed attempts per backend
configuration; change the backend or restart the VelaPulse service to retry.
The initialization deadline is eight seconds. A compositor/session change needs
a fresh graphical session and service startup to re-probe its registry.

Preferences → General selects Automatic, Native layer shell, or GNOME extension.
Panel placement always uses the extension. Native mode falls back if unsupported;
it never installs Mutter or changes the compositor. TOP surfaces intentionally
stay below fullscreen and are hidden by the compositor at lock time.

The systemd user manager needs the session's Wayland environment. GNOME normally
imports it. If doctor shows the wrong/missing display, inspect
`systemctl --user show-environment` and import `WAYLAND_DISPLAY`,
`XDG_CURRENT_DESKTOP`, and `XDG_SESSION_TYPE` from your graphical session before
restarting VelaPulse. Do not copy another session's socket or bus address.

## Removal

```sh
./scripts/uninstall-user.sh
```

This disables the extension, stops/disables the service and removes installed
VelaPulse files, D-Bus activation and settings launcher. Configuration and clock
state remain in `$XDG_CONFIG_HOME/velapulse` (normally `~/.config/velapulse`).
Delete that directory separately only if you want to discard your preferences
and saved timers. A cached GNOME extension may need logout/login to unload.

## Clock behavior

Timers/stopwatch use Linux `CLOCK_BOOTTIME`, so running clocks include suspend
without wall-clock jumps. Commands save atomic clock state; daemon restarts on
the same boot use boot-time deltas. Across a reboot, recovery uses the saved wall
time, clamped against negative deltas. Large clock corrections across reboots
can therefore affect the recovered interval. Paused clocks stay paused.
Completion notification is best-effort through the desktop notification service;
absence of that optional service does not break clocks. No host suspend was used
to validate this implementation; actual hardware wake behavior remains a gate.
