# Session D-Bus API v1

Bus: `io.github.velapulse.Service`; object: `/io/github/velapulse/Service`; interface: `io.github.velapulse.Service1`.

| Method | Input | Result |
|---|---|---|
| Snapshot | none | JSON string `{version:1,activities:[],config:{...}}` |
| Command | id:string, action:string, seconds:uint64 | none |
| Push | activity JSON:string | namespaced id:string |
| Remove | namespaced id:string | none |
| Configure | configuration JSON:string | none |
| Changed signal | JSON:string | complete latest snapshot |

Clock IDs: timer, stopwatch. Actions: start, pause, resume, reset. Timer duration 1–86400 seconds. Reset removes the clock. Media IDs are `media:org.mpris.MediaPlayer2.…`; actions Previous, PlayPause and Next are checked against current capabilities.

Push fields: id (1–80 ASCII letters/digits/underscore/dot/hyphen), title (1–256 UTF-8 bytes), description (up to 1024 bytes), status (loading/active/paused/completed/warning), progress (null or finite 0–1), icon (up to 128 bytes, no command semantics), expires_in (1–86400 seconds, default 300). External controls must be empty. Entire JSON is limited to 4096 bytes. Quota: 16 per connection, 128 globally. IDs become `external:<unique-bus-sender>:<id>`. A Push on the same connection/id updates. Remove checks connection ownership. Expiration applies even after publisher disconnect. Keep the connection alive to update or remove; reconnecting creates a new ownership namespace.

Provider snapshots may include source (player name), position_seconds and duration_seconds for media timing. These fields cannot be supplied by external publishers.

Configuration: surface=floating/panel (default floating; panel is GNOME Top Bar placement, layer-shell stays floating); card_size=normal/large; position=top/bottom (default bottom); appearance=dark/glass/light; animations=boolean; size=small/medium/large; opacity=65..100; monitor=-1 (default)/0..31; enabled=[timer,stopwatch,media,battery,volume]; priorities={provider: -100..100}; autostart=boolean. Configure replaces configuration, filling omitted fields with defaults. Read-modify-write Snapshot.config to preserve other settings. Enabled providers currently control activity visibility; provider service watchers still run. JSON config is saved under `$XDG_CONFIG_HOME/velapulse/config.json` (fallback `~/.config`). Autostart creates/removes one XDG desktop entry for the daemon, not the layer-shell renderer.

Local file artwork may be displayed; no remote fetches. Treat all text as plain text. Renderers never interpret HTML, shell commands or executable activity actions. Applications within the same user session may control clocks/settings by design.
