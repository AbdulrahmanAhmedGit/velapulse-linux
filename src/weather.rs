//! Opt-in Open-Meteo client. Fixed HTTPS hosts, bounded I/O, local cache and notices.
use crate::{
    config::Config,
    model::{Activity, Engine},
};
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Notify};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Location {
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
}
impl Location {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.name.is_empty()
                && self.name.len() <= 120
                && !self.name.chars().any(char::is_control),
            "invalid location name"
        );
        ensure!(
            self.latitude.is_finite()
                && (-90.0..=90.0).contains(&self.latitude)
                && self.longitude.is_finite()
                && (-180.0..=180.0).contains(&self.longitude),
            "invalid coordinates"
        );
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Settings {
    pub enabled: bool,
    pub location: Option<Location>,
    pub units: String,
    pub refresh_minutes: u64,
    pub rain_notices: bool,
    pub change_notices: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: false,
            location: None,
            units: "celsius".into(),
            refresh_minutes: 30,
            rain_notices: true,
            change_notices: false,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            ["celsius", "fahrenheit"].contains(&self.units.as_str()),
            "invalid temperature unit"
        );
        ensure!(
            (15..=180).contains(&self.refresh_minutes),
            "refresh must be 15..180 minutes"
        );
        if let Some(l) = &self.location {
            l.validate()?;
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Hour {
    pub at: u64,
    pub temperature: f64,
    pub rain: f64,
    pub code: u16,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Day {
    pub at: u64,
    pub low: f64,
    pub high: f64,
    pub rain: f64,
    pub code: u16,
}
fn utc() -> String {
    "UTC".into()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct View {
    pub location: Location,
    #[serde(default = "utc")]
    pub timezone: String,
    pub updated: u64,
    pub temperature: f64,
    pub feels_like: f64,
    pub humidity: f64,
    pub wind: f64,
    pub code: u16,
    pub hours: Vec<Hour>,
    pub days: Vec<Day>,
    pub stale: bool,
    pub error: String,
    pub notices: Vec<String>,
    pub units: String,
    pub attribution: String,
}
pub fn condition(c: u16) -> &'static str {
    match c {
        0 => "Clear",
        1..=3 => "Cloudy",
        45 | 48 => "Fog",
        51..=67 => "Rain",
        71..=77 | 85 | 86 => "Snow",
        80..=82 => "Showers",
        95..=99 => "Thunderstorm forecast",
        _ => "Conditions unavailable",
    }
}
pub fn icon(c: u16) -> &'static str {
    match c {
        0 => "weather-clear-symbolic",
        1..=3 => "weather-few-clouds-symbolic",
        45 | 48 => "weather-fog-symbolic",
        71..=77 | 85 | 86 => "weather-snow-symbolic",
        95..=99 => "weather-storm-symbolic",
        _ => "weather-showers-symbolic",
    }
}
pub fn temp(c: f64, units: &str) -> f64 {
    if units == "fahrenheit" {
        c * 1.8 + 32.0
    } else {
        c
    }
}
fn number(v: &Value, k: &str, i: Option<usize>, min: f64, max: f64) -> Result<f64> {
    let value = if let Some(i) = i { &v[k][i] } else { &v[k] };
    let n = value
        .as_f64()
        .ok_or_else(|| anyhow::anyhow!("missing weather {k}"))?;
    ensure!(
        n.is_finite() && (min..=max).contains(&n),
        "invalid weather {k}"
    );
    Ok(n)
}
pub fn parse(v: &Value, location: Location, now: u64) -> Result<View> {
    let c = &v["current"];
    let h = &v["hourly"];
    let d = &v["daily"];
    let updated = number(c, "time", None, 1.0, (now + 3600) as f64)? as u64;
    ensure!(
        now.saturating_sub(updated) <= 86400,
        "provider current data is too old"
    );
    let times = h["time"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing hourly forecast"))?;
    ensure!(
        !times.is_empty() && times.len() <= 192,
        "invalid hourly count"
    );
    let mut hours = Vec::new();
    for i in 0..times.len() {
        let at = number(h, "time", Some(i), 1.0, (now + 9 * 86400) as f64)? as u64;
        if at + 3600 >= now && hours.len() < 12 {
            hours.push(Hour {
                at,
                temperature: number(h, "temperature_2m", Some(i), -100.0, 70.0)?,
                rain: number(h, "precipitation_probability", Some(i), 0.0, 100.0)?,
                code: number(h, "weather_code", Some(i), 0.0, 99.0)? as u16,
            });
        }
    }
    let times = d["time"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing daily forecast"))?;
    ensure!(!times.is_empty() && times.len() <= 7, "invalid daily count");
    let mut days = Vec::new();
    for i in 0..times.len() {
        days.push(Day {
            at: number(d, "time", Some(i), 1.0, (now + 9 * 86400) as f64)? as u64,
            low: number(d, "temperature_2m_min", Some(i), -100.0, 70.0)?,
            high: number(d, "temperature_2m_max", Some(i), -100.0, 70.0)?,
            rain: number(d, "precipitation_probability_max", Some(i), 0.0, 100.0)?,
            code: number(d, "weather_code", Some(i), 0.0, 99.0)? as u16,
        });
    }
    Ok(View {
        location,
        timezone: v["timezone"]
            .as_str()
            .filter(|s| {
                s.len() <= 80
                    && s.bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"/_+-".contains(&c))
            })
            .unwrap_or("UTC")
            .into(),
        updated,
        temperature: number(c, "temperature_2m", None, -100.0, 70.0)?,
        feels_like: number(c, "apparent_temperature", None, -120.0, 90.0)?,
        humidity: number(c, "relative_humidity_2m", None, 0.0, 100.0)?,
        wind: number(c, "wind_speed_10m", None, 0.0, 500.0)?,
        code: number(c, "weather_code", None, 0.0, 99.0)? as u16,
        hours,
        days,
        stale: false,
        error: String::new(),
        notices: Vec::new(),
        units: "celsius".into(),
        attribution: "Weather data: Open-Meteo · CC BY 4.0 · temperatures converted when requested"
            .into(),
    })
}
fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .user_agent("VelaPulse/0.1 (personal weather)")
        .build()?)
}
async fn fetch(url: reqwest::Url) -> Result<Value> {
    let mut response = client()?.get(url).send().await?.error_for_status()?;
    ensure!(
        response.content_length().unwrap_or(0) <= 1024 * 1024,
        "weather payload too large"
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(
            bytes.len() + chunk.len() <= 1024 * 1024,
            "weather payload too large"
        );
        bytes.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&bytes)?)
}
pub trait WeatherProvider {
    fn url(&self, location: &Location) -> reqwest::Url;
    fn decode(&self, value: &Value, location: Location, now: u64) -> Result<View>;
}
pub struct OpenMeteo;
impl WeatherProvider for OpenMeteo {
    fn url(&self, l: &Location) -> reqwest::Url {
        let mut u = reqwest::Url::parse("https://api.open-meteo.com/v1/forecast").unwrap();
        u.query_pairs_mut().extend_pairs([("latitude",l.latitude.to_string()),("longitude",l.longitude.to_string()),("current","temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m".into()),("hourly","temperature_2m,precipitation_probability,weather_code".into()),("daily","weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max".into()),("forecast_days","5".into()),("timeformat","unixtime".into()),("timezone","auto".into())]);
        u
    }
    fn decode(&self, v: &Value, l: Location, now: u64) -> Result<View> {
        parse(v, l, now)
    }
}
pub async fn search(query: &str) -> Result<Vec<Location>> {
    ensure!(
        (2..=80).contains(&query.chars().count()) && !query.chars().any(char::is_control),
        "enter a city name (2..80 characters)"
    );
    let mut url = reqwest::Url::parse("https://geocoding-api.open-meteo.com/v1/search")?;
    url.query_pairs_mut().extend_pairs([
        ("name", query),
        ("count", "8"),
        ("language", "en"),
        ("format", "json"),
    ]);
    let v = fetch(url).await?;
    let mut out = Vec::new();
    for item in v["results"].as_array().into_iter().flatten().take(8) {
        let name = format!(
            "{}, {}",
            item["name"].as_str().unwrap_or(""),
            item["country"].as_str().unwrap_or("")
        );
        let l = Location {
            name,
            latitude: item["latitude"].as_f64().unwrap_or(f64::NAN),
            longitude: item["longitude"].as_f64().unwrap_or(f64::NAN),
        };
        if l.validate().is_ok() {
            out.push(l);
        }
    }
    Ok(out)
}
fn cache_path() -> std::path::PathBuf {
    crate::history::data_dir().join("weather-cache.json")
}
fn cached(location: &Location) -> Option<View> {
    let path = cache_path();
    if std::fs::metadata(&path).ok()?.len() > 1024 * 1024 {
        return None;
    }
    let mut v: View = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    if &v.location != location
        || v.hours.len() > 12
        || v.days.len() > 7
        || v.location.validate().is_err()
        || crate::history::now().saturating_sub(v.updated) > 48 * 3600
    {
        return None;
    }
    v.stale = true;
    Some(v)
}
fn save(v: &View) -> Result<()> {
    crate::developer::private_write(&cache_path(), &serde_json::to_vec(v)?)
}
#[derive(Default)]
pub struct State {
    pub view: Option<View>,
    pub error: String,
    pub last_attempt: Option<Instant>,
    pub search_at: Option<Instant>,
}
impl State {
    fn accept(&mut self, result: Result<View>, settings: &Settings) -> bool {
        match result {
            Ok(mut v) => {
                v.notices = notices(&v, settings);
                self.view = Some(v);
                self.error.clear();
                true
            }
            Err(_) => {
                self.error = "Weather unavailable; check connection and retry later".into();
                if let Some(v) = &mut self.view {
                    v.stale = true;
                    v.error = self.error.clone();
                }
                false
            }
        }
    }
    pub fn display(&self) -> Value {
        json!({"weather":self.view,"error":self.error,"official_warnings_supported":false})
    }
}
pub fn notices(v: &View, s: &Settings) -> Vec<String> {
    let mut out = Vec::new();
    if s.rain_notices && v.hours.iter().take(3).any(|h| h.rain >= 60.0) {
        out.push("Forecast notice: rain likely within the next 3 hours".into());
    }
    if s.change_notices
        && v.hours
            .iter()
            .take(6)
            .any(|h| (h.temperature - v.temperature).abs() >= 8.0)
    {
        out.push("Forecast notice: temperature change of at least 8°C within 6 hours".into());
    }
    out
}
pub fn spawn(
    state: Arc<Mutex<State>>,
    engine: Arc<Mutex<Engine>>,
    config: Arc<Mutex<Config>>,
    wake: Arc<Notify>,
    refresh: Arc<Notify>,
) {
    tokio::spawn(async move {
        let mut key = String::new();
        let mut due = Instant::now();
        let mut failures = 0u32;
        let notice_path = crate::history::data_dir().join("weather-notice.txt");
        let mut alerted = std::fs::read_to_string(&notice_path).unwrap_or_default();
        let bus = zbus::Connection::session().await.ok();
        loop {
            let cfg = config.lock().await.clone();
            let settings = cfg.weather;
            let next_key = serde_json::to_string(&settings).unwrap_or_default();
            if key != next_key {
                key = next_key;
                due = Instant::now();
                failures = 0;
                let mut st = state.lock().await;
                st.view = settings.location.as_ref().and_then(cached);
                if let Some(v) = &mut st.view {
                    let age = crate::history::now().saturating_sub(v.updated);
                    if age < settings.refresh_minutes * 60 {
                        v.stale = false;
                        due = Instant::now()
                            + Duration::from_secs(settings.refresh_minutes * 60 - age);
                    }
                }
                st.error.clear();
            }
            if settings.enabled && settings.location.is_some() && Instant::now() >= due {
                let location = settings.location.clone().unwrap();
                let mut st = state.lock().await;
                let permitted = st
                    .last_attempt
                    .is_none_or(|t| t.elapsed() >= Duration::from_secs(60));
                if permitted {
                    st.last_attempt = Some(Instant::now());
                }
                drop(st);
                if permitted {
                    let result = fetch(OpenMeteo.url(&location)).await.and_then(|v| {
                        OpenMeteo.decode(&v, location.clone(), crate::history::now())
                    });
                    let current = config.lock().await.weather.clone();
                    if current.location == Some(location) && current.enabled {
                        let mut st = state.lock().await;
                        if st.accept(result, &settings) {
                            if let Some(v) = &st.view {
                                let _ = save(v);
                            }
                            failures = 0;
                        } else {
                            failures = (failures + 1).min(5);
                        }
                    }
                    due = Instant::now()
                        + Duration::from_secs(if failures == 0 {
                            settings.refresh_minutes * 60
                        } else {
                            (60u64 << failures).min(1800)
                        });
                } else {
                    due = Instant::now() + Duration::from_secs(60);
                }
            }
            let mut st = state.lock().await;
            if st
                .view
                .as_ref()
                .is_some_and(|v| crate::history::now().saturating_sub(v.updated) > 48 * 3600)
            {
                st.view = None;
                st.error = "Cached forecast expired; connect to refresh weather".into();
            }
            if let Some(v) = &mut st.view {
                v.units = settings.units.clone();
                if crate::history::now().saturating_sub(v.updated) > settings.refresh_minutes * 120
                {
                    v.stale = true;
                }
            }
            let mut e = engine.lock().await;
            e.providers.remove("weather");
            if settings.enabled {
                let mut a = Activity::new("weather", "Weather");
                a.source = "Open-Meteo".into();
                a.controls = vec!["refresh".into()];
                a.weather = st.view.clone();
                if let Some(v) = &st.view {
                    a.title = format!(
                        "{:.0}°{} · {}",
                        temp(v.temperature, &v.units),
                        if v.units == "fahrenheit" { "F" } else { "C" },
                        condition(v.code)
                    );
                    a.description = format!(
                        "{}{}",
                        v.location.name,
                        if v.stale { " · Cached / stale" } else { "" }
                    );
                    a.icon = icon(v.code).into();
                    let fingerprint = format!(
                        "{}:{}:{}",
                        crate::history::now() / 21600,
                        v.location.name,
                        v.notices.join("|")
                    );
                    if !v.stale && !v.notices.is_empty() && fingerprint != alerted {
                        alerted = fingerprint;
                        let _ = crate::developer::private_write(&notice_path, alerted.as_bytes());
                        if let Some(bus) = &bus {
                            let bus = bus.clone();
                            let message = v.notices.join("; ");
                            tokio::spawn(async move {
                                crate::developer::notify(
                                    &bus,
                                    "Weather forecast notice",
                                    &message,
                                    1,
                                )
                                .await;
                            });
                        }
                    }
                } else {
                    a.status = "warning".into();
                    a.description = if settings.location.is_none() {
                        "Choose a city in Preferences".into()
                    } else {
                        st.error.clone()
                    };
                }
                e.providers.insert(a.id.clone(), a);
            }
            drop(e);
            drop(st);
            wake.notify_one();
            tokio::select! {_=tokio::time::sleep(Duration::from_secs(5))=>{},_=refresh.notified()=>{due=Instant::now();}}
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn location_units_and_notices() {
        assert!(
            Location {
                name: "Bad".into(),
                latitude: 91.,
                longitude: 0.
            }
            .validate()
            .is_err()
        );
        assert_eq!(temp(0., "fahrenheit"), 32.);
        assert_eq!(temp(10., "celsius"), 10.);
        assert!(
            Settings {
                refresh_minutes: 1,
                ..Default::default()
            }
            .validate()
            .is_err()
        );
    }
    #[test]
    fn reject_incomplete_remote() {
        assert!(
            parse(
                &json!({}),
                Location {
                    name: "Test".into(),
                    latitude: 0.,
                    longitude: 0.
                },
                1000
            )
            .is_err()
        );
    }
}
#[cfg(test)]
mod forecast_tests {
    use super::*;
    fn fixture() -> Value {
        json!({"current":{"time":1000,"temperature_2m":20,"apparent_temperature":19,"relative_humidity_2m":50,"wind_speed_10m":12,"weather_code":3},"hourly":{"time":[1000,4600],"temperature_2m":[20,30],"precipitation_probability":[70,10],"weather_code":[61,3]},"daily":{"time":[1000],"temperature_2m_min":[17],"temperature_2m_max":[30],"precipitation_probability_max":[70],"weather_code":[61]}})
    }
    #[test]
    fn successful_forecast_and_alert_categories() {
        let v = parse(
            &fixture(),
            Location {
                name: "Test".into(),
                latitude: 30.,
                longitude: 31.,
            },
            1000,
        )
        .unwrap();
        assert_eq!(v.hours.len(), 2);
        assert_eq!(notices(&v, &Settings::default()).len(), 1);
        assert_eq!(
            notices(
                &v,
                &Settings {
                    change_notices: true,
                    ..Default::default()
                }
            )
            .len(),
            2
        );
        assert!(
            notices(
                &v,
                &Settings {
                    rain_notices: false,
                    ..Default::default()
                }
            )
            .is_empty()
        );
    }
    #[test]
    fn stale_null_and_oversized_forecasts_rejected() {
        let l = Location {
            name: "Test".into(),
            latitude: 0.,
            longitude: 0.,
        };
        assert!(parse(&fixture(), l.clone(), 100000).is_err());
        let mut v = fixture();
        v["hourly"]["temperature_2m"][0] = Value::Null;
        assert!(parse(&v, l.clone(), 1000).is_err());
        v = fixture();
        v["current"]["relative_humidity_2m"] = json!(200);
        assert!(parse(&v, l, 1000).is_err());
    }
}

#[cfg(test)]
mod transport_tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    async fn server(status: &str, body: &str, length: usize) -> reqwest::Url {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}"
        );
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut b = [0u8; 4096];
            let _ = stream.read(&mut b).await;
            let _ = stream.write_all(response.as_bytes()).await;
        });
        reqwest::Url::parse(&format!("http://{address}/test")).unwrap()
    }
    #[tokio::test]
    async fn bounded_http_success_failure_and_invalid_json() {
        let body = r#"{"ok":true}"#;
        let url = server("200 OK", body, body.len()).await;
        assert_eq!(fetch(url).await.unwrap()["ok"], true);
        assert!(fetch(server("503 Unavailable", "", 0).await).await.is_err());
        assert!(fetch(server("200 OK", "not-json", 8).await).await.is_err());
        assert!(
            fetch(server("200 OK", "", 2 * 1024 * 1024).await)
                .await
                .is_err()
        );
    }
    #[test]
    fn offline_fallback_marks_cache_stale() {
        let mut s = State::default();
        assert!(!s.accept(Err(anyhow::anyhow!("offline")), &Settings::default()));
        assert!(s.view.is_none());
        assert!(!s.error.is_empty());
        let payload = serde_json::json!({"location":{"name":"Test","latitude":0,"longitude":0},"updated":1000,"temperature":10,"feels_like":8,"humidity":50,"wind":4,"code":0,"hours":[],"days":[],"stale":false,"error":"","notices":[],"units":"celsius","attribution":"test"});
        let v: View = serde_json::from_value(payload).unwrap();
        assert!(s.accept(Ok(v), &Settings::default()));
        assert!(!s.accept(Err(anyhow::anyhow!("offline")), &Settings::default()));
        assert!(s.view.as_ref().unwrap().stale);
        assert_eq!(s.view.as_ref().unwrap().temperature, 10.);
    }
}
