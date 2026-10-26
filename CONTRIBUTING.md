# Contributing
Read AGENTS.md and docs/ARCHITECTURE.md. Keep provider logic outside renderers. Include reproduction steps, actual test results and the compositor version with changes. Test desktop changes in an isolated session first. Do not enable unsafe Shell evaluation in the user's session. Avoid importing third-party implementation without explicit license review and attribution. All contributions must be legally compatible with MIT; upstream dependencies keep their licenses.

Run formatting, Clippy, unit tests and both isolated D-Bus suites. Manual UI checks must state whether input was physical, synthetic or invoked through actor signals. Screenshots are evidence of rendering, not proof of every interaction.
