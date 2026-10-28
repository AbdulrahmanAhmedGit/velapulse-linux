mod artwork;
mod audio;
mod capabilities;
mod config;
mod desktop;
mod history;
mod lyrics;
mod model;
mod music;
mod providers;
use futures_util::StreamExt;
use model::{Activity, Clock, Engine};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Notify};
use zbus::{message::Header, object_server::SignalEmitter};
const NAME: &str = "io.github.velapulse.Service";
const PATH: &str = "/io/github/velapulse/Service";
#[derive(Clone)]
struct Service {
    engine: Arc<Mutex<Engine>>,
    config: Arc<Mutex<config::Config>>,
    wake: Arc<Notify>,
    history: Arc<Mutex<history::Store>>,
}
fn invalid(e: impl ToString) -> zbus::fdo::Error {
    zbus::fdo::Error::InvalidArgs(e.to_string())
}
impl Service {
    async fn music_key(&self, id: &str) -> zbus::fdo::Result<String> {
        self.engine
            .lock()
            .await
            .providers
            .get(id)
            .and_then(|a| a.music.as_ref())
            .map(|m| m.key.clone())
            .ok_or_else(|| invalid("player unavailable"))
    }
    async fn json(&self) -> String {
        let config = self.config.lock().await.clone();
        let activities = self.engine.lock().await.snapshot(Instant::now(), &config);
        serde_json::json!({"version":1,"activities":activities,"config":config}).to_string()
    }
}
#[zbus::interface(name = "io.github.velapulse.Service1")]
impl Service {
    async fn snapshot(&self) -> String {
        self.json().await
    }
    async fn command(&self, id: &str, action: &str, seconds: u64) -> zbus::fdo::Result<()> {
        if id.starts_with("media:") {
            tokio::time::timeout(Duration::from_secs(4), music::control(id, action))
                .await
                .map_err(invalid)?
                .map_err(invalid)?;
            return Ok(());
        }
        if !["timer", "stopwatch"].contains(&id) {
            return Err(invalid("unknown clock"));
        }
        let mut e = self.engine.lock().await;
        let n = model::clock_now();
        match action {
            "start" => {
                if id == "timer" && !(1..=86400).contains(&seconds) {
                    return Err(invalid("timer range 1..86400 seconds"));
                }
                e.clocks.insert(
                    id.into(),
                    Clock::new(if id == "timer" { Some(seconds) } else { None }, n),
                );
            }
            "reset" => {
                e.clocks.remove(id);
            }
            "pause" | "resume" => {
                let c = e
                    .clocks
                    .get_mut(id)
                    .ok_or_else(|| invalid("clock not started"))?;
                if action == "pause" {
                    c.pause(n)
                } else {
                    c.resume(n)
                }
            }
            _ => return Err(invalid("unknown action")),
        }
        e.save_clocks().map_err(invalid)?;
        drop(e);
        self.wake.notify_one();
        Ok(())
    }
    async fn push(
        &self,
        json: &str,
        #[zbus(header)] header: Header<'_>,
    ) -> zbus::fdo::Result<String> {
        if json.len() > 4096 {
            return Err(invalid("payload exceeds 4096 bytes"));
        }
        let mut a: Activity = serde_json::from_str(json).map_err(invalid)?;
        a.validate().map_err(invalid)?;
        let owner = header
            .sender()
            .ok_or_else(|| invalid("missing sender"))?
            .to_string();
        let key = format!("external:{owner}:{}", a.id);
        a.id = key.clone();
        let mut e = self.engine.lock().await;
        if !e.external.contains_key(&key)
            && (e.external.len() >= 128
                || e.external
                    .keys()
                    .filter(|k| k.starts_with(&format!("external:{owner}:")))
                    .count()
                    >= 16)
        {
            return Err(invalid("activity quota exceeded"));
        }
        let end = Instant::now() + Duration::from_secs(a.expires_in);
        e.external.insert(key.clone(), (a, end));
        drop(e);
        self.wake.notify_one();
        Ok(key)
    }
    async fn remove(&self, id: &str, #[zbus(header)] header: Header<'_>) -> zbus::fdo::Result<()> {
        let owner = header.sender().ok_or_else(|| invalid("missing sender"))?;
        if !id.starts_with(&format!("external:{owner}:")) {
            return Err(zbus::fdo::Error::AccessDenied(
                "activity belongs to another connection".into(),
            ));
        }
        self.engine.lock().await.external.remove(id);
        self.wake.notify_one();
        Ok(())
    }
    async fn configure(&self, json: &str) -> zbus::fdo::Result<()> {
        if json.len() > 4096 {
            return Err(invalid("configuration too large"));
        }
        let c: config::Config = serde_json::from_str(json).map_err(invalid)?;
        let mut config = self.config.lock().await;
        c.save().map_err(invalid)?;
        *config = c;
        drop(config);
        self.wake.notify_one();
        Ok(())
    }
    async fn seek(&self, id: &str, track: &str, position: f64) -> zbus::fdo::Result<()> {
        tokio::time::timeout(Duration::from_secs(4), music::seek(id, track, position))
            .await
            .map_err(invalid)?
            .map_err(invalid)
    }
    async fn select_player(&self, id: &str) -> zbus::fdo::Result<()> {
        if !id.is_empty() && !self.engine.lock().await.providers.contains_key(id) {
            return Err(invalid("player is no longer available"));
        }
        let mut cfg = self.config.lock().await;
        let mut next = cfg.clone();
        next.selected_player = id.into();
        next.save().map_err(invalid)?;
        *cfg = next;
        drop(cfg);
        self.wake.notify_one();
        Ok(())
    }
    async fn lyrics(&self, id: &str) -> zbus::fdo::Result<String> {
        let key = self.music_key(id).await?;
        serde_json::to_string(&lyrics::get(&key).await).map_err(invalid)
    }
    async fn import_lyrics(&self, id: &str, track: &str, uri: &str) -> zbus::fdo::Result<()> {
        let e = self.engine.lock().await;
        let m = e
            .providers
            .get(id)
            .and_then(|a| a.music.as_ref())
            .ok_or_else(|| invalid("player unavailable"))?;
        if m.track_id != track {
            return Err(invalid("track changed before lyrics import"));
        }
        let key = m.key.clone();
        drop(e);
        lyrics::import(&key, uri).await.map_err(invalid)?;
        self.wake.notify_one();
        Ok(())
    }
    async fn listening_history(&self) -> String {
        self.history.lock().await.report().to_string()
    }
    async fn clear_listening_history(&self) -> zbus::fdo::Result<()> {
        self.history.lock().await.clear().map_err(invalid)
    }
    async fn audio(&self) -> String {
        match audio::snapshot().await {
            Ok(s) => s.to_string(),
            Err(e) => serde_json::json!({"available":false,"error":e.to_string()}).to_string(),
        }
    }
    async fn audio_control(&self, action: &str, value: &str) -> zbus::fdo::Result<String> {
        Ok(audio::control(action, value)
            .await
            .map_err(invalid)?
            .to_string())
    }
    #[zbus(signal)]
    async fn changed(emitter: &SignalEmitter<'_>, json: &str) -> zbus::Result<()>;
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("doctor") {
        return desktop::doctor().await;
    }
    if args.get(1).map(String::as_str) == Some("run") {
        return desktop::run_task(&args[2..]).await;
    }
    if args.get(1).map(String::as_str) == Some("preferences") {
        return desktop::preferences().await;
    }
    if args.get(1).map(String::as_str) == Some("capabilities") {
        return capabilities::detect();
    }
    if args.get(1).is_some_and(|s| s != "daemon") {
        let c = zbus::Connection::session().await?;
        let p = zbus::Proxy::new(&c, NAME, PATH, "io.github.velapulse.Service1").await?;
        match args[1].as_str() {
            "snapshot" => println!("{}", p.call::<_, _, String>("Snapshot", &()).await?),
            "timer" | "stopwatch" => {
                let action = args.get(2).map(String::as_str).unwrap_or("start");
                let seconds = args
                    .get(3)
                    .map(|s| s.parse::<u64>())
                    .transpose()?
                    .unwrap_or(300);
                p.call::<_, _, ()>("Command", &(args[1].as_str(), action, seconds))
                    .await?;
            }
            "push" => {
                let json = args
                    .get(2)
                    .ok_or_else(|| anyhow::anyhow!("push requires JSON"))?;
                println!("{}", p.call::<_, _, String>("Push", &(json,)).await?);
            }
            "configure" => {
                let json = args
                    .get(2)
                    .ok_or_else(|| anyhow::anyhow!("configure requires JSON"))?;
                p.call::<_, _, ()>("Configure", &(json,)).await?;
            }
            _ => anyhow::bail!(
                "Usage: velapulse [daemon|capabilities|snapshot|timer start SECONDS|timer pause|timer resume|timer reset|stopwatch start|push JSON|configure JSON]"
            ),
        }
        return Ok(());
    }
    let mut engine = Engine::default();
    if let Err(error) = engine.load_clocks() {
        eprintln!("Clock state could not be restored: {error}");
    }
    let service = Service {
        engine: Arc::new(Mutex::new(engine)),
        config: Arc::new(Mutex::new(config::Config::load()?)),
        wake: Default::default(),
        history: Arc::new(Mutex::new(history::Store::load())),
    };
    let conn = zbus::connection::Builder::session()?
        .serve_at(PATH, service.clone())?
        .build()
        .await?;
    providers::spawn(service.engine.clone(), service.wake.clone());
    music::spawn(
        service.engine.clone(),
        service.config.clone(),
        service.history.clone(),
        service.wake.clone(),
    );
    conn.request_name_with_flags(NAME, zbus::fdo::RequestNameFlags::DoNotQueue.into())
        .await?;
    let renderer = tokio::spawn(desktop::supervise(service.config.clone()));
    let emitter = SignalEmitter::new(&conn, PATH)?;
    let mut disconnected = zbus::MessageStream::from(&conn);
    let connection_end = async move { while disconnected.next().await.is_some() {} };
    tokio::pin!(connection_end);
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let mut previous = String::new();
    loop {
        let json = service.json().await;
        if json != previous {
            Service::changed(&emitter, &json).await?;
            previous = json;
        }
        let mut completed = false;
        let delay = {
            let mut e = service.engine.lock().await;
            let n = Instant::now();
            for c in e.clocks.values_mut() {
                if c.done(model::clock_now()) && !c.notified {
                    c.notified = true;
                    completed = true;
                }
            }
            if completed && let Err(error) = e.save_clocks() {
                eprintln!("Clock state could not be saved: {error}");
            }
            if e.clocks
                .values()
                .any(|c| c.since.is_some() && !c.done(model::clock_now()))
            {
                Duration::from_secs(1)
            } else {
                e.external
                    .values()
                    .map(|(_, t)| t.saturating_duration_since(n))
                    .min()
                    .unwrap_or(Duration::from_secs(3600))
            }
        };
        if completed {
            providers::notify(&conn).await;
        }
        tokio::select! {_=service.wake.notified()=>{},_=tokio::time::sleep(delay)=>{},_=tokio::signal::ctrl_c()=>break,_=&mut connection_end=>break,_=terminate.recv()=>break}
    }
    if let Err(e) = service.history.lock().await.flush() {
        eprintln!("History could not be saved: {e}");
    }
    renderer.abort();
    let _ = renderer.await;
    Ok(())
}
