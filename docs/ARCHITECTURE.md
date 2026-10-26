# Architecture

`src/model.rs` owns clocks, expiry and stable priority ordering. `src/config.rs` validates and persists XDG settings. `src/main.rs` exports the D-Bus service and CLI. `src/providers.rs` isolates MPRIS, UPower, notifications and optional wpctl integration. `src/capabilities.rs` inspects the live Wayland registry.

The daemon owns `io.github.velapulse.Service`, exports `/io/github/velapulse/Service`, and implements `io.github.velapulse.Service1`. Renderers read Snapshot and listen to Changed, never maintain authoritative timer state. Commands are explicit fixed actions. No HTTP server or arbitrary-command execution exists.

External activities are namespaced by the caller's unique D-Bus connection name. The session bus is the same-user trust boundary, not a sandbox between mutually hostile applications of the same user. Configuration and clock/media control are available to session clients. External remove/update cannot cross connection ownership. Payloads, counts, text length and expiry are bounded. Disconnected one-shot publishers expire naturally.

The engine wakes on mutations, running clocks and expiration deadlines. MPRIS watches D-Bus signals and extrapolates progress between events. UPower watches property signals. wpctl is a fixed-command optional fallback every 15 seconds with a two-second timeout. Renderers avoid rebuilding focused controls every second.

## Desktop backends
GNOME uses St/Clutter actors inside Shell, addChrome without struts, tracked fullscreen, monitored geometry changes and explicit disable cleanup. Only GNOME 50 is declared compatible. No Rust window is embedded in Shell.

Layer-shell uses GJS/GTK4 with the maintained MIT gtk4-layer-shell library. It is a real compositor surface, namespace `velapulse`, layer TOP, exclusive zone 0, horizontally centered, top/bottom anchor with margins. Keyboard mode is NONE when compact and ON_DEMAND when expanded. Monitor selection falls back to the first available monitor; GNOME uses its primary monitor. The layer TOP is intended to respect fullscreen stacking, but compositor-specific behavior still needs validation. Outside-focus collapse depends on focus delivery; Escape and Close are explicit alternatives.

GTK4/GJS avoids missing Rust GTK development packages on this host while retaining a Rust core. A future Rust renderer can use the same D-Bus protocol. Future Mutter layer-shell needs no core changes: advertise the standard global and use this client. Capability detection is independent of desktop-name matching. The detection command reports a recommendation; it does not automatically enable an extension or install dependencies.
