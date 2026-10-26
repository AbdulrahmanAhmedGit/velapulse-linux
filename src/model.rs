use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "active")]
    pub status: String,
    #[serde(default)]
    pub progress: Option<f64>,
    #[serde(default)]
    pub icon: String,
    #[serde(default = "ttl")]
    pub expires_in: u64,
    #[serde(default)]
    pub controls: Vec<String>,
}
fn active() -> String {
    "active".into()
}
fn ttl() -> u64 {
    300
}
impl Activity {
    pub fn new(id: &str, title: &str) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            description: String::new(),
            status: active(),
            progress: None,
            icon: String::new(),
            expires_in: 300,
            controls: vec![],
        }
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.id.is_empty()
            || self.id.len() > 80
            || !self
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        {
            return Err("invalid id".into());
        }
        if self.title.is_empty()
            || self.title.len() > 256
            || self.description.len() > 1024
            || self.icon.len() > 128
        {
            return Err("text exceeds limits".into());
        }
        if !["loading", "active", "paused", "completed", "warning"].contains(&self.status.as_str())
        {
            return Err("invalid status".into());
        }
        if self
            .progress
            .is_some_and(|p| !p.is_finite() || !(0.0..=1.0).contains(&p))
            || !(1..=86400).contains(&self.expires_in)
        {
            return Err("invalid progress or expiry".into());
        }
        if !self.controls.is_empty() {
            return Err("external controls are forbidden".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug)]
pub struct Clock {
    pub elapsed: Duration,
    pub since: Option<Instant>,
    pub target: Option<Duration>,
    pub notified: bool,
}
impl Clock {
    pub fn new(seconds: Option<u64>, now: Instant) -> Self {
        Self {
            elapsed: Duration::ZERO,
            since: Some(now),
            target: seconds.map(Duration::from_secs),
            notified: false,
        }
    }
    pub fn elapsed_at(&self, now: Instant) -> Duration {
        self.elapsed
            + self
                .since
                .map(|s| now.saturating_duration_since(s))
                .unwrap_or_default()
    }
    pub fn pause(&mut self, now: Instant) {
        self.elapsed = self.elapsed_at(now);
        self.since = None;
    }
    pub fn resume(&mut self, now: Instant) {
        if self.since.is_none() && !self.done(now) {
            self.since = Some(now);
        }
    }
    pub fn done(&self, now: Instant) -> bool {
        self.target.is_some_and(|d| self.elapsed_at(now) >= d)
    }
    pub fn activity(&self, id: &str, now: Instant) -> Activity {
        let elapsed = self.elapsed_at(now);
        let remaining = self.target.map(|t| t.saturating_sub(elapsed));
        let seconds = remaining
            .map(|d| d.as_secs_f64().ceil() as u64)
            .unwrap_or(elapsed.as_secs());
        let mut a = Activity::new(
            id,
            if self.target.is_some() {
                "Timer"
            } else {
                "Stopwatch"
            },
        );
        a.description = format!(
            "{:02}:{:02}:{:02}",
            seconds / 3600,
            (seconds / 60) % 60,
            seconds % 60
        );
        a.status = if self.done(now) {
            "completed"
        } else if self.since.is_none() {
            "paused"
        } else {
            "active"
        }
        .into();
        a.progress = self
            .target
            .map(|t| (elapsed.as_secs_f64() / t.as_secs_f64()).min(1.0));
        a.controls = if self.done(now) {
            vec!["reset".into()]
        } else {
            vec![
                if self.since.is_some() {
                    "pause"
                } else {
                    "resume"
                }
                .into(),
                "reset".into(),
            ]
        };
        a
    }
}
#[derive(Default)]
pub struct Engine {
    pub clocks: BTreeMap<String, Clock>,
    pub external: BTreeMap<String, (Activity, Instant)>,
    pub providers: BTreeMap<String, Activity>,
}
impl Engine {
    pub fn snapshot(&mut self, now: Instant, config: &crate::config::Config) -> Vec<Activity> {
        self.external.retain(|_, (_, end)| *end > now);
        let mut items: Vec<_> = self
            .clocks
            .iter()
            .filter(|(id, _)| config.enabled.contains(id))
            .map(|(id, c)| c.activity(id, now))
            .chain(self.external.values().map(|(a, _)| a.clone()))
            .chain(
                self.providers
                    .values()
                    .filter(|a| {
                        config
                            .enabled
                            .contains(&a.id.split(':').next().unwrap_or("").to_string())
                    })
                    .cloned(),
            )
            .collect();
        items.sort_by_key(|a| {
            (
                std::cmp::Reverse(if a.status == "completed" {
                    1000
                } else {
                    *config
                        .priorities
                        .get(a.id.split(':').next().unwrap_or(""))
                        .unwrap_or(&50)
                }),
                a.id.clone(),
            )
        });
        items
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pause_resume_is_monotonic() {
        let n = Instant::now();
        let mut c = Clock::new(Some(10), n);
        c.pause(n + Duration::from_secs(3));
        assert_eq!(c.elapsed_at(n + Duration::from_secs(30)).as_secs(), 3);
        c.resume(n + Duration::from_secs(30));
        assert!(c.done(n + Duration::from_secs(37)));
    }
    #[test]
    fn no_resume_completed() {
        let n = Instant::now();
        let mut c = Clock::new(Some(1), n);
        c.pause(n + Duration::from_secs(2));
        c.resume(n + Duration::from_secs(3));
        assert!(c.since.is_none());
    }
    #[test]
    fn reject_untrusted_payloads() {
        let mut a = Activity::new("build", "Compile");
        assert!(a.validate().is_ok());
        a.progress = Some(f64::NAN);
        assert!(a.validate().is_err());
        a.progress = None;
        a.controls.push("sh".into());
        assert!(a.validate().is_err());
    }
    #[test]
    fn expiration_and_priority() {
        let n = Instant::now();
        let mut e = Engine::default();
        e.external.insert("x".into(), (Activity::new("x", "x"), n));
        e.clocks.insert("timer".into(), Clock::new(Some(1), n));
        assert_eq!(e.snapshot(n, &Default::default()).len(), 1);
        assert_eq!(
            e.snapshot(n + Duration::from_secs(2), &Default::default())[0].status,
            "completed"
        );
    }
}
