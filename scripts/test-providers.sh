#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export VELAPULSE_BIN="$(pwd)/target/debug/velapulse"
exec dbus-run-session -- /usr/bin/python3 tests/providers.py
