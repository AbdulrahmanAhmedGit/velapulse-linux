#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ -x target/release/velapulse ] || { echo 'Run cargo build --release first.' >&2; exit 1; }
data="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
bin="$HOME/.local/bin"
mkdir -p "$bin" "$data/gnome-shell/extensions/velapulse@velapulse.local" "$data/velapulse" "$config/systemd/user"
install -m 755 target/release/velapulse "$bin/velapulse"
cp extension/metadata.json extension/extension.js extension/stylesheet.css "$data/gnome-shell/extensions/velapulse@velapulse.local/"
cp backends/layer-shell.js "$data/velapulse/"
cat > "$config/systemd/user/velapulse.service" <<'UNIT'
[Unit]
Description=VelaPulse live activity service
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=%h/.local/bin/velapulse daemon
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=graphical-session.target
UNIT
systemctl --user daemon-reload
systemctl --user start velapulse.service
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
printf '%s\n' 'VelaPulse installed. Autostart remains controlled by the application setting.'
