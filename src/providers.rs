use crate::model::{Activity, Engine};
use futures_util::StreamExt;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Notify};
use zbus::{Connection, Proxy, zvariant::OwnedValue};
type Shared = Arc<Mutex<Engine>>;
const PLAYER: &str = "org.mpris.MediaPlayer2.Player";
const MPRIS_PATH: &str = "/org/mpris/MediaPlayer2";
fn text(v: Option<&OwnedValue>) -> String {
    v.and_then(|v| <&str>::try_from(v).ok())
        .unwrap_or("")
        .chars()
        .take(256)
        .collect()
}
async fn media(c: &Connection, e: &Shared) -> Vec<(String, i64, i64, Instant)> {
    let Ok(bus) = zbus::fdo::DBusProxy::new(c).await else {
        return vec![];
    };
    let Ok(names) = bus.list_names().await else {
        return vec![];
    };
    let mut items = vec![];
    let mut playing = vec![];
    for name in names
        .into_iter()
        .filter(|n| n.starts_with("org.mpris.MediaPlayer2."))
    {
        let Ok(p) = Proxy::new(c, name.as_str(), MPRIS_PATH, PLAYER).await else {
            continue;
        };
        let Ok(metadata) = p
            .get_property::<HashMap<String, OwnedValue>>("Metadata")
            .await
        else {
            continue;
        };
        let title = text(metadata.get("xesam:title"));
        let mut a = Activity::new(
            &format!("media:{name}"),
            if title.is_empty() {
                "Media player"
            } else {
                &title
            },
        );
        a.description = metadata
            .get("xesam:artist")
            .and_then(|v| v.try_clone().ok())
            .and_then(|v| Vec::<String>::try_from(v).ok())
            .unwrap_or_default()
            .join(", ")
            .chars()
            .take(512)
            .collect();
        let status = p
            .get_property::<String>("PlaybackStatus")
            .await
            .unwrap_or_default();
        a.status = if status == "Playing" {
            "active"
        } else {
            "paused"
        }
        .into();
        let length = metadata
            .get("mpris:length")
            .and_then(|v| i64::try_from(v).ok())
            .unwrap_or(0);
        let pos = p.get_property::<i64>("Position").await.unwrap_or(0).max(0);
        if length > 0 {
            a.progress = Some((pos as f64 / length as f64).clamp(0.0, 1.0));
            if status == "Playing" {
                playing.push((a.id.clone(), pos, length, Instant::now()));
            }
        }
        // Only file artwork is exposed; the UI never fetches arbitrary remote URLs.
        let art = text(metadata.get("mpris:artUrl"));
        if art.starts_with("file://") {
            a.icon = art;
        }
        if p.get_property::<bool>("CanControl").await.unwrap_or(false) {
            for (cap, action) in [
                ("CanGoPrevious", "Previous"),
                (
                    if status == "Playing" {
                        "CanPause"
                    } else {
                        "CanPlay"
                    },
                    "PlayPause",
                ),
                ("CanGoNext", "Next"),
            ] {
                if p.get_property::<bool>(cap).await.unwrap_or(false) {
                    a.controls.push(action.into());
                }
            }
        }
        items.push(a);
    }
    let mut engine = e.lock().await;
    engine.providers.retain(|id, _| !id.starts_with("media:"));
    for a in items {
        engine.providers.insert(a.id.clone(), a);
    }
    playing
}
pub async fn control(id: &str, action: &str) -> anyhow::Result<()> {
    anyhow::ensure!(
        ["Previous", "PlayPause", "Next"].contains(&action),
        "unsupported media action"
    );
    let name = id.strip_prefix("media:").unwrap_or("");
    anyhow::ensure!(
        name.starts_with("org.mpris.MediaPlayer2."),
        "invalid player"
    );
    let c = Connection::session().await?;
    let p = Proxy::new(&c, name, MPRIS_PATH, PLAYER).await?;
    anyhow::ensure!(
        p.get_property::<bool>("CanControl").await.unwrap_or(false),
        "player cannot be controlled"
    );
    let cap = match action {
        "Previous" => "CanGoPrevious",
        "Next" => "CanGoNext",
        _ => {
            if p.get_property::<String>("PlaybackStatus")
                .await
                .unwrap_or_default()
                == "Playing"
            {
                "CanPause"
            } else {
                "CanPlay"
            }
        }
    };
    anyhow::ensure!(
        p.get_property::<bool>(cap).await.unwrap_or(false),
        "control unavailable"
    );
    p.call::<_, _, ()>(action, &()).await?;
    Ok(())
}
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
            if let Ok(c) = Connection::session().await
                && let Ok(mut stream) = watch(&c, false).await
            {
                let mut playing = media(&c, &engine).await;
                wake.notify_one();
                loop {
                    tokio::select! {
                     msg=stream.next()=> {let Some(Ok(msg))=msg else{break};let h=msg.header();let relevant=h.path().is_some_and(|p|p.as_str()==MPRIS_PATH)|| (h.member().is_some_and(|m|m.as_str()=="NameOwnerChanged")&&msg.body().deserialize::<(String,String,String)>().is_ok_and(|(n,_,_)|n.starts_with("org.mpris.MediaPlayer2.")));
                       if relevant {playing=media(&c,&engine).await;wake.notify_one();}},
                     _=tokio::time::sleep(Duration::from_secs(1)),if !playing.is_empty()=>{let mut e=engine.lock().await;for (id,pos,len,at) in &playing {if let Some(a)=e.providers.get_mut(id){a.progress=Some(((*pos as f64+at.elapsed().as_micros() as f64)/ *len as f64).clamp(0.0,1.0));}}wake.notify_one();}
                    }
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
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
            if let Ok(Ok(out)) = tokio::time::timeout(
                Duration::from_secs(2),
                tokio::process::Command::new("wpctl")
                    .args(["get-volume", "@DEFAULT_AUDIO_SINK@"])
                    .kill_on_drop(true)
                    .output(),
            )
            .await
            {
                let mut engine = e.lock().await;
                engine.providers.remove("volume");
                if out.status.success() {
                    let mut a = Activity::new("volume", "Audio");
                    a.description = String::from_utf8_lossy(&out.stdout)
                        .trim()
                        .chars()
                        .take(80)
                        .collect();
                    engine.providers.insert(a.id.clone(), a);
                }
                w.notify_one();
            }
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
