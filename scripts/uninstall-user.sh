#!/bin/sh
set -eu
data="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
gnome-extensions disable velapulse@velapulse.local 2>/dev/null || true
systemctl --user stop velapulse.service 2>/dev/null || true
systemctl --user disable velapulse.service 2>/dev/null || true
rm -f "$config/systemd/user/velapulse.service" "$config/autostart/io.github.velapulse.desktop" "$HOME/.local/bin/velapulse"
rm -f "$data/gnome-shell/extensions/velapulse@velapulse.local/metadata.json" "$data/gnome-shell/extensions/velapulse@velapulse.local/extension.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/stylesheet.css" "$data/velapulse/layer-shell.js"
rmdir "$data/gnome-shell/extensions/velapulse@velapulse.local" "$data/velapulse" 2>/dev/null || true
systemctl --user daemon-reload
printf '%s\n' 'Removed VelaPulse. User settings retained in the XDG configuration directory.'
