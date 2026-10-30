#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec dbus-run-session --config-file=tests/fixtures/dbus-isolated.conf -- /usr/bin/python3 tests/phase34.py
