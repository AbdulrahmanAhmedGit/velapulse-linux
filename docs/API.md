# Session D-Bus API v1

Bus: `io.github.velapulse.Service`; object: `/io/github/velapulse/Service`; interface: `io.github.velapulse.Service1`.

| Method | Input | Result |
|---|---|---|
| Snapshot | none | JSON string `{version:1,activities:[],config:{...}}` |
| Command | id:string, action:string, seconds:uint64 | none |
| Push | activity JSON:string | namespaced id:string |
| Remove | namespaced id:string | none |
| Configure | configuration JSON:string | none |
| Seek | media id:string, current track id:object-path string, position:double seconds | none; capability/track/bounds checked |
| SelectPlayer | media id:string, or empty for Automatic | none; durable preference |
| Lyrics | media id:string | JSON array of `{seconds,text}` |
| ImportLyrics | media id:string, current track id:string, local file URI:string | none |
| ListeningHistory | none | JSON `{recent,songs,artists,daily,week_seconds}` |
| ClearListeningHistory | none | none; deletes local records |
| Audio | none | JSON availability/devices/default/volume/muted/routing or error |
| AudioControl | action:string (`default`,`volume`,`mute`), value:string | refreshed audio JSON or D-Bus error |
| Changed signal | JSON:string | complete latest snapshot |

Clock IDs: timer, stopwatch. Actions: start, pause, resume, reset. Timer duration 1–86400 seconds. Reset removes the clock. Media IDs are `media:org.mpris.MediaPlayer2.…`; actions Previous, PlayPause and Next are checked against current capabilities.

Push fields: id (1–80 ASCII letters/digits/underscore/dot/hyphen), title (1–256 UTF-8 bytes), description (up to 1024 bytes), status (loading/active/paused/completed/warning), progress (null or finite 0–1), icon (up to 128 bytes, no command semantics), expires_in (1–86400 seconds, default 300). External controls must be empty. Entire JSON is limited to 4096 bytes. Quota: 16 per connection, 128 globally. IDs become `external:<unique-bus-sender>:<id>`. A Push on the same connection/id updates. Remove checks connection ownership. Expiration applies even after publisher disconnect. Keep the connection alive to update or remove; reconnecting creates a new ownership namespace.

Provider snapshots may include source (player name), position_seconds and duration_seconds for media timing. The optional `music` object adds `track_id`, a stable content `key`, album, `can_seek`, playback `rate` and a six-digit artwork `color`. Duration is omitted when unknown. These fields cannot be supplied by external publishers.

Configuration: surface=floating/panel (default floating; panel is GNOME Top Bar placement, layer-shell stays floating); card_size=normal/large; position=top/bottom (default bottom); appearance=dark/glass/light; animations=boolean; size=small/medium/large; opacity=65..100; monitor=-1 (default)/0..31; enabled=[timer,stopwatch,media,battery,volume]; priorities={provider: -100..100}; autostart=boolean; selected_player=media id or empty for automatic; listening_history=boolean (default false). Configure replaces configuration, filling omitted fields with defaults. Read-modify-write Snapshot.config to preserve other settings. Enabled providers currently control activity visibility; provider service watchers still run. JSON config is saved under `$XDG_CONFIG_HOME/velapulse/config.json` (fallback `~/.config`). Autostart creates/removes one XDG desktop entry for the daemon, not the layer-shell renderer.

Artwork accepts local regular files and public anonymous HTTPS on port 443. It rejects credentials, private/reserved destinations and redirects; pins checked DNS answers; bounds request/decode resources; and exposes normalized local PNGs to renderers. Limits and failure behavior are documented in MUSIC.md. Treat all text as plain text. Renderers never interpret HTML, shell commands or executable activity actions. Applications within the same user session may control clocks/settings by design.


Seek takes seconds in 0..86400 and requires a current matching MPRIS track ID, positive known duration and CanControl/CanSeek. SetPosition is used to prevent seeking a different track after metadata changes. Transport is revalidated against current capabilities and bounded to four seconds. A preferred player may disappear; automatic fallback is temporary and the saved preference is retained for reconnection. Audio volume is 0..1, mute is `0`/`1`, default output is an extant numeric Audio/Sink ID; no arbitrary commands or per-app rerouting are exposed. Normal UI errors are surfaced instead of pretending success.

## Phase 3–4 contracts

`Weather() → s` returns JSON `{weather: View|null, error, official_warnings_supported:false}`. `WeatherSearch(s query) → s` returns up to eight validated `{name,latitude,longitude}` locations. `WeatherRefresh()` schedules a rate-limited request. No caller-controlled endpoint URL or secret is accepted. `Brief() → s` exposes enabled weather and current timer/media/developer summaries. `Command("brief","open"|"refresh",0)` opens an explicit two-minute brief activity; `Command("weather","refresh",0)` requests weather.

`DeveloperEvent(s json) → s` accepts `{provider: "codex"|"claude"|"task", session, state, title, project?, message?, event_id?, progress?}`. Unknown keys, invalid state/text/IDs/progress and disabled providers are rejected. States: starting/running/waiting/completed/failed/cancelled/disconnected. Task events are owned by their publishing bus connection; agent events are same-user opt-in observations. No event contains an executable command or permission decision.

`DeveloperCancel(s id)` emits `TaskCancelled(s id)` only for an active owned task. Its wrapper verifies the daemon signal and matching ID before signaling its own process group. Hook activities cannot be cancelled or approved through this interface.

Activities may carry provider-owned `weather`, `developer` and `summary` fields; external `Push` rejects them. Weather View includes location/timezone/current metrics, canonical Celsius values, hourly/daily arrays, selected display units, update/stale/error/notice/attribution fields. Developer View includes provider/session/state/project, start/update/elapsed timestamps, recent events and owned flag. Configuration adds nested `weather`, `developer` and local clock preferences. Old configuration files acquire opt-out defaults without migration. See WEATHER_AND_AGENTS.md for limits, semantics and setup.
