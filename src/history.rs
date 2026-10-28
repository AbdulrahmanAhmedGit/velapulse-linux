//! Opt-in local listening accounting. No browser history, uploads or paused time.
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub key: String,
    pub title: String,
    pub artist: String,
    pub day: u64,
    pub seconds: f64,
    pub plays: u32,
    pub last_played: u64,
}
#[derive(Default)]
pub struct Store {
    pub entries: Vec<Entry>,
    last: Option<(String, Instant)>,
    dirty: bool,
    last_key: Option<String>,
}
pub fn data_dir() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
        })
        .join("velapulse")
}
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
impl Store {
    pub fn load() -> Self {
        let mut result = Self::default();
        if let Ok(bytes) = std::fs::read(data_dir().join("listening-history.json"))
            && bytes.len() <= 4 * 1024 * 1024
        {
            result.entries = serde_json::from_slice(&bytes).unwrap_or_default();
            result.entries.truncate(2000);
        }
        result
    }
    pub fn sample(&mut self, track: Option<&crate::model::Activity>, enabled: bool, at: Instant) {
        if !enabled {
            self.last = None;
            return;
        }
        let current = track
            .filter(|a| a.status == "active")
            .and_then(|a| a.music.as_ref().map(|m| (a, m.key.clone())));
        if let Some((old, since)) = &self.last {
            // Only continuous playback earns time. A delayed tick cannot count suspend.
            if let Some((_, key)) = &current
                && key == old
            {
                let delta = at.saturating_duration_since(*since);
                if delta <= Duration::from_secs(3)
                    && let Some(e) = self
                        .entries
                        .iter_mut()
                        .rev()
                        .find(|e| &e.key == key && e.day == now() / 86400)
                {
                    e.seconds += delta.as_secs_f64();
                    e.last_played = now();
                    self.dirty = true;
                }
            }
        }
        if let Some((a, key)) = current {
            if self.last_key.as_ref() != Some(&key)
                || !self
                    .entries
                    .iter()
                    .any(|e| e.key == key && e.day == now() / 86400)
            {
                if let Some(e) = self
                    .entries
                    .iter_mut()
                    .find(|e| e.key == key && e.day == now() / 86400)
                {
                    e.plays += 1;
                    e.last_played = now();
                } else {
                    self.entries.push(Entry {
                        key: key.clone(),
                        title: a.title.chars().take(128).collect(),
                        artist: a.description.chars().take(128).collect(),
                        day: now() / 86400,
                        seconds: 0.0,
                        plays: 1,
                        last_played: now(),
                    });
                }
                self.dirty = true;
            }
            self.last_key = Some(key.clone());
            self.last = Some((key, at));
        } else {
            self.last = None;
        }
        let day = now() / 86400;
        self.entries.retain(|e| e.day + 90 >= day);
        if self.entries.len() > 2000 {
            self.entries.drain(..self.entries.len() - 2000);
        }
    }
    pub fn flush(&mut self) -> anyhow::Result<()> {
        if self.dirty {
            let dir = data_dir();
            std::fs::create_dir_all(&dir)?;
            let file = dir.join("listening-history.json");
            let temp = file.with_extension("tmp");
            use std::{io::Write, os::unix::fs::OpenOptionsExt};
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&temp)?;
            output.write_all(&serde_json::to_vec(&self.entries)?)?;
            std::fs::rename(temp, file)?;
            self.dirty = false;
        }
        Ok(())
    }
    pub fn clear(&mut self) -> anyhow::Result<()> {
        self.entries.clear();
        self.last = None;
        self.last_key = None;
        self.dirty = true;
        self.flush()
    }
    pub fn report(&self) -> serde_json::Value {
        use std::collections::BTreeMap;
        let mut songs = BTreeMap::<String, f64>::new();
        let mut artists = BTreeMap::<String, f64>::new();
        let mut daily = BTreeMap::<u64, f64>::new();
        let day = now() / 86400;
        for e in self.entries.iter().filter(|e| e.day + 6 >= day) {
            *songs
                .entry(format!("{} · {}", e.title, e.artist))
                .or_default() += e.seconds;
            *artists.entry(e.artist.clone()).or_default() += e.seconds;
            *daily.entry(e.day).or_default() += e.seconds;
        }
        let rank = |map: BTreeMap<String, f64>| {
            let mut v = map.into_iter().collect::<Vec<_>>();
            v.sort_by(|a, b| b.1.total_cmp(&a.1));
            v.truncate(20);
            v
        };
        let mut recent = self.entries.clone();
        recent.sort_by_key(|e| std::cmp::Reverse(e.last_played));
        recent.truncate(20);
        serde_json::json!({"recent":recent,"songs":rank(songs),"artists":rank(artists),"daily":daily,"week_seconds":self.entries.iter().filter(|e|e.day+6>=day).map(|e|e.seconds).sum::<f64>()})
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn never_counts_paused_duplicate_or_suspended_time() {
        let mut s = Store::default();
        let mut a = crate::model::Activity::new("media:test", "Test");
        a.music = Some(crate::music::Details {
            key: "test".into(),
            ..Default::default()
        });
        let t = Instant::now();
        s.sample(Some(&a), false, t);
        assert!(s.entries.is_empty());
        s.sample(Some(&a), true, t);
        s.sample(Some(&a), true, t + Duration::from_secs(1));
        assert_eq!(s.entries[0].plays, 1);
        assert_eq!(s.entries[0].seconds, 1.0);
        s.sample(Some(&a), true, t + Duration::from_secs(120));
        assert_eq!(s.entries[0].seconds, 1.0);
        a.status = "paused".into();
        s.sample(Some(&a), true, t + Duration::from_secs(121));
        assert_eq!(s.entries[0].seconds, 1.0);
        a.status = "active".into();
        s.sample(Some(&a), true, t + Duration::from_secs(122));
        assert_eq!(s.entries[0].plays, 1);
    }
}
