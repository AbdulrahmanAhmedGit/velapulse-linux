# Roadmap and limitations

## Implemented milestone
Rust core, validated local IPC, priority scheduling, clocks, MPRIS, UPower, volume fallback, notification delivery, persisted configuration and daemon autostart; GNOME and layer-shell renderers; independent Git history; repeatable core/provider tests.

## Before calling this a daily-use release
- Verify active desktop after logout/login, actual players, keyboard-only navigation, outside clicks, fullscreen and lock/unlock.
- Test physical monitor hotplug, per-monitor scaling, very small screens and compositor differences.
- Make provider-disable settings stop background watchers, not only hide their activities.
- Replace 15-second wpctl sampling with event-driven audio integration.
- Add suspend-aware and restart-persistent timer policy, with tests. Current monotonic timers exclude suspend.
- Remote artwork caching with strict resource/security limits; complete GTK artwork and settings parity.
- Arbitrary timer-duration entry and priority controls in preferences. Native preferences now cover provider visibility, appearance, size, opacity, position, display and startup.
- Continue checking transitions, long titles and accessibility across display sizes. Native animation preferences now respect system reduced motion.
- Provider restart/backoff stress testing, malformed peer fuzzing and extended soak benchmarks.
- Standardized packaging and cross-distribution CI; broader GNOME versions only after testing.

Mutter layer-shell is a separate optional project. VelaPulse's GNOME backend remains useful without it. Native compositor support is not implemented in this repository.
