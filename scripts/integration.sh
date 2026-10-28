#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export WAYLAND_DISPLAY=velapulse-isolated-test-no-display
export VELAPULSE_BIN="$(pwd)/target/debug/velapulse"
exec dbus-run-session --config-file=tests/fixtures/dbus-isolated.conf -- python3 tests/integration.py
