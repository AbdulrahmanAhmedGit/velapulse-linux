//! Local, opt-in developer state. No commands, prompts or permission decisions in events.
use crate::{
    config::Config,
    model::{Activity, Engine},
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, sync::Arc, time::Duration};
use tokio::sync::{Mutex, Notify};
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Settings {
    pub codex: bool,
    pub claude: bool,
    pub tasks: bool,
    pub codex_notifications: bool,
    pub claude_notifications: bool,
    pub task_notifications: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            codex: false,
            claude: false,
            tasks: true,
            codex_notifications: true,
            claude_notifications: true,
            task_notifications: true,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub provider: String,
    pub session: String,
    pub state: String,
    pub title: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub event_id: String,
    #[serde(default)]
    pub progress: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct View {
    pub provider: String,
    pub session: String,
    pub state: String,
    pub project: String,
    pub started: u64,
    pub updated: u64,
    pub elapsed: u64,
    pub message: String,
    pub events: Vec<String>,
    pub owned: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Record {
    pub title: String,
    pub view: View,
    pub progress: Option<f64>,
    #[serde(default)]
    pub seen: Vec<String>,
    #[serde(skip)]
    pub owner: String,
}
#[derive(Default)]
pub struct Store {
    pub records: BTreeMap<String, Record>,
}
fn terminal(s: &str) -> bool {
    ["completed", "failed", "cancelled", "disconnected"].contains(&s)
}
pub fn private_write(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    std::fs::create_dir_all(path.parent().unwrap())?;
    let tmp = path.with_extension("tmp");
    let mut out = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&tmp)?;
    out.write_all(bytes)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}
fn path() -> std::path::PathBuf {
    crate::history::data_dir().join("developer-state.json")
}
impl Store {
    pub fn load() -> Self {
        let p = path();
        let mut s = Self::default();
        if std::fs::metadata(&p).is_ok_and(|m| m.len() <= 256 * 1024)
            && let Ok(bytes) = std::fs::read(p)
            && let Ok(records) = serde_json::from_slice::<BTreeMap<String, Record>>(&bytes)
        {
            s.records = records.into_iter().take(32).collect();
            for r in s.records.values_mut() {
                r.view.owned = false;
                if !terminal(&r.view.state) {
                    r.view.state = "disconnected".into();
                    r.view.message = "Service restarted; waiting for a fresh event".into();
                }
            }
        }
        s
    }
    pub fn save(&self) -> Result<()> {
        private_write(&path(), &serde_json::to_vec(&self.records)?)
    }
    pub fn apply(
        &mut self,
        e: Event,
        owner: &str,
        settings: &Settings,
        now: u64,
    ) -> Result<(String, bool)> {
        ensure!(
            match e.provider.as_str() {
                "codex" => settings.codex,
                "claude" => settings.claude,
                "task" => settings.tasks,
                _ => false,
            },
            "integration is disabled or unknown"
        );
        ensure!(
            !e.session.is_empty()
                && e.session.len() <= 128
                && e.session
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c)),
            "invalid session identifier"
        );
        ensure!(
            [
                "starting",
                "running",
                "waiting",
                "completed",
                "failed",
                "cancelled",
                "disconnected"
            ]
            .contains(&e.state.as_str()),
            "invalid developer state"
        );
        ensure!(
            !e.title.is_empty()
                && e.title.len() <= 160
                && e.project.len() <= 120
                && e.message.len() <= 240
                && e.event_id.len() <= 128
                && !format!("{}{}{}", e.title, e.project, e.message)
                    .chars()
                    .any(char::is_control),
            "invalid developer text"
        );
        ensure!(
            e.progress
                .is_none_or(|p| p.is_finite() && (0.0..=1.0).contains(&p)),
            "invalid progress"
        );
        let id = format!("developer:{}:{}", e.provider, e.session);

        if !self.records.contains_key(&id)
            && self.records.len() >= 32
            && let Some(old) = self
                .records
                .iter()
                .filter(|(_, r)| terminal(&r.view.state))
                .min_by_key(|(_, r)| r.view.updated)
                .map(|(k, _)| k.clone())
        {
            self.records.remove(&old);
        }
        ensure!(
            self.records.contains_key(&id) || self.records.len() < 32,
            "developer activity quota reached"
        );
        let r = self.records.entry(id.clone()).or_insert_with(|| Record {
            title: e.title.clone(),
            view: View {
                provider: e.provider.clone(),
                session: e.session.clone(),
                state: "starting".into(),
                project: e.project.clone(),
                started: now,
                updated: now,
                elapsed: 0,
                message: String::new(),
                events: vec![],
                owned: e.provider == "task",
            },
            progress: None,
            seen: vec![],
            owner: owner.into(),
        });
        if e.provider == "task" {
            ensure!(r.owner == owner, "task belongs to another connection");
        }
        let duplicate = !e.event_id.is_empty() && r.seen.contains(&e.event_id);
        if duplicate {
            return Ok((id, false));
        }
        let notify = r.view.state != e.state;
        let changed = notify || r.view.message != e.message;
        r.view.owned = e.provider == "task";
        if terminal(&r.view.state) && !terminal(&e.state) {
            r.view.started = now;
        }
        r.title = e.title;
        r.view.project = e.project;
        r.view.elapsed = now.saturating_sub(r.view.started);
        r.view.updated = now;
        r.view.state = e.state;
        r.view.message = e.message;
        r.progress = e.progress;
        if !e.event_id.is_empty() {
            r.seen.push(e.event_id);
            if r.seen.len() > 16 {
                r.seen.remove(0);
            }
        }
        if changed {
            r.view
                .events
                .push(format!("{} · {}", r.view.state, r.view.message));
            if r.view.events.len() > 8 {
                r.view.events.remove(0);
            }
        }
        Ok((id, notify))
    }
    pub fn refresh(&mut self, settings: &Settings, now: u64) -> Vec<Activity> {
        self.records
            .retain(|_, r| now.saturating_sub(r.view.updated) < 86400);
        self.records
            .iter_mut()
            .filter_map(|(id, r)| {
                if !match r.view.provider.as_str() {
                    "codex" => settings.codex,
                    "claude" => settings.claude,
                    _ => settings.tasks,
                } {
                    return None;
                }
                if !terminal(&r.view.state)
                    && now.saturating_sub(r.view.updated)
                        > if r.view.provider == "task" { 45 } else { 1800 }
                {
                    r.view.state = "disconnected".into();
                    r.view.owned = false;
                    r.view.message = "No recent update; return to the original tool".into();
                }
                if !terminal(&r.view.state) {
                    r.view.elapsed = now.saturating_sub(r.view.started);
                }
                if terminal(&r.view.state) && now.saturating_sub(r.view.updated) > 60 {
                    return None;
                }
                let mut a = Activity::new(id, &r.title);
                a.status = match r.view.state.as_str() {
                    "completed" => "completed",
                    "failed" | "waiting" | "disconnected" => "warning",
                    _ => "active",
                }
                .into();
                a.description = format!(
                    "{} · {} · {}s",
                    r.view.provider, r.view.state, r.view.elapsed
                );
                a.source = r.view.provider.clone();
                a.developer = Some(r.view.clone());
                a.progress = r.progress;
                if r.view.owned && !terminal(&r.view.state) {
                    a.controls.push("cancel".into());
                }
                Some(a)
            })
            .collect::<Vec<_>>()
    }
}
pub async fn notify(bus: &zbus::Connection, title: &str, message: &str, urgency: u8) {
    use std::collections::HashMap;
    let escaped = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let _ = bus
        .call_method(
            Some("org.freedesktop.Notifications"),
            "/org/freedesktop/Notifications",
            Some("org.freedesktop.Notifications"),
            "Notify",
            &(
                "VelaPulse",
                0u32,
                "dialog-information-symbolic",
                title,
                escaped.as_str(),
                Vec::<String>::new(),
                HashMap::from([("urgency", zbus::zvariant::Value::U8(urgency))]),
                -1i32,
            ),
        )
        .await;
}
pub fn spawn(
    store: Arc<Mutex<Store>>,
    engine: Arc<Mutex<Engine>>,
    config: Arc<Mutex<Config>>,
    wake: Arc<Notify>,
) {
    tokio::spawn(async move {
        loop {
            let settings = config.lock().await.developer.clone();
            let mut locked = store.lock().await;
            let items = locked.refresh(&settings, crate::history::now());
            let mut e = engine.lock().await;
            e.providers.retain(|id, _| !id.starts_with("developer:"));
            for a in items {
                e.providers.insert(a.id.clone(), a);
            }
            drop(e);
            drop(locked);
            wake.notify_one();
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    fn event(state: &str) -> Event {
        Event {
            provider: "task".into(),
            session: "one".into(),
            state: state.into(),
            title: "Build".into(),
            project: "Test".into(),
            message: "status".into(),
            event_id: state.into(),
            progress: None,
        }
    }
    #[test]
    fn ownership_dedup_staleness_and_restart_model() {
        let mut s = Store::default();
        let settings = Settings::default();
        let (id, changed) = s.apply(event("running"), ":1.1", &settings, 100).unwrap();
        assert!(changed);
        assert!(!s.apply(event("running"), ":1.1", &settings, 101).unwrap().1);
        assert!(s.apply(event("failed"), ":1.2", &settings, 102).is_err());
        assert_eq!(
            s.refresh(&settings, 146)[0]
                .developer
                .as_ref()
                .unwrap()
                .state,
            "disconnected"
        );
        assert!(!s.records[&id].view.owned);
    }
    #[test]
    fn disabled_invalid_and_concurrent_events() {
        let mut s = Store::default();
        let settings = Settings::default();
        let mut e = event("waiting");
        e.provider = "claude".into();
        assert!(s.apply(e, ":1.1", &settings, 1).is_err());
        let mut e = event("unknown");
        assert!(s.apply(e.clone(), ":1.1", &settings, 1).is_err());
        e.state = "running".into();
        e.progress = Some(2.);
        assert!(s.apply(e, ":1.1", &settings, 1).is_err());
        for i in 0..32 {
            let mut e = event("running");
            e.session = i.to_string();
            s.apply(e, ":1.1", &settings, 1).unwrap();
        }
        let mut e = event("running");
        e.session = "extra".into();
        assert!(s.apply(e, ":1.1", &settings, 1).is_err());
    }
}
