//! Standard MPRIS discovery, capability checks and bounded playback interpolation.
use crate::{
    config::Config,
    history::Store,
    model::{Activity, Engine},
};
use anyhow::{Result, ensure};
use futures_util::{StreamExt, stream};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Notify};
use zbus::{
    Connection, Proxy,
    zvariant::{OwnedObjectPath, OwnedValue},
};
const PLAYER: &str = "org.mpris.MediaPlayer2.Player";
const PATH: &str = "/org/mpris/MediaPlayer2";
#[derive(Clone, Default, Debug, Serialize, Deserialize)]
pub struct Details {
    pub track_id: String,
    pub key: String,
    pub album: String,
    pub can_seek: bool,
    pub rate: f64,
    pub color: String,
}
fn text(v: Option<&OwnedValue>) -> String {
    v.and_then(|v| <&str>::try_from(v).ok())
        .unwrap_or("")
        .chars()
        .take(512)
        .collect()
}
async fn read(c: &Connection, name: String) -> Option<(Activity, String)> {
    let p = Proxy::new(c, name.as_str(), PATH, PLAYER).await.ok()?;
    let metadata = p
        .get_property::<HashMap<String, OwnedValue>>("Metadata")
        .await
        .ok()?;
    let status = p
        .get_property::<String>("PlaybackStatus")
        .await
        .unwrap_or_default();
    let title = text(metadata.get("xesam:title"));
    if title.is_empty() && status != "Playing" {
        return None;
    }
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
    a.status = if status == "Playing" {
        "active"
    } else {
        "paused"
    }
    .into();
    let length = metadata
        .get("mpris:length")
        .and_then(|v| i64::try_from(v).ok())
        .unwrap_or(0)
        .max(0);
    let position = p.get_property::<i64>("Position").await.unwrap_or(0).max(0);
    a.position_seconds = Some(position as f64 / 1e6);
    a.duration_seconds = (length > 0).then_some(length as f64 / 1e6);
    a.progress = a
        .duration_seconds
        .map(|d| (position as f64 / 1e6 / d).clamp(0.0, 1.0));
    let root = Proxy::new(c, name.as_str(), PATH, "org.mpris.MediaPlayer2")
        .await
        .ok()?;
    a.source = root
        .get_property::<String>("Identity")
        .await
        .unwrap_or_else(|_| {
            name.trim_start_matches("org.mpris.MediaPlayer2.")
                .split('.')
                .next()
                .unwrap_or("Media")
                .into()
        })
        .chars()
        .take(80)
        .collect();
    let controlled = p.get_property::<bool>("CanControl").await.unwrap_or(false);
    if controlled {
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
    let track_id = metadata
        .get("mpris:trackid")
        .and_then(|v| v.try_clone().ok())
        .and_then(|v| OwnedObjectPath::try_from(v).ok())
        .map(|v| v.to_string())
        .unwrap_or_default();
    let album = text(metadata.get("xesam:album"));
    let key = crate::artwork::key(&format!("{}\n{}\n{}", a.title, a.description, album));
    let rate = p.get_property::<f64>("Rate").await.unwrap_or(1.0);
    let rate = if rate.is_finite() && (0.05..=8.0).contains(&rate) {
        rate
    } else {
        1.0
    };
    a.music = Some(Details {
        can_seek: controlled
            && !track_id.is_empty()
            && track_id != "/org/mpris/MediaPlayer2/TrackList/NoTrack"
            && length > 0
            && p.get_property::<bool>("CanSeek").await.unwrap_or(false),
        track_id,
        key,
        album,
        rate,
        color: "#7665b8".into(),
    });
    let art = text(metadata.get("mpris:artUrl"));
    Some((a, art))
}
async fn refresh(
    c: &Connection,
    e: &Arc<Mutex<Engine>>,
    jobs: &mut HashMap<String, (String, tokio::task::JoinHandle<()>)>,
    wake: &Arc<Notify>,
) {
    let Ok(bus) = zbus::fdo::DBusProxy::new(c).await else {
        return;
    };
    let Ok(names) = bus.list_names().await else {
        return;
    };
    let names = names
        .into_iter()
        .filter(|n| n.starts_with("org.mpris.MediaPlayer2."))
        .take(32)
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    let mut peers = stream::iter(names)
        .map(|name| async move {
            tokio::time::timeout(Duration::from_secs(3), read(c, name))
                .await
                .ok()
                .flatten()
        })
        .buffer_unordered(4)
        .filter_map(|v| async { v })
        .collect::<Vec<_>>()
        .await;
    peers.sort_by(|a, b| a.0.id.cmp(&b.0.id));
    let mut engine = e.lock().await;
    let old = engine.providers.clone();
    engine.providers.retain(|id, _| !id.starts_with("media:"));
    jobs.retain(|id, (_, job)| {
        let keep = peers.iter().any(|(a, _)| &a.id == id);
        if !keep {
            job.abort();
        }
        keep
    });
    for (mut a, uri) in peers {
        let token = format!("{}\n{uri}", a.music.as_ref().unwrap().key);
        if let Some(old) = old.get(&a.id)
            && old.music.as_ref().map(|m| &m.key) == a.music.as_ref().map(|m| &m.key)
            && jobs.get(&a.id).is_some_and(|(old, _)| old == &token)
        {
            a.icon = old.icon.clone();
            a.music.as_mut().unwrap().color = old.music.as_ref().unwrap().color.clone();
        }
        if !uri.is_empty() && jobs.get(&a.id).is_none_or(|(old, _)| old != &token) {
            if let Some((_, old)) = jobs.remove(&a.id) {
                old.abort();
            }
            let (id, key, uri_copy, e, w) = (
                a.id.clone(),
                a.music.as_ref().unwrap().key.clone(),
                uri.clone(),
                e.clone(),
                wake.clone(),
            );
            let job = tokio::spawn(async move {
                if let Ok((art, color)) = crate::artwork::load(&uri_copy).await {
                    let mut engine = e.lock().await;
                    if let Some(a) = engine.providers.get_mut(&id)
                        && a.music.as_ref().is_some_and(|m| m.key == key)
                    {
                        a.icon = art;
                        a.music.as_mut().unwrap().color = color;
                        drop(engine);
                        w.notify_one();
                    }
                }
            });
            jobs.insert(a.id.clone(), (token, job));
        } else if uri.is_empty()
            && let Some((_, job)) = jobs.remove(&a.id)
        {
            job.abort();
        }
        engine.providers.insert(a.id.clone(), a);
    }
    drop(engine);
    wake.notify_one();
}
pub async fn control(id: &str, action: &str) -> Result<()> {
    ensure!(
        ["Previous", "PlayPause", "Next"].contains(&action),
        "unsupported media action"
    );
    let c = Connection::session().await?;
    let name = player_name(id)?;
    let p = Proxy::new(&c, name, PATH, PLAYER).await?;
    ensure!(
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
    ensure!(
        p.get_property::<bool>(cap).await.unwrap_or(false),
        "control unavailable"
    );
    p.call::<_, _, ()>(action, &()).await?;
    Ok(())
}
fn player_name(id: &str) -> Result<&str> {
    let name = id.strip_prefix("media:").unwrap_or("");
    ensure!(
        name.starts_with("org.mpris.MediaPlayer2.") && name.len() <= 255,
        "invalid media player"
    );
    Ok(name)
}
pub async fn seek(id: &str, track: &str, position: f64) -> Result<()> {
    ensure!(
        position.is_finite() && (0.0..=86400.0).contains(&position),
        "invalid seek position"
    );
    let c = Connection::session().await?;
    let name = player_name(id)?;
    let p = Proxy::new(&c, name, PATH, PLAYER).await?;
    ensure!(
        p.get_property::<bool>("CanControl").await.unwrap_or(false)
            && p.get_property::<bool>("CanSeek").await.unwrap_or(false),
        "player does not support seeking"
    );
    let metadata = p
        .get_property::<HashMap<String, OwnedValue>>("Metadata")
        .await?;
    let current = metadata
        .get("mpris:trackid")
        .and_then(|v| v.try_clone().ok())
        .and_then(|v| OwnedObjectPath::try_from(v).ok())
        .ok_or_else(|| anyhow::anyhow!("no track identifier"))?;
    ensure!(
        current.as_str() == track && track != "/org/mpris/MediaPlayer2/TrackList/NoTrack",
        "track changed before seeking"
    );
    let length = metadata
        .get("mpris:length")
        .and_then(|v| i64::try_from(v).ok())
        .unwrap_or(0);
    ensure!(
        length > 0 && position * 1e6 <= length as f64,
        "seek outside track"
    );
    p.call::<_, _, ()>("SetPosition", &(current, (position * 1e6) as i64))
        .await?;
    Ok(())
}
pub fn spawn(
    e: Arc<Mutex<Engine>>,
    config: Arc<Mutex<Config>>,
    history: Arc<Mutex<Store>>,
    wake: Arc<Notify>,
) {
    tokio::spawn(async move {
        loop {
            if let Ok(c) = Connection::session().await
                && let Ok(bus) = zbus::fdo::DBusProxy::new(&c).await
            {
                for interface in [
                    "org.freedesktop.DBus.Properties",
                    "org.freedesktop.DBus",
                    "org.mpris.MediaPlayer2.Player",
                ] {
                    let _ = bus
                        .add_match_rule(
                            zbus::MatchRule::builder()
                                .msg_type(zbus::message::Type::Signal)
                                .interface(interface)
                                .unwrap()
                                .build(),
                        )
                        .await;
                }
                let mut stream = zbus::MessageStream::from(&c);
                let mut jobs = HashMap::new();
                refresh(&c, &e, &mut jobs, &wake).await;
                let mut at = Instant::now();
                let mut refreshed = at;
                let mut saved = at;
                let mut interval = tokio::time::interval(Duration::from_secs(1));
                interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    tokio::select! {
                            msg=stream.next()=>{let Some(Ok(msg))=msg else{break};let h=msg.header();let relevant=h.path().is_some_and(|p|p.as_str()==PATH)||(h.member().is_some_and(|m|m.as_str()=="NameOwnerChanged")&&msg.body().deserialize::<(String,String,String)>().is_ok_and(|(n,_,_)|n.starts_with("org.mpris.MediaPlayer2.")));if relevant{refresh(&c,&e,&mut jobs,&wake).await;at=Instant::now();refreshed=at;}},
                            _=interval.tick()=>{
                                let delta=at.elapsed().as_secs_f64().min(2.0);at=Instant::now();let cfg=config.lock().await.clone();let mut engine=e.lock().await;let mut active=false;
                                for a in engine.providers.values_mut().filter(|a|a.id.starts_with("media:")&&a.status=="active") {active=true;let rate=a.music.as_ref().map(|m|m.rate).unwrap_or(1.0);let pos=(a.position_seconds.unwrap_or(0.0)+delta*rate).min(a.duration_seconds.unwrap_or(f64::MAX));a.position_seconds=Some(pos);a.progress=a.duration_seconds.map(|d|(pos/d).clamp(0.0,1.0));}
                                let selected=engine.providers.get(&cfg.selected_player).or_else(||engine.providers.values().find(|a|a.id.starts_with("media:")&&a.status=="active")).cloned();drop(engine);
                                history.lock().await.sample(selected.as_ref(),cfg.listening_history,at);if saved.elapsed()>=Duration::from_secs(30){let _=history.lock().await.flush();saved=at;}
                                if active{wake.notify_one();}
                    if active&&refreshed.elapsed()>=Duration::from_secs(15){refresh(&c,&e,&mut jobs,&wake).await;refreshed=Instant::now();at=refreshed;}
                            }
                        }
                }
                for (_, (_, job)) in jobs {
                    job.abort();
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}
