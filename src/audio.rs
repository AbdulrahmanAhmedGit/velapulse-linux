//! Fixed-argument, bounded WirePlumber tools; no shell or privileged changes.
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::{process::Stdio, time::Duration};
use tokio::io::AsyncReadExt;
async fn output(program: &str, args: &[&str]) -> Result<String> {
    tokio::time::timeout(Duration::from_secs(3), async {
        let mut child = tokio::process::Command::new(program)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()?;
        let mut bytes = Vec::new();
        child
            .stdout
            .take()
            .unwrap()
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .await?;
        ensure!(
            bytes.len() <= 2 * 1024 * 1024,
            "audio response exceeds limit"
        );
        ensure!(
            child.wait().await?.success(),
            "audio tool rejected the operation"
        );
        Ok(String::from_utf8(bytes)?)
    })
    .await?
}
pub async fn snapshot() -> Result<Value> {
    let dump: Value = serde_json::from_str(&output("pw-dump", &[]).await?)?;
    let items = dump
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("invalid PipeWire state"))?;
    let mut devices = Vec::new();
    let mut default = String::new();
    for item in items {
        if let Some(props) = item.pointer("/info/props")
            && props["media.class"] == "Audio/Sink"
            && let Some(id) = item["id"].as_u64()
        {
            devices.push(json!({"id":id,"name":props["node.name"].as_str().unwrap_or(""),"label":props["node.description"].as_str().unwrap_or("Audio output").chars().take(120).collect::<String>()}));
        }
        if let Some(metadata) = item["metadata"].as_array() {
            for entry in metadata {
                if entry["key"] == "default.audio.sink" {
                    let value = entry["value"]
                        .as_str()
                        .and_then(|s| serde_json::from_str::<Value>(s).ok())
                        .unwrap_or_else(|| entry["value"].clone());
                    default = value["name"].as_str().unwrap_or("").into();
                }
            }
        }
    }
    ensure!(!devices.is_empty(), "No audio output devices available");
    let volume = output("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"]).await?;
    let level = volume
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|v| v.is_finite())
        .ok_or_else(|| anyhow::anyhow!("invalid volume response"))?;
    Ok(
        json!({"available":true,"devices":devices,"default":default,"volume":level.clamp(0.0,1.0),"muted":volume.contains("MUTED"),"routing":"Default for new streams; existing applications may keep their current route."}),
    )
}
pub async fn control(action: &str, value: &str) -> Result<Value> {
    match action {
        "volume" => {
            let v = value.parse::<f64>()?;
            ensure!(
                v.is_finite() && (0.0..=1.0).contains(&v),
                "volume must be 0..1"
            );
            output(
                "wpctl",
                &["set-volume", "@DEFAULT_AUDIO_SINK@", &format!("{v:.3}")],
            )
            .await?;
        }
        "mute" => {
            ensure!(["0", "1"].contains(&value), "mute must be 0 or 1");
            output("wpctl", &["set-mute", "@DEFAULT_AUDIO_SINK@", value]).await?;
        }
        "default" => {
            let id = value.parse::<u32>()?;
            let state = snapshot().await?;
            ensure!(
                state["devices"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|d| d["id"] == id),
                "output device is no longer available"
            );
            output("wpctl", &["set-default", &id.to_string()]).await?;
        }
        _ => anyhow::bail!("unsupported audio action"),
    }
    snapshot().await
}
