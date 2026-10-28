# Local development activities

The command wrapper uses the public VelaPulse D-Bus API. It keeps one connection
and one activity ID, refreshes a 30-second lease every ten seconds, and shows a
completion/failure activity for eight seconds. It returns the command's exit code.
It executes only the explicit arguments after `--`, without a shell. External
activity JSON never has command execution privileges.

```sh
velapulse run "Release build" -- cargo build --release
velapulse run "Test suite" -- npm test
velapulse run "Codex session" -- codex
velapulse run "Claude Code session" -- claude
velapulse run "Video export" -- ffmpeg -i input.mp4 output.webm
```

These are optional wrappers around user-installed commands, not integrations
with undocumented Codex or Claude internals. Interactive tool sessions indicate
session lifetime, not whether the agent is thinking or editing. Use your tool's
explicitly configured public hooks for finer-grained updates, or a persistent
D-Bus connection following [API.md](API.md). Separate invocations of `push` have
separate sender identities; the wrapper avoids accumulating duplicate activities.
A lost/killed wrapper expires automatically. Ctrl-C requests child termination;
commands that deliberately detach their own children should manage those children.

Titles must be nonempty and at most 256 bytes. Payload limits, ownership checks,
and expiry apply equally to these activities. Command output stays in your
terminal; it is not copied into an activity or log. Do not put secrets in titles.
