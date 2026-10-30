mod artwork;
mod audio;
mod brief;
mod capabilities;
mod config;
mod desktop;
mod developer;
mod history;
mod lyrics;
mod model;
mod music;
mod providers;
mod tasks;
mod weather;
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
    weather: Arc<Mutex<weather::State>>,
    weather_refresh: Arc<Notify>,
    developer: Arc<Mutex<developer::Store>>,
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
        let mut developers = self.developer.lock().await;
        let items = developers.refresh(&config.developer, history::now());
        let mut engine = self.engine.lock().await;
        engine
            .providers
            .retain(|id, _| !id.starts_with("developer:"));
        for a in items {
            engine.providers.insert(a.id.clone(), a);
        }
        let activities = engine.snapshot(Instant::now(), &config);
        serde_json::json!({"version":1,"activities":activities,"config":config}).to_string()
    }
}
#[zbus::interface(name = "io.github.velapulse.Service1")]
impl Service {
    async fn snapshot(&self) -> String {
        self.json().await
    }
    async fn command(&self, id: &str, action: &str, seconds: u64) -> zbus::fdo::Result<()> {
        if id == "brief" && ["open", "refresh"].contains(&action) {
            let date = brief::local_date().await;
            let forecast = self.weather.lock().await.view.clone();
            let cfg = self.config.lock().await.clone();
            let mut e = self.engine.lock().await;
            let activities = e.snapshot(Instant::now(), &cfg);
            let mut a = Activity::new("brief", "Now Brief");
            a.controls = vec!["refresh".into()];
            a.description = "Your enabled activities at a glance".into();
            a.summary = activities
                .iter()
                .filter(|a| a.id != "brief")
                .map(|a| format!("{} · {}", a.title, a.description))
                .collect();
            a.summary.insert(0, date);
            if cfg.weather.enabled
                && let Some(w) = forecast.as_ref()
            {
                if let Some(day) = weather::today(&w.days, history::now()) {
                    a.summary.push(format!(
                        "Today: {:.0}° – {:.0}° · rain {:.0}%{}",
                        weather::temp(day.low, &cfg.weather.units),
                        weather::temp(day.high, &cfg.weather.units),
                        day.rain,
                        if w.stale { " · Cached forecast" } else { "" }
                    ));
                }
                a.summary.extend(w.notices.iter().cloned());
                a.summary
                    .push("Weather data by Open-Meteo · CC BY 4.0 · open-meteo.com".into());
            }
            if a.summary.len() == 1 {
                a.summary.push(
                    "No active activities. Enable weather or start something when ready.".into(),
                );
            }
            e.external.insert(
                "brief".into(),
                (a, Instant::now() + Duration::from_secs(120)),
            );
            drop(e);
            self.wake.notify_one();
            return Ok(());
        }
        if id == "weather" && action == "refresh" {
            self.weather_refresh.notify_one();
            return Ok(());
        }
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
    async fn weather(&self) -> String {
        self.weather.lock().await.display().to_string()
    }
    async fn weather_search(&self, query: &str) -> zbus::fdo::Result<String> {
        let mut state = self.weather.lock().await;
        if state
            .search_at
            .is_some_and(|t| t.elapsed() < Duration::from_secs(2))
        {
            return Err(invalid("Wait two seconds between city searches"));
        }
        state.search_at = Some(Instant::now());
        drop(state);
        serde_json::to_string(&weather::search(query).await.map_err(invalid)?).map_err(invalid)
    }
    async fn weather_refresh(&self) {
        self.weather_refresh.notify_one();
    }
    async fn brief(&self) -> String {
        let config = self.config.lock().await.clone();
        let activities = self.engine.lock().await.snapshot(Instant::now(), &config);
        brief::compose(
            &activities,
            if config.weather.enabled {
                self.weather.lock().await.display()
            } else {
                serde_json::json!({"error":"Weather is disabled"})
            },
        )
        .to_string()
    }
    async fn developer_event(
        &self,
        json: &str,
        #[zbus(header)] header: Header<'_>,
    ) -> zbus::fdo::Result<String> {
        if json.len() > 4096 {
            return Err(invalid("event too large"));
        }
        let event: developer::Event = serde_json::from_str(json).map_err(invalid)?;
        let settings = self.config.lock().await.developer.clone();
        let provider = event.provider.clone();
        let state = event.state.clone();
        let title = event.title.clone();
        let message = event.message.clone();
        let (id, changed) = self
            .developer
            .lock()
            .await
            .apply(
                event,
                header
                    .sender()
                    .ok_or_else(|| invalid("missing owner"))?
                    .as_str(),
                &settings,
                history::now(),
            )
            .map_err(invalid)?;
        self.developer.lock().await.save().map_err(invalid)?;
        self.wake.notify_one();
        let enabled = match provider.as_str() {
            "codex" => settings.codex_notifications,
            "claude" => settings.claude_notifications,
            _ => settings.task_notifications,
        };
        if changed
            && enabled
            && ["waiting", "completed", "failed"].contains(&state.as_str())
            && let Ok(bus) = zbus::Connection::session().await
        {
            tokio::spawn(async move {
                developer::notify(&bus, &format!("{} · {}", title, state), &message, 1).await;
            });
        }
        Ok(id)
    }
    async fn developer_cancel(
        &self,
        id: &str,
        #[zbus(signal_emitter)] emitter: SignalEmitter<'_>,
    ) -> zbus::fdo::Result<()> {
        let store = self.developer.lock().await;
        let r = store
            .records
            .get(id)
            .ok_or_else(|| invalid("task unavailable"))?;
        if !r.view.owned
            || !["running", "starting", "waiting"].contains(&r.view.state.as_str())
            || r.owner.is_empty()
        {
            return Err(invalid(
                "Only an active VelaPulse-owned task can be cancelled",
            ));
        }
        drop(store);
        Self::task_cancelled(&emitter, id).await.map_err(invalid)
    }
    #[zbus(signal)]
    async fn task_cancelled(emitter: &SignalEmitter<'_>, id: &str) -> zbus::Result<()>;
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
        return tasks::run(&args[2..], false).await;
    }
    if args.get(1).map(String::as_str) == Some("codex") {
        return tasks::run(&args[2..], true).await;
    }
    if args.get(1).map(String::as_str) == Some("agent-event") {
        let c = zbus::Connection::session().await?;
        let p = zbus::Proxy::new(&c, NAME, PATH, "io.github.velapulse.Service1").await?;
        let _: String = p
            .call(
                "DeveloperEvent",
                &(args
                    .get(2)
                    .ok_or_else(|| anyhow::anyhow!("missing event"))?,),
            )
            .await?;
        return Ok(());
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
        weather: Default::default(),
        weather_refresh: Default::default(),
        developer: Arc::new(Mutex::new(developer::Store::load())),
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
    weather::spawn(
        service.weather.clone(),
        service.engine.clone(),
        service.config.clone(),
        service.wake.clone(),
        service.weather_refresh.clone(),
    );
    developer::spawn(
        service.developer.clone(),
        service.engine.clone(),
        service.config.clone(),
        service.wake.clone(),
    );
    brief::spawn(
        service.engine.clone(),
        service.config.clone(),
        service.wake.clone(),
    );
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
