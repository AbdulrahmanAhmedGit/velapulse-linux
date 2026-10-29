#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export VELAPULSE_TEST_SUITE=context
export VELAPULSE_TEST_ARTIFACTS="${VELAPULSE_TEST_ARTIFACTS:-$PWD/target/context-ui}"
exec dbus-run-session --config-file=tests/fixtures/dbus-isolated.conf -- /usr/bin/python3 tests/preferences_input.py
