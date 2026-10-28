# Music experience

Expand a music pill to choose a player, use supported playback buttons, drag the seek slider or adjust it with the keyboard. Automatic selection favors playing sources; choosing a player saves that preference across service restarts and temporary disconnection. Unsupported transport is omitted; seeking is disabled for unknown durations or unsupported capabilities. Album artwork appears in the pill and hero, with a restrained extracted accent. Track art crossfades unless motion is disabled. Cards scroll when their content exceeds the available monitor height.

## Lyrics

Use **Attach LRC…** in the card, or **Preferences → Media → Attach local lyrics…**. GNOME opens a separate GTK file picker. Select a local UTF-8 timestamped `.lrc` file you are entitled to use. Multiple timestamps, fractions, sorted lines and millisecond `[offset:]` adjustments are supported. The selected text is normalized and attached by track title/artist/album, not by a browser history URL. Import rejects a stale track selection. Open Lyrics to follow playback; seeking updates the active line, manual scrolling pauses following, and Follow resumes it. Missing lyrics show a clean local-file prompt. No lyrics are bundled, fetched, scraped or uploaded.

## Audio

Open Audio output for the current default sink, output selection, volume and mute. The implementation uses bounded, fixed-argument `pw-dump`/`wpctl` calls, and returns refreshed state. Default-output selection affects new streams; existing applications may retain their own route. Missing tools, devices or permissions produce an unavailable/error state. No privileged audio configuration is changed.

## Listening history

Enable **Preferences → Media → Local listening history** explicitly. Data stays in `$XDG_DATA_HOME/velapulse/listening-history.json` (fallback `~/.local/share`), with mode 0600. It records track/artist, played seconds and track/day play counts; no browser history or media URL is collected. Pauses, duplicate metadata and suspend-length gaps do not accumulate listening time. Preferences shows recent tracks, the last seven days, ranked songs/artists and daily UTC totals. Disable to stop collection; existing records remain until Clear history is confirmed. Storage is bounded to 2,000 track/day records, pruning old records during collection. Summaries reflect this retained local history rather than a streaming account's statistics.

## Artwork limits

Files must be regular and at most 8 MiB. Remote URLs must be anonymous public HTTPS on port 443; credentials, other schemes, redirects, private/link-local/loopback/reserved addresses and unchecked DNS destinations are rejected. Checked DNS answers are pinned and environment proxies are disabled. Requests have bounded connection/overall timeouts. At most two loads/decode jobs run concurrently; old track jobs are cancelled and late results cannot replace a new track. PNG/JPEG/WebP decoding is bounded to 4096×4096 and 64 MiB allocation, then normalized to at most 768×768. Cache filenames are content hashes and at most 128 normalized images are retained. An in-memory URL cache avoids repeat network loads during a service session; failed loads retry with a 30-second backoff for at most three attempts per track/URL; failed or unsupported artwork falls back to VelaPulse's original Orbit asset. The UI never loads raw remote artwork or SVG supplied by a player.

See [the MPRIS specification](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html) and [WirePlumber's documented tools](https://pipewire.pages.freedesktop.org/wireplumber/man/wpctl.html) for the underlying public controls. Spotify and browser sessions must actually expose MPRIS; no private Spotify API or credentials are used.
