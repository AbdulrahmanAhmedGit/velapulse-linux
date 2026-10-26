#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec gjs -m backends/preferences.js
