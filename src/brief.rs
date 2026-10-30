//! Local clock and composition of enabled activities; no calendar/account access.
use crate::{
    config::Config,
    model::{Activity, Engine},
};
use std::{sync::Arc, time::Duration};
use tokio::sync::{Mutex, Notify};
pub fn compose(activities: &[Activity], weather: serde_json::Value) -> serde_json::Value {
    serde_json::json!({"weather":weather,"activities":activities.iter().filter(|a|a.id=="timer"||a.id=="stopwatch"||a.id.starts_with("media:")||a.id.starts_with("developer:")).collect::<Vec<_>>()})
}
pub fn spawn(engine: Arc<Mutex<Engine>>, config: Arc<Mutex<Config>>, wake: Arc<Notify>) {
    tokio::spawn(async move {
        let mut previous = String::new();
        loop {
            let cfg = config.lock().await.clone();
            if !cfg.idle_clock {
                engine.lock().await.providers.remove("clock");
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
            let format = if cfg.clock_24h {
                "+%H:%M|%A, %d %B"
            } else {
                "+%I:%M %p|%A, %d %B"
            };
            let result = tokio::time::timeout(
                Duration::from_secs(2),
                tokio::process::Command::new("date")
                    .arg(format)
                    .kill_on_drop(true)
                    .output(),
            )
            .await;
            let text = result
                .ok()
                .and_then(Result::ok)
                .filter(|o| o.status.success())
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .unwrap_or_default();
            let mut e = engine.lock().await;
            e.providers.remove("clock");
            if cfg.idle_clock && !text.is_empty() {
                let (time, date) = text.trim().split_once('|').unwrap_or(("Clock", ""));
                let mut a = Activity::new("clock", time);
                a.description = date.into();
                if cfg.clock_temperature
                    && let Some(w) = e.providers.get("weather").and_then(|a| a.weather.as_ref())
                {
                    a.description.push_str(&format!(
                        " · {:.0}°{}",
                        crate::weather::temp(w.temperature, &w.units),
                        if w.units == "fahrenheit" { "F" } else { "C" }
                    ));
                }
                e.providers.insert("clock".into(), a);
            }
            drop(e);
            if previous != text || cfg.idle_clock {
                wake.notify_one();
                previous = text;
            }
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
}

pub async fn local_date() -> String {
    tokio::time::timeout(
        Duration::from_secs(2),
        tokio::process::Command::new("date")
            .arg("+%A, %d %B · %H:%M %Z")
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()
    .and_then(Result::ok)
    .filter(|r| r.status.success())
    .and_then(|r| String::from_utf8(r.stdout).ok())
    .unwrap_or_else(|| "Today".into())
    .trim()
    .to_string()
}
