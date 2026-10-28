# VelaPulse product roadmap

VelaPulse is an original native Linux live-activity center: a compact, glanceable pill expands into useful controls. Native Linux interfaces, working interactions, modular providers, local privacy, stock GNOME compatibility, low idle cost and maintainability guide every phase. Reference screenshots inform feature density; reference code and copyrighted assets are not reused.

## Phase 1 — Core experience (current scope)

- Preferences: pointer/keyboard routing, sidebar, search, selectors, switches, bindings and durable configuration.
- Compact pill: adaptive geometry, typography, activity icons, progress, ellipsis, hover/press feedback and monitor-aware positioning.
- Expanded cards: consistent headers, navigation, controls, focus, Escape and closing.
- Design: Dark, Light and Liquid Glass; shared spacing/colors, reduced motion and efficient transitions.
- Runtime: D-Bus activation, systemd user lifecycle, renderer readiness/handoff, stock GNOME fallback, single instance, timer recovery and cleanup.

Existing integration provides these foundations. Preferences modal input capture is fixed and covered by real-input regression. See PHASE_1_2_REPORT.md for this branch's verified improvements and limitations.

## Phase 2 — Advanced music (current scope)

- Standard MPRIS discovery, removal, metadata/status, capability-aware transport, multiple players, automatic prioritization and manual selection.
- Artwork in pill and expanded card; async bounded local/remote loading, safe caching, fallback, extracted palette and readable presentation.
- Interactive progress with playback interpolation, seek/track-change handling and unknown-duration states.
- Optional user-selected synchronized local LRC lyrics. Remote lyrics require an explicitly authorized integration; no scraping or bundled lyric collections.
- WirePlumber/PipeWire default audio output, volume and mute, with supported-operation/error feedback. Default output selection does not promise per-application rerouting.
- Optional local listening history, recently played tracks, listening duration, daily/weekly song/artist summaries, disabling and clearing. No paused-time accounting, browser-history collection or uploads.

Implementation and evidence, including fixture-only coverage and real-player gaps, are tracked in PHASE_1_2_REPORT.md. Optional enhancements must preserve working playback.

## Phase 3 — Weather and Now Brief (planned, not implemented)

Current/feels-like weather, humidity/wind, hourly/daily forecasts, contextual icons/backgrounds and permitted weather alerts. Manual location, explicit location permission, rate limits and caching; no continuous location tracking. Now Brief combines date/time, weather, explicitly connected events, timers, music and selected activities. Configurable idle clock/weather behavior.

## Phase 4 — AI agents and developer activities (planned, not implemented)

Documented Codex/Claude/public tool hooks for task started/running/waiting/completed/failed, elapsed time and real progress. Approval actions only through authenticated, supported mechanisms; no fabricated permissions or security bypass. Cargo/Python/Node/build/test/CI/deployment status through supported interfaces. An optional API-based assistant must protect credentials and require consent before sharing private content. Existing explicit local-task wrappers are not a completed agent integration.

## Phase 5 — Smart Shelf and file activities (planned, not implemented)

User-driven temporary file collections, screenshot access, thumbnails, drag/drop, open/copy/remove/reveal and configurable lifetime. Safe supported ZIP/extraction, optional OCR/clipboard and documented download/transfer progress. Investigate GIO/GNOME Files interfaces; no assumed Windows API equivalents. No moving, deleting, uploading or archiving personal files without a clear user action.

## Phase 6 — Sports, gaming and digital wellbeing (planned, not implemented)

Licensed football/basketball scores, events, favorites and notifications with provider rate limits. Supported Steam/game download/install progress and speed; documented public interfaces or explicit filesystem integrations, no private authentication reverse engineering. Opt-in application usage, daily/weekly trends, reminders and user-controlled limits. Explain Wayland constraints; no covert monitoring or private content collection.

## Phase 7 — Notifications, return summaries and release polish (planned, not implemented)

Authorized application/activity notifications, grouping, priorities, safe actions and optional retained history. Optional return-from-idle summaries only from legitimately received events (timers, tasks, downloads, relevant sports and notifications). No passwords, protected lock-screen content or private app capture. Keyboard shortcuts, Arabic/English localization, accessibility, multi-monitor/fractional scaling, reduced motion, reliable themes, search and onboarding. Appropriate packages, safe updates, dependency/compatibility documentation, and measured performance/stability before broader release.

## Boundaries and release gates

This development session implements only Phases 1–2. No Galaxy Buds-specific APIs, battery/case statistics, noise cancellation or ambient mode. Standard output/volume remains in scope. No Mutter/compositor modifications, GDM restarts, host logout or reboot. Changes to the installed user app, active activities or autostart/service settings require approval. No merging main automatically. A buildable branch, tests, real screenshots, measured performance and honest evidence precede completion claims.
