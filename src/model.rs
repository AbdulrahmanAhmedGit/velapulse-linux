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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position_seconds: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music: Option<crate::music::Details>,
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
            position_seconds: None,
            duration_seconds: None,
            source: String::new(),
            music: None,
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
        if self.position_seconds.is_some()
            || self.duration_seconds.is_some()
            || self.music.is_some()
            || !self.source.is_empty()
        {
            return Err("provider metadata cannot be supplied externally".into());
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
    pub since: Option<Duration>,
    pub target: Option<Duration>,
    pub notified: bool,
}
impl Clock {
    pub fn new(seconds: Option<u64>, now: Duration) -> Self {
        Self {
            elapsed: Duration::ZERO,
            since: Some(now),
            target: seconds.map(Duration::from_secs),
            notified: false,
        }
    }
    pub fn elapsed_at(&self, now: Duration) -> Duration {
        self.elapsed
            + self
                .since
                .map(|s| now.saturating_sub(s))
                .unwrap_or_default()
    }
    pub fn pause(&mut self, now: Duration) {
        self.elapsed = self.elapsed_at(now);
        self.since = None;
    }
    pub fn resume(&mut self, now: Duration) {
        if self.since.is_none() && !self.done(now) {
            self.since = Some(now);
        }
    }
    pub fn done(&self, now: Duration) -> bool {
        self.target.is_some_and(|d| self.elapsed_at(now) >= d)
    }
    pub fn activity(&self, id: &str, now: Duration) -> Activity {
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
            .map(|(id, c)| c.activity(id, clock_now()))
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
                if a.id.starts_with("media:") {
                    if a.id == config.selected_player {
                        0
                    } else if a.status == "active" {
                        1
                    } else {
                        2
                    }
                } else {
                    0
                },
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
        let n = Duration::from_secs(100);
        let mut c = Clock::new(Some(10), n);
        c.pause(n + Duration::from_secs(3));
        assert_eq!(c.elapsed_at(n + Duration::from_secs(30)).as_secs(), 3);
        c.resume(n + Duration::from_secs(30));
        assert!(c.done(n + Duration::from_secs(37)));
    }
    #[test]
    fn no_resume_completed() {
        let n = Duration::from_secs(100);
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
        e.clocks
            .insert("timer".into(), Clock::new(Some(1), clock_now()));
        assert_eq!(e.snapshot(n, &Default::default()).len(), 1);
        e.clocks.get_mut("timer").unwrap().elapsed = Duration::from_secs(2);
        assert_eq!(e.snapshot(n, &Default::default())[0].status, "completed");
    }
}

/// Linux boot time advances through suspend and is unaffected by wall-clock changes.
pub fn clock_now() -> Duration {
    let mut ts = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // SAFETY: ts points to a writable timespec; CLOCK_BOOTTIME is supported on Linux.
    let result = unsafe { libc::clock_gettime(libc::CLOCK_BOOTTIME, &mut ts) };
    assert_eq!(result, 0, "CLOCK_BOOTTIME unavailable");
    Duration::new(ts.tv_sec as u64, ts.tv_nsec as u32)
}
#[derive(Serialize, Deserialize)]
struct SavedClock {
    elapsed: Duration,
    running: bool,
    target: Option<Duration>,
    notified: bool,
}
#[derive(Serialize, Deserialize)]
struct SavedClocks {
    boot: String,
    at: Duration,
    wall: Duration,
    clocks: BTreeMap<String, SavedClock>,
}
impl Engine {
    pub fn save_clocks(&self) -> anyhow::Result<()> {
        let at = clock_now();
        let saved = SavedClocks {
            boot: std::fs::read_to_string("/proc/sys/kernel/random/boot_id")?,
            at,
            wall: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?,
            clocks: self
                .clocks
                .iter()
                .map(|(id, c)| {
                    (
                        id.clone(),
                        SavedClock {
                            elapsed: c.elapsed_at(at),
                            running: c.since.is_some(),
                            target: c.target,
                            notified: c.notified,
                        },
                    )
                })
                .collect(),
        };
        let path = crate::config::Config::path().with_file_name("clocks.json");
        std::fs::create_dir_all(path.parent().unwrap())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(&saved)?)?;
        std::fs::rename(tmp, path)?;
        Ok(())
    }
    pub fn load_clocks(&mut self) -> anyhow::Result<()> {
        let path = crate::config::Config::path().with_file_name("clocks.json");
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e.into()),
        };
        anyhow::ensure!(bytes.len() < 16384, "clock state exceeds limit");
        let saved: SavedClocks = serde_json::from_slice(&bytes)?;
        anyhow::ensure!(
            saved.clocks.len() <= 2
                && saved
                    .clocks
                    .keys()
                    .all(|k| ["timer", "stopwatch"].contains(&k.as_str())),
            "invalid saved clocks"
        );
        let now = clock_now();
        let delta = if saved.boot == std::fs::read_to_string("/proc/sys/kernel/random/boot_id")? {
            now.saturating_sub(saved.at)
        } else {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .saturating_sub(saved.wall)
        };
        self.clocks = saved
            .clocks
            .into_iter()
            .map(|(id, c)| {
                (
                    id,
                    Clock {
                        elapsed: c.elapsed.saturating_add(if c.running {
                            delta
                        } else {
                            Duration::ZERO
                        }),
                        since: c.running.then_some(now),
                        target: c.target,
                        notified: c.notified,
                    },
                )
            })
            .collect();
        Ok(())
    }
}
