# Weather, Now Brief and developer integrations

These features use stock GNOME or the existing GTK layer renderer. No compositor patch is required. Installation into your active desktop is a separate explicitly approved action; build and review the branch first.

## Weather and local time

Open **Preferences → Weather & clock**, search for a city, choose a result and press **Use selected city**. Enable weather explicitly. Choose Celsius/Fahrenheit, a 15–180 minute refresh interval, and individual forecast notices. No IP geolocation or automatic tracking is used. The city and coordinates are saved locally; searches and selected coordinates are sent to Open-Meteo when you use those features. Normal HTTPS requests also expose your IP to that provider. No API key or telemetry is embedded.

The card shows current/feels-like temperature, humidity, wind, the next six forecast hours, five daily forecasts, update time, stale/error state and attribution. Backend state includes twelve upcoming hours. Forecast hours/days use the location's IANA timezone; the idle clock uses your computer's local timezone. The clock can use 12/24-hour formatting and optional temperature, and yields to active music, timers and developer activities. It updates at most every 15 seconds, with minute precision.

Open **Now Brief** from an expanded card. This is a snapshot of enabled activities, local date/time, weather/today's forecast, relevant notices, timers, music and development tasks. Refresh it for a new snapshot. It remains usable with providers disabled and expires after two minutes, so a forgotten brief does not stay in the rotation. No calendar account or fabricated event is included.

Weather requests use fixed Open-Meteo HTTPS hosts, no environment proxy or redirects, a 4-second connect / 12-second overall deadline, and a 1 MiB response limit. Automatic requests follow the chosen interval; manual refresh is capped at once per minute. Failures back off from 2 minutes to 30 minutes. A fresh persisted cache avoids an immediate fetch after restart. Offline forecasts remain explicitly stale; cache older than 48 hours is not displayed. City searches require explicit submission and are limited to one per two seconds. The cache stores one selected location with mode 0600.

Rain notices require forecast precipitation probability of at least 60% in the next three hours. Temperature-change notices require an 8°C change within six hours (also 8°C equivalent when displaying Fahrenheit). These are **derived forecast notices, not official severe-weather warnings**. Open-Meteo does not provide official warning coverage through this integration. Duplicate identical notices are suppressed within a six-hour window, including across daemon restarts.

Weather data is attributed to [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); displayed units/labels may be transformed. The [free endpoint's terms](https://open-meteo.com/en/terms) limit it to non-commercial use and impose request quotas. Commercial deployments need a permitted plan/provider before enabling weather; this implementation includes no paid credentials or customer endpoint. Geocoding also credits the provider's documented GeoNames source. See [forecast](https://open-meteo.com/en/docs) and [geocoding](https://open-meteo.com/en/docs/geocoding-api) documentation. Optional permission-aware automatic location is not implemented.

## Owned local commands

```
velapulse run "Cargo tests" -- cargo test
velapulse run "Python tests" -- python3 -m pytest
velapulse run "Frontend build" -- npm run build
```

Only the explicitly supplied argument vector is executed, without a shell. Commands keep their own terminal output. Activity metadata cannot execute commands. Each wrapper owns a separate process group, sends a heartbeat every ten seconds, reports the actual exit status and preserves that exit status for callers. Multiple commands can run concurrently. **Cancel owned task** signals only a live group created by its wrapper; agent-hook activities never offer cancellation or permission decisions. On service loss the wrapper stops its owned group; after an abrupt wrapper crash the activity becomes disconnected within 45 seconds. An externally killed wrapper cannot guarantee cleanup of every descendant; the UI does not claim otherwise.

## Codex CLI

Enable **Developer integrations → Codex CLI**, then explicitly launch a task:

```
velapulse codex "Review component" --sandbox read-only "Review this component"
```

This invokes the installed `codex exec --json`, consumes documented `thread.started`, `turn.started`, `turn.completed`, `turn.failed` and `error` events, and streams the original JSONL to your terminal. It stores only lifecycle labels, not messages, reasoning, prompts or command bodies. CLI authentication, sandbox and permissions remain under Codex's control; the wrapper does not add approval-bypass flags. Process exit status is also checked.

Existing interactive Codex CLI or Codex desktop sessions are not monitored. The exec interface used here does not expose a supported permission-return channel, so no waiting/Approve/Reject capability is claimed. Return to the original terminal for details. See [official JSONL documentation](https://developers.openai.com/codex/noninteractive/).

## Claude Code observer hooks

Enable **Developer integrations → Claude Code**. Preferences can install/remove observer hooks into an existing JSON settings file you choose, after an explicit confirmation. It backs up changed settings, preserves unrelated options/hooks and records the managed file locally for clean removal. Dependencies and setup instructions appear in the page. It never silently edits the user's or a project's Claude settings.

Equivalent command-line setup from this source checkout (review the printed merge first):

```
python3 integrations/claude-setup.py --settings /path/to/claude/settings.json
python3 integrations/claude-setup.py --settings /path/to/claude/settings.json --apply
```

For a user-installed app, use `~/.local/share/velapulse/integrations/claude-setup.py`. The settings path is explicit; a missing file is created only with `--apply`. Do not replace an entire Claude settings file with an example.

The observer reads bounded stdin JSON for documented SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop, StopFailure, Notification (permission/idle), PermissionRequest and SessionEnd events. It records a hashed session identity, project basename, state and sanitized tool name. It never opens `transcript_path` or retains `prompt`, `tool_input`, notification message or assistant text. Permission notices identify the agent/project/tool and direct you to Claude for the actual command, scope and decision. The observer prints no decision JSON, returns no approval/rejection and cannot authorize an action. Monitoring failures are non-blocking and do not change the agent's permission model. See [official hooks documentation](https://code.claude.com/docs/en/hooks).

Removal preserves unrelated hooks and settings:

```
python3 integrations/claude-setup.py --settings /path/to/claude/settings.json --remove --apply
python3 integrations/claude-setup.py --remove-all-registered --apply
```

Use the same script/hook path used for installation when removing one registration. Before uninstalling VelaPulse, remove registered hooks explicitly; the uninstaller refuses to delete observer scripts while managed references remain. Original backup files are kept. Removing the app does not silently edit agent configuration.

## Privacy, retention and notifications

Weather, Codex and Claude are off by default. Local task monitoring requires an explicit `velapulse run` invocation and can also be disabled. Notifications have separate toggles for Codex, Claude and tasks. Standard desktop notifications use normal urgency, respect desktop quiet-mode policy, and fire on state transitions to waiting/completed/failed, not every heartbeat or text update. Notification bodies are escaped as literal text.

Developer state stays in `$XDG_DATA_HOME/velapulse/developer-state.json`, mode 0600. At most 32 sessions, 8 recent status lines and 16 deduplication IDs per session are retained. Records older than a day are pruned during refresh; terminal states leave the visible rotation after 60 seconds, while recent records remain recoverable. Nonterminal records load as disconnected after daemon restart; commands never resume automatically. Hook sessions without updates for 30 minutes are labeled disconnected/stale, rather than asserted to still be running. Long quiet agent operations may therefore require a fresh hook event to reappear as active. Session-bus same-user trust applies; this is not a sandbox between hostile processes of the same Linux user.

Default activity order puts attention above completion, owned development work above music, then idle clock/weather/background device information. Existing priority overrides apply where appropriate. An explicitly selected expanded card stays selected while other providers update. No numerical progress is invented; registered sources may supply validated progress when they genuinely have it.
