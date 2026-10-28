#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export WAYLAND_DISPLAY=velapulse-isolated-test-no-display
export VELAPULSE_BIN="$(pwd)/target/debug/velapulse"
exec dbus-run-session -- /usr/bin/python3 tests/providers.py
