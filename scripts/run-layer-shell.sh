#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export GDK_BACKEND=wayland
# The library must interpose Wayland before GTK loads libwayland-client.
export LD_PRELOAD="libgtk4-layer-shell.so.0${LD_PRELOAD:+:$LD_PRELOAD}"
exec gjs -m backends/layer-shell.js
