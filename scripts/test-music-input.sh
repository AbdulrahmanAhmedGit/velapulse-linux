#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export VELAPULSE_TEST_SUITE=music
export VELAPULSE_TEST_ARTIFACTS="$(pwd)/target/music-input"
exec dbus-run-session --config-file=tests/fixtures/dbus-isolated.conf -- /usr/bin/python3 tests/preferences_input.py
