use crate::model::{Activity, Engine};
use futures_util::StreamExt;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::{Mutex, Notify};
use zbus::{Connection, Proxy, zvariant::OwnedValue};
type Shared = Arc<Mutex<Engine>>;
async fn watch(c: &Connection, system: bool) -> anyhow::Result<zbus::MessageStream> {
    let b = zbus::fdo::DBusProxy::new(c).await?;
    for iface in if system {
        vec!["org.freedesktop.DBus.Properties"]
    } else {
        vec![
            "org.freedesktop.DBus.Properties",
            "org.freedesktop.DBus",
            "org.mpris.MediaPlayer2.Player",
        ]
    } {
        b.add_match_rule(
            zbus::MatchRule::builder()
                .msg_type(zbus::message::Type::Signal)
                .interface(iface)?
                .build(),
        )
        .await?;
    }
    Ok(zbus::MessageStream::from(c))
}
async fn battery(c: &Connection, e: &Shared) {
    let result = async {
        let p = Proxy::new(
            c,
            "org.freedesktop.UPower",
            "/org/freedesktop/UPower/devices/DisplayDevice",
            "org.freedesktop.UPower.Device",
        )
        .await
        .ok()?;
        if !p.get_property::<bool>("IsPresent").await.ok()? {
            return None;
        }
        let pct = p.get_property::<f64>("Percentage").await.ok()?;
        let state = p.get_property::<u32>("State").await.ok()?;
        let mut a = Activity::new("battery", "Battery");
        a.description = format!(
            "{pct:.0}% · {}",
            match state {
                1 => "Charging",
                2 => "Discharging",
                4 => "Fully charged",
                5 => "Pending charge",
                6 => "Pending discharge",
                _ => "Unknown power state",
            }
        );
        a.progress = Some((pct / 100.0).clamp(0.0, 1.0));
        if pct < 15.0 && state != 1 {
            a.status = "warning".into();
        }
        Some(a)
    }
    .await;
    let mut e = e.lock().await;
    e.providers.remove("battery");
    if let Some(a) = result {
        e.providers.insert(a.id.clone(), a);
    }
}
pub fn spawn(e: Shared, w: Arc<Notify>) {
    let (engine, wake) = (e.clone(), w.clone());
    tokio::spawn(async move {
        loop {
            if let Ok(c) = Connection::system().await
                && let Ok(mut stream) = watch(&c, true).await
            {
                battery(&c, &engine).await;
                wake.notify_one();
                while let Some(Ok(msg)) = stream.next().await {
                    if msg
                        .header()
                        .path()
                        .is_some_and(|p| p.starts_with("/org/freedesktop/UPower"))
                    {
                        battery(&c, &engine).await;
                        wake.notify_one();
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
    // wpctl is an optional, fixed-argument fallback; bounded 15-second sampling.
    tokio::spawn(async move {
        loop {
            let result = tokio::time::timeout(
                Duration::from_secs(2),
                tokio::process::Command::new("wpctl")
                    .args(["get-volume", "@DEFAULT_AUDIO_SINK@"])
                    .kill_on_drop(true)
                    .output(),
            )
            .await;
            let mut engine = e.lock().await;
            engine.providers.remove("volume");
            if let Ok(Ok(out)) = result
                && out.status.success()
            {
                let mut a = Activity::new("volume", "Audio");
                a.description = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .chars()
                    .take(80)
                    .collect();
                a.progress = a
                    .description
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse::<f64>().ok())
                    .filter(|v| v.is_finite())
                    .map(|v| v.clamp(0.0, 1.0));
                if a.description.contains("MUTED") {
                    a.status = "paused".into();
                }
                engine.providers.insert(a.id.clone(), a);
            }
            drop(engine);
            w.notify_one();
            tokio::time::sleep(Duration::from_secs(15)).await;
        }
    });
}
pub async fn notify(c: &Connection) {
    if let Ok(p) = Proxy::new(
        c,
        "org.freedesktop.Notifications",
        "/org/freedesktop/Notifications",
        "org.freedesktop.Notifications",
    )
    .await
    {
        let _ = p
            .call::<_, _, u32>(
                "Notify",
                &(
                    "VelaPulse",
                    0u32,
                    "alarm-symbolic",
                    "Timer complete",
                    "Your countdown has finished.",
                    Vec::<String>::new(),
                    HashMap::<String, OwnedValue>::new(),
                    5000i32,
                ),
            )
            .await;
    }
}
