//! User-selected LRC only. No network lyrics or bundled collections.
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Line {
    pub seconds: f64,
    pub text: String,
}
pub fn parse(text: &str) -> Result<Vec<Line>> {
    ensure!(text.len() <= 512 * 1024, "LRC exceeds 512 KiB");
    let offset = text
        .lines()
        .find_map(|s| {
            s.trim()
                .strip_prefix("[offset:")?
                .strip_suffix(']')?
                .parse::<f64>()
                .ok()
        })
        .unwrap_or(0.0)
        .clamp(-60000.0, 60000.0)
        / 1000.0;
    let mut lines = Vec::new();
    for raw in text.lines().take(10000) {
        let mut rest = raw.trim_start_matches('\u{feff}').trim();
        let mut stamps = Vec::new();
        while let Some((tag, tail)) = rest.strip_prefix('[').and_then(|s| s.split_once(']')) {
            if let Some((minutes, seconds)) = tag.split_once(':')
                && let (Ok(m), Ok(s)) = (minutes.parse::<u32>(), seconds.parse::<f64>())
                && s.is_finite()
                && (0.0..60.0).contains(&s)
                && m < 1440
            {
                stamps.push((m as f64 * 60.0 + s + offset).max(0.0));
            }
            rest = tail;
        }
        for seconds in stamps {
            lines.push(Line {
                seconds,
                text: rest.trim().chars().take(512).collect(),
            });
        }
        ensure!(lines.len() <= 2000, "LRC line limit exceeded");
    }
    lines.sort_by(|a, b| a.seconds.total_cmp(&b.seconds));
    ensure!(!lines.is_empty(), "No timestamped LRC lines found");
    Ok(lines)
}
pub fn dir() -> std::path::PathBuf {
    crate::history::data_dir().join("lyrics")
}
pub async fn get(key: &str) -> Vec<Line> {
    let Ok(bytes) = tokio::fs::read(dir().join(format!("{key}.json"))).await else {
        return vec![];
    };
    if bytes.len() > 2 * 1024 * 1024 {
        return vec![];
    }
    serde_json::from_slice(&bytes).unwrap_or_default()
}
static IMPORT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
pub async fn import(key: &str, uri: &str) -> Result<()> {
    use tokio::io::AsyncReadExt;
    ensure!(uri.len() <= 4096, "LRC URI too long");
    let url = url::Url::parse(uri)?;
    ensure!(
        url.scheme() == "file" && (url.host_str().is_none() || url.host_str() == Some("localhost")),
        "Choose a local LRC file"
    );
    let path = url
        .to_file_path()
        .map_err(|_| anyhow::anyhow!("invalid local LRC file"))?;
    let meta = tokio::fs::metadata(&path).await?;
    ensure!(
        meta.is_file() && meta.len() <= 512 * 1024,
        "LRC file too large"
    );
    let mut bytes = Vec::new();
    tokio::fs::File::open(path)
        .await?
        .take(512 * 1024 + 1)
        .read_to_end(&mut bytes)
        .await?;
    let lines = parse(std::str::from_utf8(&bytes)?)?;
    tokio::fs::create_dir_all(dir()).await?;
    let file = dir().join(format!("{key}.json"));
    let _write = IMPORT_LOCK.lock().await;
    let temp = file.with_extension("tmp");
    use tokio::io::AsyncWriteExt;
    let mut output = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&temp)
        .await?;
    output.write_all(&serde_json::to_vec(&lines)?).await?;
    tokio::fs::rename(temp, file).await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timestamps_offsets_and_multiple_tags() {
        let l = parse(
            "[offset:-500]\n[ar:Test]\n[00:01.25][00:03.50] Original fixture line\n[00:02]Next",
        )
        .unwrap();
        assert_eq!(
            l.iter().map(|x| x.seconds).collect::<Vec<_>>(),
            vec![0.75, 1.5, 3.0]
        );
        assert_eq!(l[0].text, "Original fixture line");
        assert!(parse("[00:NaN]bad").is_err());
        assert!(parse("no timestamps").is_err());
    }
}
