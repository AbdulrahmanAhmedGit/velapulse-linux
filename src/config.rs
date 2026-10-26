use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub position: String,
    pub appearance: String,
    pub animations: bool,
    pub monitor: i32,
    pub enabled: Vec<String>,
    pub priorities: BTreeMap<String, i32>,
    pub autostart: bool,
    pub size: String,
    pub opacity: u8,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            position: "bottom".into(),
            appearance: "dark".into(),
            animations: true,
            monitor: -1,
            enabled: vec!["timer", "stopwatch", "media", "battery", "volume"]
                .into_iter()
                .map(str::to_string)
                .collect(),
            priorities: BTreeMap::from([
                ("timer".into(), 90),
                ("media".into(), 70),
                ("stopwatch".into(), 60),
            ]),
            autostart: false,
            size: "medium".into(),
            opacity: 98,
        }
    }
}
impl Config {
    pub fn path() -> PathBuf {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config")
            })
            .join("velapulse/config.json")
    }
    pub fn load() -> anyhow::Result<Self> {
        match std::fs::read(Self::path()) {
            Ok(b) => {
                let c: Self = serde_json::from_slice(&b)?;
                c.validate()?;
                Ok(c)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(e.into()),
        }
    }
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            ["top", "bottom"].contains(&self.position.as_str()),
            "position must be top or bottom"
        );
        anyhow::ensure!(
            ["dark", "light"].contains(&self.appearance.as_str()),
            "appearance must be dark or light"
        );
        anyhow::ensure!(
            ["small", "medium", "large"].contains(&self.size.as_str()),
            "invalid surface size"
        );
        anyhow::ensure!(
            (65..=100).contains(&self.opacity),
            "opacity must be 65..100"
        );
        anyhow::ensure!((-1..32).contains(&self.monitor), "invalid monitor");
        anyhow::ensure!(
            self.enabled.len() <= 5
                && self.enabled.iter().all(|s| [
                    "timer",
                    "stopwatch",
                    "media",
                    "battery",
                    "volume"
                ]
                .contains(&s.as_str())),
            "invalid provider"
        );
        anyhow::ensure!(
            self.priorities.len() <= 32
                && self.priorities.values().all(|v| (-100..=100).contains(v)),
            "invalid priorities"
        );
        Ok(())
    }
    pub fn save(&self) -> anyhow::Result<()> {
        self.validate()?;
        let p = Self::path();
        std::fs::create_dir_all(p.parent().unwrap())?;
        let tmp = p.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(tmp, p)?;
        self.sync_autostart()?;
        Ok(())
    }
    fn sync_autostart(&self) -> anyhow::Result<()> {
        let path = Self::path()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("autostart/io.github.velapulse.desktop");
        if self.autostart {
            let executable = std::env::current_exe()?.to_string_lossy().to_string();
            let escaped = executable
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('`', "\\`")
                .replace('$', "\\$")
                .replace('%', "%%");
            anyhow::ensure!(!escaped.contains(['\n', '\r']), "invalid executable path");
            std::fs::create_dir_all(path.parent().unwrap())?;
            std::fs::write(
                path,
                format!(
                    "[Desktop Entry]\nType=Application\nName=VelaPulse\nExec=\"{escaped}\" daemon\nX-GNOME-Autostart-enabled=true\n"
                ),
            )?;
        } else if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    }
}
