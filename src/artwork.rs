//! Artwork is decoded off the UI thread and exposed only as bounded local PNGs.
use anyhow::{Result, ensure};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::{net::IpAddr, path::PathBuf, time::Duration};
use url::Url;
static REMOTE: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, (String, String)>>,
> = std::sync::LazyLock::new(Default::default);
static LOAD_LIMIT: std::sync::LazyLock<std::sync::Arc<tokio::sync::Semaphore>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Semaphore::new(2)));
const MAX_BYTES: usize = 8 * 1024 * 1024;
pub fn key(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
pub fn cache_dir() -> PathBuf {
    std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".cache")
        })
        .join("velapulse/artwork")
}
pub fn public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let [a, b, c, _] = v.octets();
            !v.is_private()
                && !v.is_loopback()
                && !v.is_link_local()
                && !v.is_multicast()
                && !v.is_unspecified()
                && !v.is_broadcast()
                && a != 0
                && a < 224
                && !(a == 100 && (64..128).contains(&b))
                && !(a == 192 && b == 0)
                && !(a == 198 && (b == 18 || b == 19 || b == 51 && c == 100))
                && !(a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(v) => {
            let s = v.segments();
            s[0] & 0xe000 == 0x2000
                && s[0] != 0x2002
                && !(s[0] == 0x2001 && (s[1] < 0x200 || s[1] == 0xdb8))
        }
    }
}
pub async fn load(uri: &str) -> Result<(String, String)> {
    ensure!(uri.len() <= 2048, "artwork URI too long");
    let url = Url::parse(uri)?;
    if url.scheme() == "https"
        && let Some(cached) = REMOTE.lock().unwrap().get(uri).cloned()
        && Url::parse(&cached.0)
            .ok()
            .and_then(|u| u.to_file_path().ok())
            .is_some_and(|p| p.is_file())
    {
        return Ok(cached);
    }
    let permit = LOAD_LIMIT.clone().acquire_owned().await?;
    let bytes = if url.scheme() == "file" {
        ensure!(
            url.host_str().is_none() || url.host_str() == Some("localhost"),
            "remote file host denied"
        );
        let path = url
            .to_file_path()
            .map_err(|_| anyhow::anyhow!("invalid local artwork"))?;
        let meta = tokio::fs::metadata(&path).await?;
        ensure!(
            meta.is_file() && meta.len() <= MAX_BYTES as u64,
            "artwork file exceeds limit"
        );
        use tokio::io::AsyncReadExt;
        let mut bytes = Vec::new();
        tokio::fs::File::open(path)
            .await?
            .take(MAX_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .await?;
        bytes
    } else {
        ensure!(
            url.scheme() == "https"
                && url.username().is_empty()
                && url.password().is_none()
                && url.port().is_none_or(|p| p == 443),
            "only public HTTPS artwork is supported"
        );
        let host = url
            .host_str()
            .ok_or_else(|| anyhow::anyhow!("missing artwork host"))?;
        let addresses =
            tokio::time::timeout(Duration::from_secs(2), tokio::net::lookup_host((host, 443)))
                .await??
                .take(16)
                .collect::<Vec<_>>();
        ensure!(
            !addresses.is_empty() && addresses.iter().all(|a| public(a.ip())),
            "private/reserved artwork destination denied"
        );
        // Pin the checked addresses; disable redirects, proxies and DNS rebinding.
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host, &addresses)
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(8))
            .build()?;
        let response = client.get(url.clone()).send().await?;
        ensure!(response.status().is_success(), "artwork HTTP failure");
        ensure!(
            response
                .content_length()
                .is_none_or(|l| l <= MAX_BYTES as u64),
            "artwork response exceeds limit"
        );
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            ensure!(
                bytes.len() + chunk.len() <= MAX_BYTES,
                "artwork payload exceeds limit"
            );
            bytes.extend_from_slice(&chunk);
        }
        bytes
    };
    ensure!(bytes.len() <= MAX_BYTES, "artwork exceeds limit");
    let result = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        decode(bytes)
    })
    .await??;
    if url.scheme() == "https" {
        let mut cache = REMOTE.lock().unwrap();
        if cache.len() >= 128 {
            cache.clear();
        }
        cache.insert(uri.into(), result.clone());
    }
    Ok(result)
}
fn decode(bytes: Vec<u8>) -> Result<(String, String)> {
    use image::{ImageReader, Limits};
    let mut reader = ImageReader::new(std::io::Cursor::new(&bytes)).with_guessed_format()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode()?.thumbnail(768, 768).to_rgba8();
    let sample = image::imageops::resize(&image, 24, 24, image::imageops::FilterType::Triangle);
    let (mut r, mut g, mut b, mut count) = (0u64, 0u64, 0u64, 0u64);
    for p in sample.pixels().filter(|p| p[3] > 128) {
        r += p[0] as u64;
        g += p[1] as u64;
        b += p[2] as u64;
        count += 1;
    }
    let color = if count > 0 {
        format!(
            "#{:02x}{:02x}{:02x}",
            r.checked_div(count).unwrap_or(118),
            g.checked_div(count).unwrap_or(101),
            b.checked_div(count).unwrap_or(184)
        )
    } else {
        "#7665b8".into()
    };
    let dir = cache_dir();
    std::fs::create_dir_all(&dir)?;
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
    // Content addressing deduplicates repeated metadata and never trusts URI filenames.
    let path = dir.join(format!("{:x}.png", Sha256::digest(&bytes)));
    if !path.exists() {
        let temp = path.with_extension(format!(
            "{}.tmp",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_nanos()
        ));
        image.save_with_format(&temp, image::ImageFormat::Png)?;
        std::fs::rename(temp, &path)?;
    }
    // Bound on-disk cache to 128 normalized images; keep the newly written image.
    let mut entries = std::fs::read_dir(&dir)?
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|s| s == "png"))
        .collect::<Vec<_>>();
    entries.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
    let excess = entries.len().saturating_sub(128);
    for e in entries.into_iter().take(excess) {
        if e.path() != path {
            let _ = std::fs::remove_file(e.path());
        }
    }
    Ok((
        Url::from_file_path(path)
            .map_err(|_| anyhow::anyhow!("invalid cache path"))?
            .to_string(),
        color,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deny_private_destinations() {
        for value in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "192.0.2.1",
            "198.18.0.1",
            "::1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
        ] {
            assert!(!public(value.parse().unwrap()), "{value}");
        }
        assert!(public("1.1.1.1".parse().unwrap()));
    }
    #[tokio::test]
    async fn deny_schemes_and_credentials() {
        for value in [
            "http://example.com/x",
            "https://user:pass@example.com/x",
            "https://127.0.0.1/x",
            "file://remote/a",
        ] {
            assert!(load(value).await.is_err());
        }
    }
    #[tokio::test]
    #[ignore = "requires an explicitly chosen public HTTPS test image"]
    async fn public_https_artwork() {
        let uri = std::env::var("VELAPULSE_TEST_REMOTE_ART").expect("Choose a public HTTPS image");
        let (path, color) = load(&uri)
            .await
            .expect("Remote image fetch and normalization");
        assert!(path.starts_with("file://") && path.ends_with(".png"));
        assert_eq!(color.len(), 7);
        let cached = load(&uri).await.unwrap();
        assert_eq!(cached, (path, color));
    }
}
