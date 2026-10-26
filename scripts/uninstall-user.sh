#!/bin/sh
set -eu
data="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
gnome-extensions disable velapulse@velapulse.local 2>/dev/null || true
systemctl --user stop velapulse.service 2>/dev/null || true
systemctl --user disable velapulse.service 2>/dev/null || true
rm -f "$config/systemd/user/velapulse.service" "$config/autostart/io.github.velapulse.desktop" "$HOME/.local/bin/velapulse"
rm -f "$data/gnome-shell/extensions/velapulse@velapulse.local/metadata.json" "$data/gnome-shell/extensions/velapulse@velapulse.local/extension.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/stylesheet.css" "$data/velapulse/layer-shell.js" "$data/velapulse/backends/layer-shell.js" "$data/velapulse/backends/preferences.js" "$data/velapulse/backends/style.css" "$data/velapulse/extension/presentation.js" "$data/velapulse/extension/preferences.js" "$data/velapulse/extension/preferences.css" "$data/velapulse/extension/assets/orbit.svg" "$data/gnome-shell/extensions/velapulse@velapulse.local/prefs.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/preferences.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/preferences.css" "$data/gnome-shell/extensions/velapulse@velapulse.local/presentation.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/assets/orbit.svg"
rmdir "$data/gnome-shell/extensions/velapulse@velapulse.local/assets" "$data/gnome-shell/extensions/velapulse@velapulse.local" "$data/velapulse/backends" "$data/velapulse/extension/assets" "$data/velapulse/extension" "$data/velapulse" 2>/dev/null || true
systemctl --user daemon-reload
printf '%s\n' 'Removed VelaPulse. User settings retained in the XDG configuration directory.'
