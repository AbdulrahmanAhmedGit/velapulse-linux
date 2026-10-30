#!/bin/sh
set -eu
data="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
if [ -f "$data/velapulse/hook-settings.json" ] && ! /usr/bin/python3 -c 'import json,sys;assert isinstance(json.load(open(sys.argv[1])),list)' "$data/velapulse/hook-settings.json"; then
    printf '%s\n' 'Invalid VelaPulse hook registry. Review it before uninstalling.' >&2
    exit 1
fi
# Refuse to delete an observer script that external tools still reference.
if [ -f "$data/velapulse/hook-settings.json" ] && /usr/bin/python3 -c 'import json,sys;sys.exit(0 if json.load(open(sys.argv[1])) else 1)' "$data/velapulse/hook-settings.json"; then
    printf '%s\n' 'Remove registered Claude hooks first (this preserves other agent settings):' >&2
    printf '%s\n' "python3 $data/velapulse/integrations/claude-setup.py --remove-all-registered --apply" >&2
    exit 1
fi
gnome-extensions disable velapulse@velapulse.local 2>/dev/null || true
systemctl --user stop velapulse.service 2>/dev/null || true
systemctl --user disable velapulse.service 2>/dev/null || true
rm -f "$data/dbus-1/services/io.github.velapulse.Service.service" "$data/applications/io.github.velapulse.Preferences.desktop" "$config/systemd/user/velapulse.service" "$config/autostart/io.github.velapulse.desktop" "$HOME/.local/bin/velapulse"
rm -f "$data/gnome-shell/extensions/velapulse@velapulse.local/music-shell.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/lyrics-picker.js" "$data/velapulse/extension/music-state.js" "$data/velapulse/extension/music-controls.js" "$data/velapulse/extension/music-preferences.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/music-state.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/music-controls.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/music-preferences.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/metadata.json" "$data/gnome-shell/extensions/velapulse@velapulse.local/extension.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/stylesheet.css" "$data/velapulse/layer-shell.js" "$data/velapulse/backends/layer-shell.js" "$data/velapulse/backends/preferences.js" "$data/velapulse/backends/style.css" "$data/velapulse/extension/presentation.js" "$data/velapulse/extension/preferences.js" "$data/velapulse/extension/preferences.css" "$data/velapulse/extension/assets/orbit.svg" "$data/gnome-shell/extensions/velapulse@velapulse.local/prefs.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/preferences-host.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/preferences.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/preferences.css" "$data/gnome-shell/extensions/velapulse@velapulse.local/presentation.js" "$data/gnome-shell/extensions/velapulse@velapulse.local/assets/orbit.svg"
for base in "$data/velapulse" "$data/gnome-shell/extensions/velapulse@velapulse.local"; do
    rm -f "$base/card-tree.js" "$base/settings-search.js" "$base/extension/card-tree.js" "$base/extension/settings-search.js" "$base/integrations/claude-hook.py" "$base/integrations/claude-setup.py" "$base/context-state.js" "$base/context-preferences.js" "$base/extension/context-state.js" "$base/extension/context-preferences.js"
    rmdir "$base/integrations" 2>/dev/null || true
done
rmdir "$data/gnome-shell/extensions/velapulse@velapulse.local/assets" "$data/gnome-shell/extensions/velapulse@velapulse.local" "$data/velapulse/backends" "$data/velapulse/extension/assets" "$data/velapulse/extension" "$data/velapulse" 2>/dev/null || true
rm -f "$data/velapulse/hook-settings.json"
systemctl --user daemon-reload
printf '%s\n' 'Removed VelaPulse. User settings retained in the XDG configuration directory.'
