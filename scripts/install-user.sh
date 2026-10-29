#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ -x target/release/velapulse ] || { echo 'Run cargo build --release first.' >&2; exit 1; }
data="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
bin="$HOME/.local/bin"
mkdir -p "$bin" "$data/gnome-shell/extensions/velapulse@velapulse.local" "$data/velapulse/backends" "$data/velapulse/extension/assets" "$config/systemd/user" "$data/dbus-1/services" "$data/applications"
# Replace atomically so updating a running user service is safe.
install -m 755 target/release/velapulse "$bin/velapulse.new"
mv "$bin/velapulse.new" "$bin/velapulse"
cp extension/metadata.json extension/extension.js extension/stylesheet.css extension/prefs.js extension/preferences-host.js extension/preferences.js extension/preferences.css extension/presentation.js extension/music-shell.js extension/lyrics-picker.js extension/music-state.js extension/music-controls.js extension/music-preferences.js extension/context-preferences.js extension/context-state.js extension/context-cards.js extension/context-gtk.js extension/context-shell.js "$data/gnome-shell/extensions/velapulse@velapulse.local/"
mkdir -p "$data/gnome-shell/extensions/velapulse@velapulse.local/assets"
cp extension/assets/orbit.svg "$data/gnome-shell/extensions/velapulse@velapulse.local/assets/"
rm -f "$data/velapulse/layer-shell.js"
cp backends/layer-shell.js backends/preferences.js backends/style.css "$data/velapulse/backends/"
cp extension/presentation.js extension/preferences.js extension/preferences.css extension/music-state.js extension/music-controls.js extension/music-preferences.js extension/context-preferences.js extension/context-state.js extension/context-cards.js extension/context-gtk.js extension/context-shell.js "$data/velapulse/extension/"
cp extension/assets/orbit.svg "$data/velapulse/extension/assets/"
cat > "$config/systemd/user/velapulse.service" <<'UNIT'
[Unit]
Description=VelaPulse live activity service
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=dbus
BusName=io.github.velapulse.Service
ExecStart=%h/.local/bin/velapulse daemon
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=graphical-session.target
UNIT
# D-Bus starts the same systemd-owned instance on demand after each login.
# Quote Exec independently of shell syntax; paths can contain spaces.
VELAPULSE_INSTALL_DATA="$data" VELAPULSE_INSTALL_BIN="$bin/velapulse" /usr/bin/python3 - <<'PYCODE'
import os
from pathlib import Path
binary=os.environ['VELAPULSE_INSTALL_BIN']
assert not any(c in binary for c in '\n\r')
escaped=binary.replace('\\','\\\\').replace('"','\\"').replace('%','%%')
data=Path(os.environ['VELAPULSE_INSTALL_DATA'])
(data/'dbus-1/services/io.github.velapulse.Service.service').write_text(
    '[D-BUS Service]\nName=io.github.velapulse.Service\nExec="'+escaped+'" daemon\nSystemdService=velapulse.service\n')
(data/'applications/io.github.velapulse.Preferences.desktop').write_text(
    '[Desktop Entry]\nType=Application\nName=VelaPulse Settings\nComment=Live activities for your desktop\nExec="'+escaped+'" preferences\nIcon=preferences-system\nCategories=Settings;Utility;\nTerminal=false\n')
PYCODE
mkdir -p "$data/velapulse/integrations" "$data/gnome-shell/extensions/velapulse@velapulse.local/integrations"
cp integrations/claude-hook.py integrations/claude-setup.py "$data/velapulse/integrations/"
cp integrations/claude-hook.py integrations/claude-setup.py "$data/gnome-shell/extensions/velapulse@velapulse.local/integrations/"
systemctl --user daemon-reload
if systemctl --user is-active --quiet velapulse.service; then
    if "$bin/velapulse" snapshot | /usr/bin/python3 -c 'import json,sys; s=json.load(sys.stdin); sys.exit(0 if any(a["id"] in ("timer","stopwatch") or a["id"].startswith("external:") for a in s["activities"]) else 1)'; then
        printf '%s\n' 'An activity is running. Core update is deferred until the service next starts.'
    else
        systemctl --user restart velapulse.service
    fi
elif busctl --user call io.github.velapulse.Service /io/github/velapulse/Service org.freedesktop.DBus.Peer Ping >/dev/null 2>&1; then
    printf '%s\n' 'A login-started VelaPulse is already running. Updated core files take effect after it exits or at the next login.'
else
    systemctl --user start velapulse.service
fi
if [ "${1:-}" != "--native-only" ]; then
if ! gnome-extensions enable velapulse@velapulse.local; then
    /usr/bin/python3 - <<'PYCODE'
from gi.repository import Gio
settings = Gio.Settings.new('org.gnome.shell')
items = settings.get_strv('enabled-extensions')
if 'velapulse@velapulse.local' not in items:
    settings.set_strv('enabled-extensions', items + ['velapulse@velapulse.local'])
Gio.Settings.sync()
PYCODE
    echo 'The extension is scheduled for enablement. Log out and back in for GNOME to discover it.'
fi
fi
printf '%s\n' 'VelaPulse installed. Autostart remains controlled by the application setting.'
