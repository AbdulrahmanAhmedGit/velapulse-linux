# Roadmap and release limitations

The complete seven-phase scope and evidence-based statuses are in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md). This branch implements Phases 1–2; Phases 3–7 remain planned.

See [PHASE_1_2_REPORT.md](PHASE_1_2_REPORT.md) for implemented music capabilities, interaction tests, screenshots, performance samples and remaining gaps. Broader GNOME versions, physical monitor hotplug/fractional scaling, hardware suspend, real Spotify/browser playback and long-running stability still need validation before a daily-use release. Provider visibility settings still hide activities rather than stopping every background watcher. Compact audio status uses bounded polling; event-driven audio monitoring remains future work.

VelaPulse uses stock GNOME integration and the standard layer-shell client on supporting compositors. It does not implement or install compositor changes.
